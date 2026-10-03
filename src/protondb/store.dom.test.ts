import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ executeInTab: vi.fn(), fetchNoCors: vi.fn() }));
vi.mock("@decky/ui", () => ({
  findModuleExport: vi.fn(),
  Router: { WindowStore: { GamepadUIMainWindowInstance: {} } },
}));
vi.mock("./controller", () => ({
  protonDbBadgeController: {
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    getRating: vi.fn(),
    subscribeRating: vi.fn(),
  },
}));
vi.mock("./Icon", () => ({
  PROTONDB_COLORS: {
    platinum: "#b4c7dc",
    gold: "#cfb53b",
    silver: "#a6a6a6",
    bronze: "#cd7f32",
    borked: "#ff0000",
  },
  protonDbTierLabel: (tier: string) => tier.charAt(0).toUpperCase() + tier.slice(1),
}));

import { executeInTab, fetchNoCors } from "@decky/api";
import { findModuleExport, Router } from "@decky/ui";
import { protonDbBadgeController } from "./controller";
import { buildStoreBadgeScript, installProtonDbStoreBadge, type StoreBadgePayload } from "./store";

type MutationFixture = { addedNodes?: FakeElement[]; removedNodes?: FakeElement[] };
type MutationCallback = (records: MutationFixture[]) => void;

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly style = {
    properties: new Map<string, string>(),
    setProperty: (name: string, value: string) => this.style.properties.set(name, value),
  };
  parentNode: FakeElement | null = null;
  id = "";
  className = "";
  href = "";
  target = "";
  rel = "";
  title = "";
  private ownText = "";

  constructor(readonly nodeName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) this.appendChild(child);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    this.ownText = "";
    this.append(...children);
  }

  removeChild(child: FakeElement): FakeElement {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    this.ownText = value;
  }
}

class FakeDocument {
  readonly documentElement = new FakeElement("HTML");
  readonly head = new FakeElement("HEAD");
  body = new FakeElement("BODY");
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor() {
    this.documentElement.append(this.head, this.body);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toUpperCase());
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  getElementById(id: string): FakeElement | null {
    const visit = (element: FakeElement): FakeElement | null => {
      if (element.id === id) return element;
      for (const child of element.children) {
        const match = visit(child);
        if (match) return match;
      }
      return null;
    };
    return visit(this.documentElement);
  }

  addEventListener(name: string, callback: () => void): void {
    const listeners = this.listeners.get(name) ?? new Set<() => void>();
    listeners.add(callback);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, callback: () => void): void {
    this.listeners.get(name)?.delete(callback);
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  private connected = false;
  private callback: MutationCallback;
  target: FakeElement | null = null;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(target: FakeElement): void {
    this.target = target;
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  notify(record: MutationFixture): void {
    if (this.connected) this.callback([record]);
  }
}

type FakeLocation = {
  protocol: string;
  port: string;
  hostname: string;
  pathname: string;
  href: string;
  assign: (url: string) => void;
};

type BrowserHarness = {
  window: {
    location: FakeLocation;
    history: {
      pushState: (state: unknown, title: string, url?: string) => void;
      replaceState: (state: unknown, title: string, url?: string) => void;
    };
    addEventListener: (name: string, callback: () => void) => void;
    removeEventListener: (name: string, callback: () => void) => void;
    emit: (name: string) => void;
  };
  document: FakeDocument;
};

const createHarness = (initialUrl = "https://store.steampowered.com/app/12345/"): BrowserHarness => {
  let parsedUrl = new URL(initialUrl);
  const location: FakeLocation = {
    get protocol() { return parsedUrl.protocol; },
    get port() { return parsedUrl.port; },
    get hostname() { return parsedUrl.hostname; },
    get pathname() { return parsedUrl.pathname; },
    get href() { return parsedUrl.href; },
    assign: (url: string) => { parsedUrl = new URL(url, parsedUrl); },
  };
  const listeners = new Map<string, Set<() => void>>();
  const history = {
    pushState: (_state: unknown, _title: string, url?: string) => { if (url) location.assign(url); },
    replaceState: (_state: unknown, _title: string, url?: string) => { if (url) location.assign(url); },
  };
  const window = {
    location,
    history,
    addEventListener: (name: string, callback: () => void) => {
      const callbacks = listeners.get(name) ?? new Set<() => void>();
      callbacks.add(callback);
      listeners.set(name, callbacks);
    },
    removeEventListener: (name: string, callback: () => void) => listeners.get(name)?.delete(callback),
    emit: (name: string) => {
      for (const callback of Array.from(listeners.get(name) ?? [])) callback();
    },
  };
  FakeMutationObserver.instances = [];
  return { window, document: new FakeDocument() };
};

const installScript = (harness: BrowserHarness, payload: StoreBadgePayload | null): unknown =>
  runInNewContext(buildStoreBadgeScript(payload), {
    window: harness.window,
    document: harness.document,
    MutationObserver: FakeMutationObserver,
  });

const badgeIn = (document: FakeDocument): FakeElement | null =>
  document.getElementById("decky-metadata-protondb-store-badge");

const styleIn = (document: FakeDocument): FakeElement | null =>
  document.getElementById("decky-metadata-protondb-store-badge-style");

afterEach(() => vi.clearAllMocks());

describe("ProtonDB Store badge DOM", () => {
  it("renders one attributed, tier-labeled ProtonDB link and updates it idempotently", () => {
    const harness = createHarness();
    installScript(harness, { steamAppId: 12345, tier: "platinum" });
    const badge = badgeIn(harness.document);
    expect(badge).not.toBeNull();
    expect(badge?.href).toBe("https://www.protondb.com/app/12345");
    expect(badge?.getAttribute("aria-label")).toBe("ProtonDB rating: Platinum");
    expect(badge?.children[0]?.nodeName).toBe("svg");
    expect(badge?.style.properties.get("--protondb-tier-color")).toBe("#b4c7dc");

    installScript(harness, { steamAppId: 12345, tier: "gold" });
    installScript(harness, { steamAppId: 12345, tier: "gold" });
    expect(harness.document.body.children.filter((child) =>
      child.id === "decky-metadata-protondb-store-badge",
    )).toHaveLength(1);
    expect(badgeIn(harness.document)?.getAttribute("aria-label")).toBe("ProtonDB rating: Gold");
    expect(badgeIn(harness.document)?.style.properties.get("--protondb-tier-color")).toBe("#cfb53b");
  });

  it("refuses a mismatched app and cleans up when Store history leaves the current app", () => {
    const wrongApp = createHarness();
    installScript(wrongApp, { steamAppId: 999, tier: "silver" });
    expect(badgeIn(wrongApp.document)).toBeNull();
    expect(styleIn(wrongApp.document)).toBeNull();

    const wrongOrigin = createHarness("https://example.com/app/12345/");
    installScript(wrongOrigin, { steamAppId: 12345, tier: "silver" });
    expect(badgeIn(wrongOrigin.document)).toBeNull();
    expect(styleIn(wrongOrigin.document)).toBeNull();

    const harness = createHarness();
    const originalPushState = harness.window.history.pushState;
    installScript(harness, { steamAppId: 12345, tier: "bronze" });
    harness.window.history.pushState({}, "", "https://store.steampowered.com/app/67890/");
    expect(badgeIn(harness.document)).toBeNull();
    expect(styleIn(harness.document)).toBeNull();
    expect(harness.window.history.pushState).toBe(originalPushState);
  });

  it("reparents its badge after Steam replaces the document body and disposes on pagehide", () => {
    const harness = createHarness();
    installScript(harness, { steamAppId: 12345, tier: "borked" });
    const previousBody = harness.document.body;
    const nextBody = new FakeElement("BODY");
    harness.document.documentElement.removeChild(previousBody);
    harness.document.documentElement.appendChild(nextBody);
    harness.document.body = nextBody;
    const rootObserver = FakeMutationObserver.instances.find((observer) =>
      observer.target === harness.document.documentElement,
    );
    rootObserver?.notify({ addedNodes: [nextBody], removedNodes: [previousBody] });
    expect(badgeIn(harness.document)).not.toBeNull();
    expect(badgeIn(harness.document)?.parentNode).toBe(nextBody);

    harness.window.emit("pagehide");
    expect(badgeIn(harness.document)).toBeNull();
    expect(styleIn(harness.document)).toBeNull();
  });

  it("removes only its own markup when the host sends a disposal payload", () => {
    const harness = createHarness();
    installScript(harness, { steamAppId: 12345, tier: "silver" });
    installScript(harness, null);
    expect(badgeIn(harness.document)).toBeNull();
    expect(styleIn(harness.document)).toBeNull();
  });

  it("shows and removes the Store badge with main-window navigation even when temp history is one route behind", async () => {
    const harness = createHarness();
    const currentListeners = new Set<() => void>();
    const staleListeners = new Set<() => void>();
    const mainHistory = {
      location: { pathname: "/library/home" },
      listen: (listener: () => void) => {
        currentListeners.add(listener);
        return () => currentListeners.delete(listener);
      },
    };
    const staleHistory = {
      location: { pathname: "/library/home" },
      listen: (listener: () => void) => {
        staleListeners.add(listener);
        return () => staleListeners.delete(listener);
      },
    };
    Object.assign(Router.WindowStore!.GamepadUIMainWindowInstance!, { m_history: mainHistory });
    vi.mocked(findModuleExport).mockReturnValue({ m_history: staleHistory });
    vi.mocked(protonDbBadgeController.getSnapshot).mockReturnValue({
      settingsLoaded: true, busy: false, settingsError: "",
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: true,
      settings: {
        enabled: true, home: true, library: true, gameView: true, store: true,
        focusOnly: false, coverPosition: "bottom-left",
      },
    });
    vi.mocked(protonDbBadgeController.subscribe).mockReturnValue(() => undefined);
    vi.mocked(protonDbBadgeController.subscribeRating).mockReturnValue(() => undefined);
    vi.mocked(protonDbBadgeController.getRating).mockReturnValue({
      tier: "gold", status: "ready", updatedAt: 1,
    });
    vi.mocked(fetchNoCors).mockImplementation(async () => new Response(JSON.stringify([{
      type: "page", id: "store-target", title: "Test game on Steam",
      url: "https://store.steampowered.com/app/12345/",
    }])));
    vi.mocked(executeInTab).mockImplementation(async (_title, _async, script) => ({
      success: true,
      result: runInNewContext(script, {
        window: harness.window, document: harness.document, MutationObserver: FakeMutationObserver,
      }),
    }));
    const stop = installProtonDbStoreBadge();
    try {
      expect(badgeIn(harness.document)).toBeNull();
      mainHistory.location.pathname = "/steamweb";
      staleListeners.forEach(listener => listener());
      currentListeners.forEach(listener => listener());
      await vi.waitFor(() => {
        expect(badgeIn(harness.document)?.href).toBe("https://www.protondb.com/app/12345");
        expect(badgeIn(harness.document)?.getAttribute("data-protondb-tier")).toBe("gold");
      });
      staleHistory.location.pathname = "/steamweb";
      mainHistory.location.pathname = "/library/home";
      staleListeners.forEach(listener => listener());
      currentListeners.forEach(listener => listener());
      await vi.waitFor(() => expect(badgeIn(harness.document)).toBeNull());
    } finally {
      stop();
    }
  });
});
