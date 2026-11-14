import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ executeInTab: vi.fn(), fetchNoCors: vi.fn() }));
vi.mock("@decky/ui", () => ({
  Router: { WindowStore: { GamepadUIMainWindowInstance: {} } },
}));
vi.mock("./hltb/gameView", () => ({
  hltbController: { getSnapshot: vi.fn(), subscribe: vi.fn() },
}));
vi.mock("./hltb/store", () => ({
  hltbStore: { view: vi.fn(), request: vi.fn(), subscribe: vi.fn() },
}));
vi.mock("./steam/core", () => ({ getNativeOverview: vi.fn() }));
vi.mock("./protondb/controller", () => ({
  protonDbBadgeController: {
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    getRating: vi.fn(),
    subscribeRating: vi.fn(),
  },
}));
vi.mock("./protondb/Icon", () => ({
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
import { Router } from "@decky/ui";
import type { HltbEntry } from "./backend";
import type { HltbSnapshot } from "./hltb/controller";
import { hltbController } from "./hltb/gameView";
import { hltbStore } from "./hltb/store";
import { protonDbBadgeController, type ProtonDbBadgeSnapshot } from "./protondb/controller";
import { getNativeOverview } from "./steam/core";
import { buildStoreInfoRowScript, installStoreInfoRow, type StoreInfoRowPayload } from "./storeRow";
import type { ProtonDbBadgeSettings } from "./types";

const ROW_ID = "decky-metadata-store-info-row";
const STYLE_ID = "decky-metadata-store-info-row-style";
const LEGACY_BADGE_ID = "decky-metadata-protondb-store-badge";

type MutationFixture = { addedNodes?: FakeElement[]; removedNodes?: FakeElement[] };
type MutationCallback = (records: MutationFixture[]) => void;

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly style: {
    properties: Map<string, string>;
    setProperty: (name: string, value: string) => void;
    marginTop?: string;
  } = {
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

  get previousElementSibling(): FakeElement | null {
    const siblings = this.parentNode?.children;
    if (!siblings) return null;
    const index = siblings.indexOf(this);
    return index > 0 ? siblings[index - 1] ?? null : null;
  }

  appendChild(child: FakeElement): FakeElement {
    return this.insertBefore(child, null);
  }

  insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
    child.parentNode?.removeChild(child);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    child.parentNode = this;
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
    const callbacks = this.listeners.get(name) ?? new Set<() => void>();
    callbacks.add(callback);
    this.listeners.set(name, callbacks);
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
    getComputedStyle: (element: FakeElement) => { marginTop: string };
    ForceUpdateFocusElements: (element: FakeElement) => void;
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
    getComputedStyle: () => ({ marginTop: "8px" }),
    // Steam resolves the nav parent through the DOM, so record whether the row was attached when registered.
    ForceUpdateFocusElements: vi.fn((element: FakeElement) => { element.setAttribute("data-registered-attached", String(element.parentNode !== null)); }),
  };
  FakeMutationObserver.instances = [];
  return { window, document: new FakeDocument() };
};

const runScript = (harness: BrowserHarness, script: string): unknown =>
  runInNewContext(script, {
    window: harness.window,
    document: harness.document,
    MutationObserver: FakeMutationObserver,
  });

const installScript = (harness: BrowserHarness, payload: StoreInfoRowPayload | null): unknown =>
  runScript(harness, buildStoreInfoRowScript(payload));

const rowIn = (document: FakeDocument): FakeElement | null => document.getElementById(ROW_ID);
const styleIn = (document: FakeDocument): FakeElement | null => document.getElementById(STYLE_ID);

const addAnchor = (harness: BrowserHarness): FakeElement => {
  const anchor = new FakeElement("DIV");
  anchor.id = "summaryBarTop";
  harness.document.body.appendChild(anchor);
  return anchor;
};

const hltbCard = () => ({
  hltbId: 7231,
  items: [
    { value: "12.0 h", label: "Main Story" },
    { value: "18.5 h", label: "Main + Extras" },
  ],
});

const protonDbCard = () => ({ tier: "gold" as const, color: "#cfb53b", label: "Gold" });

const rowPayload = (changes: Partial<StoreInfoRowPayload> = {}): StoreInfoRowPayload => ({
  steamAppId: 12345,
  hltb: hltbCard(),
  protondb: protonDbCard(),
  ...changes,
});

const hltbEntry = (changes: Partial<HltbEntry> = {}): HltbEntry => ({
  status: "matched",
  hltb_id: 7231,
  game_name: "Portal 2",
  stats: { main: 43_200, plus: 66_600, complete: 79_200, all: 100_800 },
  steam_appid_used: 12345,
  title_used: "Portal 2",
  pinned_id_used: null,
  fetched_at: Date.now(),
  ...changes,
});

const hltbSnapshot = (
  settings: Partial<HltbSnapshot["settings"]> = {},
  effectiveEnabled = true,
): HltbSnapshot => ({
  settingsLoaded: true,
  busy: false,
  settingsError: "",
  conflict: { pluginName: null, detectionAvailable: true },
  effectiveEnabled,
  cacheStatus: "idle",
  settings: {
    enabled: true,
    store: true,
    style: "default",
    pushPlayDown: false,
    hideViewDetails: false,
    showMain: true,
    showMainPlus: true,
    showComplete: true,
    showAllStyles: true,
    nativeDetailsCorners: false,
    appearance: {
      custom: false, barAlpha: 25, textShadow: false, textScale: 100, border: true, blur: "match",
    },
    ...settings,
  },
});

const protonDbSnapshot = (
  settings: Partial<ProtonDbBadgeSettings> = {},
  effectiveEnabled = true,
): ProtonDbBadgeSnapshot => ({
  settingsLoaded: true,
  busy: false,
  settingsError: "",
  conflict: { pluginName: null, detectionAvailable: true },
  effectiveEnabled,
  settings: {
    enabled: true,
    home: true,
    library: true,
    gameView: true,
    store: true,
    focusOnly: false,
    coverPosition: "bottom-left",
    ...settings,
  },
});

const controllerListeners = new Set<() => void>();

const storeTargets = () => new Response(JSON.stringify([{
  type: "page",
  id: "store-target",
  title: "Portal 2 on Steam",
  url: "https://store.steampowered.com/app/12345/",
}]));

const connectInstaller = (harness: BrowserHarness): void => {
  vi.mocked(executeInTab).mockImplementation(async (_title, _async, script) => ({
    success: true,
    result: runScript(harness, script),
  }));
  vi.mocked(fetchNoCors).mockImplementation(async () => storeTargets());
  vi.mocked(getNativeOverview).mockReturnValue({ display_name: "Portal 2" });
  vi.mocked(hltbController.getSnapshot).mockReturnValue(hltbSnapshot());
  vi.mocked(protonDbBadgeController.getSnapshot).mockReturnValue(protonDbSnapshot());
  vi.mocked(hltbStore.view).mockReturnValue({ entry: hltbEntry(), needsFetch: false });
  vi.mocked(hltbStore.subscribe).mockReturnValue(() => undefined);
  vi.mocked(protonDbBadgeController.subscribeRating).mockReturnValue(() => undefined);
  vi.mocked(protonDbBadgeController.getRating).mockReturnValue({ tier: "gold", status: "ready", updatedAt: 1 });
  vi.mocked(protonDbBadgeController.subscribe).mockImplementation((listener: () => void) => {
    controllerListeners.add(listener);
    return () => controllerListeners.delete(listener);
  });
  vi.mocked(hltbController.subscribe).mockImplementation((listener: () => void) => {
    controllerListeners.add(listener);
    return () => controllerListeners.delete(listener);
  });
};

const storeRoute = (pathname: string) => {
  const listeners = new Set<() => void>();
  const history = {
    location: { pathname },
    listen: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: () => listeners.forEach((listener) => listener()),
  };
  Object.assign(Router.WindowStore!.GamepadUIMainWindowInstance!, { m_history: history });
  return history;
};

beforeEach(() => {
  controllerListeners.clear();
});

afterEach(() => vi.clearAllMocks());

describe("Store info row DOM", () => {
  it("renders both cards in one row directly above summaryBarTop with its margin", () => {
    const harness = createHarness();
    const anchor = addAnchor(harness);
    installScript(harness, rowPayload());

    const row = rowIn(harness.document);
    expect(row).not.toBeNull();
    expect(row?.parentNode).toBe(harness.document.body);
    expect(harness.document.body.children.indexOf(row!)).toBe(
      harness.document.body.children.indexOf(anchor) - 1,
    );
    expect(row?.style.marginTop).toBe("8px");
    expect(row?.getAttribute("data-app-id")).toBe("12345");
    expect(row?.children).toHaveLength(2);

    const [hltb, protondb] = row!.children;
    expect(hltb.nodeName).toBe("A");
    expect(hltb.href).toBe("https://howlongtobeat.com/game/7231");
    expect(hltb.target).toBe("_blank");
    expect(hltb.rel).toBe("noopener noreferrer");
    expect(hltb.getAttribute("aria-label")).toBe("HowLongToBeat times");
    expect(hltb.children[0]?.textContent).toBe("How Long To Beat");
    expect(hltb.children[1]?.children.map((item) => item.children[1]?.textContent)).toEqual([
      "Main Story", "Main + Extras",
    ]);

    expect(protondb.nodeName).toBe("A");
    expect(protondb.href).toBe("https://www.protondb.com/app/12345");
    expect(protondb.getAttribute("aria-label")).toBe("ProtonDB rating: Gold");
    expect(protondb.children[0]?.textContent).toBe("ProtonDB");
    expect(protondb.children[1]?.children[0]?.style.properties.get("color")).toBe("#cfb53b");
    expect(harness.window.ForceUpdateFocusElements).toHaveBeenCalledWith(row);
    expect(row?.getAttribute("data-registered-attached")).toBe("true");
    // Without row flow, Steam's Store navigation stacks the cards and Left/Right cannot move between them.
    expect(JSON.parse(row?.getAttribute("data-panel") ?? "{}")).toEqual({ "flow-children": "row" });
    expect(harness.document.getElementById(LEGACY_BADGE_ID)).toBeNull();
    expect(styleIn(harness.document)).not.toBeNull();
  });

  it("renders a single card full width for a one-sided payload", () => {
    const hltbOnly = createHarness();
    addAnchor(hltbOnly);
    installScript(hltbOnly, rowPayload({ protondb: null }));
    const hltbRow = rowIn(hltbOnly.document);
    expect(hltbRow?.children).toHaveLength(1);
    expect(hltbRow?.children[0]?.getAttribute("data-card")).toBe("hltb");

    const protonOnly = createHarness();
    addAnchor(protonOnly);
    installScript(protonOnly, rowPayload({ hltb: null }));
    const protonRow = rowIn(protonOnly.document);
    expect(protonRow?.children).toHaveLength(1);
    expect(protonRow?.children[0]?.getAttribute("data-card")).toBe("protondb");
    expect(protonOnly.document.getElementById(LEGACY_BADGE_ID)).toBeNull();
  });

  it("waits for summaryBarTop instead of floating, and keeps one row across renders", () => {
    const harness = createHarness();
    installScript(harness, rowPayload());
    expect(rowIn(harness.document)).toBeNull();

    const anchor = addAnchor(harness);
    FakeMutationObserver.instances
      .find((observer) => observer.target === harness.document.body)
      ?.notify({ addedNodes: [anchor] });
    const row = rowIn(harness.document);
    expect(row).not.toBeNull();
    expect(row?.parentNode).toBe(harness.document.body);

    installScript(harness, rowPayload());
    expect(harness.document.body.children.filter((child) => child.id === ROW_ID)).toHaveLength(1);
    expect(rowIn(harness.document)).toBe(row);
    expect(harness.window.ForceUpdateFocusElements).toHaveBeenCalledTimes(1);
  });

  it("re-registers the updated row with row flow when its content changes", () => {
    const harness = createHarness();
    addAnchor(harness);
    installScript(harness, rowPayload({ hltb: null }));

    // e.g. HLTB times arrive after the ProtonDB tier is already shown.
    installScript(harness, rowPayload());
    const rows = harness.document.body.children.filter((child) => child.id === ROW_ID);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.children).toHaveLength(2);
    const register = vi.mocked(harness.window.ForceUpdateFocusElements);
    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenLastCalledWith(row);
    expect(row.getAttribute("data-registered-attached")).toBe("true");
    expect(JSON.parse(row.getAttribute("data-panel") ?? "{}")).toEqual({ "flow-children": "row" });
  });

  it("refuses a mismatched app or origin and cleans up when Store history moves to another app", () => {
    const wrongApp = createHarness();
    addAnchor(wrongApp);
    installScript(wrongApp, rowPayload({ steamAppId: 999 }));
    expect(rowIn(wrongApp.document)).toBeNull();
    expect(styleIn(wrongApp.document)).toBeNull();

    const wrongOrigin = createHarness("https://example.com/app/12345/");
    addAnchor(wrongOrigin);
    installScript(wrongOrigin, rowPayload());
    expect(rowIn(wrongOrigin.document)).toBeNull();
    expect(styleIn(wrongOrigin.document)).toBeNull();

    const harness = createHarness();
    addAnchor(harness);
    const originalPushState = harness.window.history.pushState;
    installScript(harness, rowPayload());
    expect(rowIn(harness.document)).not.toBeNull();
    harness.window.history.pushState({}, "", "https://store.steampowered.com/app/67890/");
    expect(rowIn(harness.document)).toBeNull();
    expect(styleIn(harness.document)).toBeNull();
    expect(harness.window.history.pushState).toBe(originalPushState);
  });

  it("removes only its own row when the host sends a disposal payload", () => {
    const harness = createHarness();
    addAnchor(harness);
    installScript(harness, rowPayload());
    installScript(harness, null);
    expect(rowIn(harness.document)).toBeNull();
    expect(styleIn(harness.document)).toBeNull();
  });
});

describe("Store info row installer", () => {
  it("installs both cards for the Store target and restores them after a same-target reload", async () => {
    const harness = createHarness();
    addAnchor(harness);
    storeRoute("/steamweb");
    connectInstaller(harness);
    const stop = installStoreInfoRow();
    try {
      await vi.waitFor(() => expect(rowIn(harness.document)).not.toBeNull());
      expect(rowIn(harness.document)?.children).toHaveLength(2);
      expect(rowIn(harness.document)?.children[0]?.href).toBe("https://howlongtobeat.com/game/7231");
      expect(rowIn(harness.document)?.children[1]?.getAttribute("aria-label")).toBe("ProtonDB rating: Gold");
      expect(harness.document.getElementById(LEGACY_BADGE_ID)).toBeNull();

      // Steam reloaded the same CDP target: the injected DOM is gone, the target is not.
      const previousBody = harness.document.body;
      const nextBody = new FakeElement("BODY");
      harness.document.documentElement.removeChild(previousBody);
      harness.document.documentElement.appendChild(nextBody);
      harness.document.body = nextBody;
      const nextAnchor = addAnchor(harness);
      expect(rowIn(harness.document)).toBeNull();

      await vi.waitFor(() => {
        const row = rowIn(harness.document);
        expect(row).not.toBeNull();
        expect(row?.children).toHaveLength(2);
        expect(nextBody.children.indexOf(row!)).toBe(nextBody.children.indexOf(nextAnchor) - 1);
      }, { timeout: 4_000 });
    } finally {
      stop();
    }
  });

  it("renders only the HLTB stats the settings show and hides the link when details are hidden", async () => {
    const harness = createHarness();
    addAnchor(harness);
    storeRoute("/steamweb");
    connectInstaller(harness);
    vi.mocked(hltbController.getSnapshot).mockReturnValue(hltbSnapshot({
      showMain: false, hideViewDetails: true,
    }));
    vi.mocked(protonDbBadgeController.getSnapshot).mockReturnValue(protonDbSnapshot({}, false));
    const stop = installStoreInfoRow();
    try {
      await vi.waitFor(() => expect(rowIn(harness.document)).not.toBeNull());
      const row = rowIn(harness.document)!;
      expect(row.children).toHaveLength(1);
      const card = row.children[0]!;
      expect(card.nodeName).toBe("DIV");
      expect(card.href).toBe("");
      expect(card.children[1]?.children.map((item) => item.children[1]?.textContent)).toEqual([
        "Main + Extras", "Completionist", "All Styles",
      ]);
    } finally {
      stop();
    }
  });

  it("probes the Store page title once when the game is not in the library", async () => {
    const harness = createHarness();
    const anchor = addAnchor(harness);
    const gameName = new FakeElement("DIV");
    gameName.id = "appHubAppName";
    gameName.textContent = " Portal 2 ";
    anchor.appendChild(gameName);
    storeRoute("/steamweb");
    connectInstaller(harness);
    vi.mocked(getNativeOverview).mockReturnValue(null);
    vi.mocked(executeInTab).mockImplementation(async (_title, _async, script) => ({
      success: true,
      result: String(script).includes("appHubAppName") && !String(script).includes("summaryBarTop")
        ? gameName.textContent
        : runScript(harness, script),
    }));
    const stop = installStoreInfoRow();
    const probes = () => vi.mocked(executeInTab).mock.calls
      .filter(([, , script]) => String(script).includes("appHubAppName")).length;
    try {
      await vi.waitFor(() => expect(rowIn(harness.document)?.children).toHaveLength(2));
      expect(probes()).toBe(1);
      controllerListeners.forEach((listener) => listener());
      await vi.waitFor(() => expect(rowIn(harness.document)).not.toBeNull());
      expect(probes()).toBe(1);
    } finally {
      stop();
    }
  });

  it("removes the row when both features become ineligible", async () => {
    const harness = createHarness();
    addAnchor(harness);
    storeRoute("/steamweb");
    connectInstaller(harness);
    const stop = installStoreInfoRow();
    try {
      await vi.waitFor(() => expect(rowIn(harness.document)).not.toBeNull());

      vi.mocked(hltbController.getSnapshot).mockReturnValue(hltbSnapshot({}, false));
      vi.mocked(protonDbBadgeController.getSnapshot).mockReturnValue(protonDbSnapshot({}, false));
      controllerListeners.forEach((listener) => listener());

      await vi.waitFor(() => {
        expect(rowIn(harness.document)).toBeNull();
        expect(styleIn(harness.document)).toBeNull();
      }, { timeout: 4_000 });
    } finally {
      stop();
    }
  });

  it("leaves the Store page alone outside the /steamweb route", async () => {
    const harness = createHarness();
    addAnchor(harness);
    const history = storeRoute("/library/home");
    connectInstaller(harness);
    const stop = installStoreInfoRow();
    try {
      expect(rowIn(harness.document)).toBeNull();
      expect(fetchNoCors).not.toHaveBeenCalled();

      history.location.pathname = "/steamweb";
      history.emit();
      await vi.waitFor(() => expect(rowIn(harness.document)).not.toBeNull());
    } finally {
      stop();
    }
  });
});
