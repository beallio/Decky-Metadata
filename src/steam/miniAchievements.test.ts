import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addPatch: vi.fn(),
  removePatch: vi.fn(),
}));

const classes = vi.hoisted(() => ({
  GameStat: "game-stat",
  GameStatsSection: "stats-section",
  Playtime: "playtime",
  GameStatIcon: "stat-icon",
  GameStatRight: "stat-right",
  MiniAchievements: "mini-achievements",
  AchievementProgressRow: "progress-row",
  AchievementCountLabel: "achievement-count",
  PlayBarLabel: "bar-label",
  PlayBarDetailLabel: "bar-detail",
}));

vi.mock("@decky/ui", async () => {
  // The factory runs before this file's imports initialise, so the real patcher
  // cannot be a static import here.
  const { afterPatch } = await import("@decky/ui/dist/utils/patcher");
  const findNode = (node: unknown, filter: (candidate: unknown) => unknown): unknown => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findNode(child, filter);
        if (found) return found;
      }
      return undefined;
    }
    if (!node || typeof node !== "object") return undefined;
    if (filter(node)) return node;
    for (const key of ["props", "children"]) {
      const found = findNode(Reflect.get(node, key), filter);
      if (found) return found;
    }
    return undefined;
  };
  return {
    afterPatch,
    findInReactTree: findNode,
    findClassModule: () => classes,
    Navigation: { Navigate: mocks.navigate },
  };
});

vi.mock("@decky/api", () => ({
  routerHook: { addPatch: mocks.addPatch, removePatch: mocks.removePatch },
}));

vi.mock("../log", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import { installMiniAchievementsPatch } from "./miniAchievements";

const APP_ID = 1942280;
const ROW_CLASS = "decky-metadata-mini-achievements";
const steamGlobals = globalThis as unknown as Record<string, unknown>;

type DetailPatch = { route: string; callback: (tree: unknown) => unknown };
type FakeElement = {
  tagName: string;
  className: string;
  textContent: string;
  style: { cssText: string; width: string };
  children: FakeElement[];
  parentNode: FakeElement | null;
  ownerDocument: FakeDocument;
  listeners: Record<string, () => void>;
  append(...nodes: FakeElement[]): void;
  after(node: FakeElement): void;
  remove(): void;
  addEventListener(name: string, listener: () => void): void;
  querySelector(selector: string): FakeElement | null;
  querySelectorAll(selector: string): FakeElement[];
  setAttribute(name: string, value: string): void;
};
type FakeDocument = {
  querySelector(selector: string): FakeElement | null;
  querySelectorAll(selector: string): FakeElement[];
  createElement(tag: string): FakeElement;
  createElementNS(namespace: string, tag: string): FakeElement;
  defaultView: { MutationObserver: unknown };
};

let detailPatches: DetailPatch[] = [];
let register: Mock;
let unregister: Mock;
let onAchievementChange: ((appId?: unknown) => void) | undefined;
let dispose: (() => void) | undefined;
let document: FakeDocument;
let section: FakeElement;

const hasClass = (element: FakeElement, name: string) =>
  element.className.split(/\s+/).filter(Boolean).includes(name);

const collect = (element: FakeElement, found: FakeElement[] = []): FakeElement[] => {
  for (const child of element.children) {
    found.push(child);
    collect(child, found);
  }
  return found;
};

const matches = (element: FakeElement, selector: string): boolean =>
  selector.startsWith(".") ? hasClass(element, selector.slice(1)) : element.tagName === selector;

const makeElement = (tagName: string): FakeElement => {
  const element: FakeElement = {
    tagName,
    className: "",
    textContent: "",
    style: { cssText: "", width: "" },
    children: [],
    parentNode: null,
    ownerDocument: document,
    listeners: {},
    append(...nodes) {
      for (const node of nodes) {
        node.parentNode?.remove?.();
        node.parentNode = element;
        element.children.push(node);
      }
    },
    after(node) {
      const parent = element.parentNode;
      if (!parent) return;
      const index = parent.children.indexOf(element);
      node.parentNode?.remove?.();
      node.parentNode = parent;
      parent.children.splice(index + 1, 0, node);
    },
    remove() {
      const parent = element.parentNode;
      if (!parent) return;
      parent.children = parent.children.filter((child) => child !== element);
      element.parentNode = null;
    },
    addEventListener(name, listener) {
      element.listeners[name] = listener;
    },
    querySelector(selector) {
      return collect(element).find((child) => matches(child, selector)) ?? null;
    },
    querySelectorAll(selector) {
      return collect(element).filter((child) => matches(child, selector));
    },
    setAttribute() {
      // Attributes do not affect these assertions.
    },
  };
  return element;
};

const makeDocument = (): FakeDocument => {
  class FakeMutationObserver {
    observe() {
      // Observation is re-armed on every sync; the tests call sync via timers.
    }
    disconnect() {
      // Nothing to release in the fake document.
    }
  }
  const doc: FakeDocument = {
    querySelector: (selector) =>
      (matches(section, selector) ? section : collect(section).find((child) => matches(child, selector))) ?? null,
    querySelectorAll: (selector) => collect(section).filter((child) => matches(child, selector)),
    createElement: (tag) => makeElement(tag),
    createElementNS: (_namespace, tag) => makeElement(tag),
    defaultView: { MutationObserver: FakeMutationObserver },
  };
  return doc;
};

const installProgressCache = (entry?: Record<string, unknown>) => {
  const mapCache = new Map<number, Record<string, unknown>>();
  if (entry) mapCache.set(APP_ID, entry);
  const hasAchievements = vi.fn(() => true);
  const queueUpdate = vi.fn();
  steamGlobals.appAchievementProgressCache = {
    BGameHasAchievements: hasAchievements,
    QueueCacheUpdate: queueUpdate,
    m_achievementProgress: { mapCache },
  };
  return { mapCache, hasAchievements, queueUpdate };
};

const progress = (unlocked: number, total: number, percentage: number) => ({
  appid: APP_ID,
  unlocked,
  total,
  percentage,
});

const setOverview = (overview: Record<string, unknown> | null) => {
  steamGlobals.appStore = { allApps: overview ? [overview] : [] };
};

const mountSection = (appId = APP_ID) => {
  section = makeElement("div");
  section.className = classes.GameStatsSection;
  section.ownerDocument = document;
  const lastPlayed = makeElement("div");
  lastPlayed.className = classes.GameStat;
  const playtime = makeElement("div");
  playtime.className = `${classes.GameStat} ${classes.Playtime}`;
  section.append(lastPlayed, playtime);
  Reflect.set(section, "__reactFiber$test", {
    memoizedProps: { overview: { appid: appId } },
    return: null,
  });
  steamGlobals.SteamUIStore = {
    m_WindowStore: { GamepadUIMainWindowInstance: { m_BrowserWindow: { document } } },
  };
  return { playtime };
};

const install = () => {
  vi.useFakeTimers();
  dispose = installMiniAchievementsPatch();
  vi.advanceTimersByTime(0);
};

const row = () => section.querySelector(`.${ROW_CLASS}`);
const countText = () =>
  (row() ? collect(row() as FakeElement).find((child) => hasClass(child, classes.AchievementCountLabel))?.textContent : "") ?? "";

const applyDetailPatch = (routeProps: { renderFunc: () => unknown }) => {
  detailPatches.find((candidate) => candidate.route === "/library/app/:appid")?.callback({ props: routeProps });
};

beforeEach(() => {
  detailPatches = [];
  mocks.addPatch.mockReset();
  mocks.removePatch.mockReset();
  mocks.addPatch.mockImplementation((route: string, callback: DetailPatch["callback"]) => {
    const record = { route, callback };
    detailPatches.push(record);
    return record;
  });
  mocks.removePatch.mockImplementation((_route: string, record: DetailPatch) => {
    detailPatches = detailPatches.filter((candidate) => candidate !== record);
  });
  mocks.navigate.mockReset();
  unregister = vi.fn();
  onAchievementChange = undefined;
  register = vi.fn((listener: (appId?: unknown) => void) => {
    onAchievementChange = listener;
    return unregister;
  });
  steamGlobals.SteamClient = { Apps: { RegisterForAchievementChanges: register } };
  setOverview({ appid: APP_ID, display_name: "Brotato", installed: true });
  document = makeDocument();
  section = makeElement("div");
  dispose = undefined;
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
  delete steamGlobals.SteamClient;
  delete steamGlobals.appStore;
  delete steamGlobals.appAchievementProgressCache;
  delete steamGlobals.SteamUIStore;
});

describe("mini achievements row", () => {
  it("inserts Steam's counts right after Play Time", () => {
    installProgressCache(progress(80, 179, 44.69));
    const { playtime } = mountSection();
    install();

    const inserted = row();
    expect(inserted).not.toBeNull();
    expect(section.children.indexOf(inserted as FakeElement)).toBe(section.children.indexOf(playtime) + 1);
    expect(countText()).toBe("80 / 179");
    const fill = collect(inserted as FakeElement).find((child) => child.style.cssText.includes("height:100%"));
    expect(fill?.style.width).toBe("45%");
  });

  it("opens the native achievements page when activated", () => {
    installProgressCache(progress(80, 179, 44.69));
    mountSection();
    install();

    row()?.listeners.click?.();

    expect(mocks.navigate).toHaveBeenCalledWith(`/library/app/${APP_ID}/achievements/my/individual`);
  });

  it("stays hidden for non-Steam shortcuts and games without achievements", () => {
    installProgressCache();
    mountSection();
    setOverview({ appid: APP_ID, display_name: "Shortcut", app_type: 1073741824, BIsShortcut: () => true });
    install();
    expect(row()).toBeNull();

    setOverview({ appid: APP_ID, display_name: "Brotato", installed: true });
    steamGlobals.appAchievementProgressCache = {
      BGameHasAchievements: () => false,
      QueueCacheUpdate: vi.fn(),
      m_achievementProgress: { mapCache: new Map([[APP_ID, progress(0, 0, 0)]]) },
    };
    vi.runOnlyPendingTimers();
    expect(row()).toBeNull();
  });

  it("leaves Steam's own bar alone when an older client still shows it", () => {
    installProgressCache(progress(80, 179, 44.69));
    mountSection();
    const nativeBar = makeElement("div");
    nativeBar.className = classes.MiniAchievements;
    section.append(nativeBar);
    install();

    expect(section.querySelector(`.${ROW_CLASS}`)).toBeNull();
  });

  it("asks Steam to fill a cold progress cache and shows the counts afterwards", () => {
    const cache = installProgressCache();
    mountSection();
    install();
    expect(row()).toBeNull();
    expect(cache.queueUpdate).toHaveBeenCalledWith(APP_ID);

    cache.mapCache.set(APP_ID, progress(80, 179, 44.69));
    vi.advanceTimersByTime(500);

    expect(row()).not.toBeNull();
    expect(cache.queueUpdate).toHaveBeenCalledTimes(1);
  });

  it("polls past the first retry when Steam answers the cache request late", () => {
    const cache = installProgressCache();
    mountSection();
    install();
    expect(row()).toBeNull();

    vi.advanceTimersByTime(500);
    expect(row()).toBeNull();

    // No DOM mutation: only the bounded poll can reveal the late cache entry.
    cache.mapCache.set(APP_ID, progress(80, 179, 44.69));
    vi.advanceTimersByTime(1000);
    expect(row()).not.toBeNull();
    expect(countText()).toBe("80 / 179");
  });

  it("refreshes the counts when Steam reports an achievement change", () => {
    const cache = installProgressCache(progress(80, 179, 44.69));
    mountSection();
    install();
    expect(row()).not.toBeNull();

    cache.mapCache.set(APP_ID, progress(81, 179, 45.25));
    onAchievementChange?.(APP_ID);
    vi.runOnlyPendingTimers();

    expect(countText()).toBe("81 / 179");
  });

  it("keeps one row when it syncs twice and follows the game's app id", () => {
    installProgressCache(progress(80, 179, 44.69));
    mountSection();
    install();
    onAchievementChange?.();
    vi.advanceTimersByTime(0);
    onAchievementChange?.();
    vi.advanceTimersByTime(0);

    expect(section.querySelectorAll(`.${ROW_CLASS}`)).toHaveLength(1);

    const second = 1234567;
    const cache = installProgressCache(progress(1, 2, 50));
    cache.mapCache.set(second, progress(1, 2, 50));
    setOverview({ appid: second, display_name: "Second", installed: true });
    mountSection(second);
    onAchievementChange?.();
    vi.advanceTimersByTime(0);
    expect(section.querySelectorAll(`.${ROW_CLASS}`)).toHaveLength(1);
    const navigate = row()?.listeners.click;
    navigate?.();
    expect(mocks.navigate).toHaveBeenLastCalledWith(`/library/app/${second}/achievements/my/individual`);
  });

  it("retries after a route render until the page's stats section exists", () => {
    installProgressCache(progress(80, 179, 44.69));
    mountSection();
    steamGlobals.SteamUIStore = {
      m_WindowStore: { GamepadUIMainWindowInstance: { m_BrowserWindow: { document: {
        ...document,
        querySelector: () => null,
      } } } },
    };
    install();
    expect(row()).toBeNull();

    steamGlobals.SteamUIStore = {
      m_WindowStore: { GamepadUIMainWindowInstance: { m_BrowserWindow: { document } } },
    };
    applyDetailPatch({ renderFunc: () => null });
    vi.runOnlyPendingTimers();

    expect(row()).not.toBeNull();
  });

  it("restores the page and releases every hook on dispose", () => {
    installProgressCache(progress(80, 179, 44.69));
    const { playtime } = mountSection();
    install();
    const inserted = row();
    expect(inserted).not.toBeNull();
    const routeProps = { renderFunc: () => null };

    dispose?.();
    dispose = undefined;

    expect(playtime.parentNode).toBe(section);
    expect(section.querySelectorAll(`.${ROW_CLASS}`)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(mocks.removePatch).toHaveBeenCalledTimes(3);
    expect(detailPatches).toHaveLength(0);
    routeProps.renderFunc();
  });
});
