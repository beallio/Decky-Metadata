import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the stale-closure bug where opening the library
 * context menu for game A and then game B injected an "Edit Metadata..."
 * entry that always navigated to game A.
 *
 * Steam reuses a single context-menu instance and installs the inner (menu
 * body) render patch only once. That patch must read the appid of whichever
 * game is *currently* opening the menu, not the one captured on first render.
 *
 * This runs in vitest (Node), not on a Steam Deck: it reconstructs Steam's
 * patch/render shape with fakes and drives two menu opens through it.
 */

const decky = vi.hoisted(() => {
  // Minimal, faithful stand-ins for @decky/ui's tree helpers.
  const findInTree = (root: any, filter: (n: any) => any, opts?: any): any => {
    const walkable: string[] | null = opts?.walkable ?? null;
    const stack = [root];
    const seen = new Set<any>();
    while (stack.length) {
      const cur = stack.pop();
      if (cur == null || typeof cur !== "object") continue;
      if (seen.has(cur)) continue;
      seen.add(cur);
      try {
        if (filter(cur)) return cur;
      } catch (_e) {
        /* filters probe optional shapes; ignore misses */
      }
      if (Array.isArray(cur)) {
        for (const child of cur) stack.push(child);
        continue;
      }
      const keys = walkable ?? Object.keys(cur);
      for (const key of keys) {
        const value = cur[key];
        if (Array.isArray(value)) for (const child of value) stack.push(child);
        else if (value && typeof value === "object") stack.push(value);
      }
    }
    return undefined;
  };

  return {
    navigate: vi.fn(),
    findModuleByExport: vi.fn<(...args: any[]) => any>(() => undefined),
    findModuleExport: vi.fn<(...args: any[]) => any>(() => undefined),
    fakeRenderComponent: vi.fn<(...args: any[]) => any>(() => ({ type: {} })),
    findInTree,
    findInReactTree: (root: any, filter: (n: any) => any) =>
      findInTree(root, filter, { walkable: ["props", "children"] }),
    // Faithful afterPatch: run the original, then let the patch replace the
    // return value (undefined keeps the original return).
    afterPatch: (obj: any, prop: string, patchFn: (args: any[], ret: any) => any) => {
      const original = obj[prop];
      obj[prop] = function (this: any, ...args: any[]) {
        const ret = typeof original === "function" ? original.apply(this, args) : undefined;
        const patched = patchFn(args, ret);
        return patched === undefined ? ret : patched;
      };
      return { unpatch: () => { obj[prop] = original; } };
    },
  };
});

const steam = vi.hoisted(() => ({
  getOverview: vi.fn((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: (): boolean => true })),
  getNativeOverview: vi.fn((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: (): boolean => true })),
  isNonSteamApp: vi.fn((overview: any) => Number(overview?.app_type) === 1073741824),
  isNativeNonSteamShortcut: vi.fn((overview: any) => Number(overview?.app_type) === 1073741824),
  isNativeSteamGame: vi.fn((overview: any) => {
    const appId = Number(overview?.appid);
    const appType = Number(overview?.app_type);
    return Number.isSafeInteger(appId) && appId > 0 && appId < 0x80000000 && (appType & (1 | 8 | 65536)) !== 0;
  }),
  hasSteamInternals: vi.fn(() => true),
  patchInstallStatus: { contextMenu: "pending" },
}));

const hltb = vi.hoisted(() => ({
  effectiveEnabled: false,
}));

vi.mock("@decky/ui", () => ({
  afterPatch: decky.afterPatch,
  fakeRenderComponent: decky.fakeRenderComponent,
  findInReactTree: decky.findInReactTree,
  findInTree: decky.findInTree,
  findModuleByExport: decky.findModuleByExport,
  findModuleExport: decky.findModuleExport,
  MenuItem: "MenuItem",
  Navigation: { Navigate: decky.navigate },
}));

vi.mock("./steam/core", () => ({
  getOverview: steam.getOverview,
  getNativeOverview: steam.getNativeOverview,
  isNonSteamApp: steam.isNonSteamApp,
  isNativeNonSteamShortcut: steam.isNativeNonSteamShortcut,
  isNativeSteamGame: steam.isNativeSteamGame,
  hasSteamInternals: steam.hasSteamInternals,
  patchInstallStatus: steam.patchInstallStatus,
}));

vi.mock("./hltb/gameView", () => ({
  hltbController: {
    getSnapshot: () => ({ effectiveEnabled: hltb.effectiveEnabled }),
  },
}));

vi.mock("./log", () => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock("./backend", () => ({ frontendLog: vi.fn(() => Promise.resolve()) }));
vi.mock("./i18n", () => ({ t: (key: string) => key }));

import { frontendLog } from "./backend";
import contextMenuPatch, { resolveLibraryContextMenu, setContextMenuTraceEnabled } from "./contextMenuPatch";

const ENTRY_KEY = "decky-metadata-edit";
const LEGACY_COMPATIBILITY_ENTRY_KEY = "decky-metadata-compatibility";

interface MenuRow {
  key: string;
  onSelected?: () => void;
  props?: { onSelected?: () => void; children?: unknown };
}

/**
 * Build a fake LibraryContextMenu whose shape mirrors what the patch walks:
 *  - render() -> a menu element carrying the appid on _owner.pendingProps
 *  - menu.type() -> the menu body element, whose class prototype.render
 *    returns the item list at output.props.children[0].
 */
function makeMenuStack(reusedItems?: MenuRow[], outerItems: unknown[] = []) {
  const items = reusedItems || [
    { key: "launch", props: { onSelected: () => "launchSource" } },
    { key: "properties", onSelected: () => "AppProperties" },
  ];

  class MenuBody {
    render() {
      return {
        props: {
          children: [items],
        },
      };
    }

    shouldComponentUpdate(_nextProps: { children: unknown[] }) {
      return true;
    }
  }

  const bodyType = () => ({ type: MenuBody });

  class LibraryContextMenu {
    _appid: number;
    constructor(appid: number) {
      this._appid = appid;
    }
    render() {
      return {
        _owner: { pendingProps: { overview: { appid: this._appid } } },
        props: { children: outerItems },
        type: bodyType,
      };
    }
  }

  return { LibraryContextMenu, MenuBody };
}

/** Read the navigation target baked into the injected menu entry, if present. */
function injectedTarget(items: MenuRow[]): string | undefined {
  const entry = items.find((node) => node?.key === ENTRY_KEY);
  if (!entry) return undefined;
  decky.navigate.mockClear();
  entry.props?.onSelected?.();
  return decky.navigate.mock.calls[0]?.[0];
}

describe("contextMenuPatch", () => {
  beforeEach(() => {
    decky.navigate.mockClear();
    vi.mocked(frontendLog).mockClear();
    hltb.effectiveEnabled = false;
    steam.getOverview.mockImplementation((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: () => true }));
    steam.getNativeOverview.mockImplementation((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: () => true }));
    steam.isNonSteamApp.mockImplementation((overview: any) => Number(overview?.app_type) === 1073741824);
    steam.isNativeNonSteamShortcut.mockImplementation((overview: any) => Number(overview?.app_type) === 1073741824);
  });

  afterEach(() => setContextMenuTraceEnabled(false));

  it("navigates to the game whose menu is currently open, not the first one", () => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    contextMenuPatch(LibraryContextMenu);

    // First open: game A (appid 100). This installs the once-only inner
    // (menu body) render patch.
    const menuA = new LibraryContextMenu(100).render();
    menuA.type(); // installs the MenuBody.prototype.render patch
    const itemsA = new MenuBody().render().props.children[0];
    expect(injectedTarget(itemsA)).toBe("/decky-metadata/100");

    // Second open: game B (appid 200) reuses the same (already patched) body
    // component. Before the fix, the inner patch's captured appid was still
    // 100 and every subsequent game showed game A's metadata.
    new LibraryContextMenu(200).render();
    const itemsB = new MenuBody().render().props.children[0];
    expect(injectedTarget(itemsB)).toBe("/decky-metadata/200");
  });

  it.each([100, 0])("adds exactly one editor entry to gear menus without a launch row (owner app ID %i)", (ownerAppId) => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack(
      [{ key: "properties", props: { onSelected: () => "AppProperties" } }],
      [{ app: { appid: 200 } }],
    );
    contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(ownerAppId).render().type();
    setContextMenuTraceEnabled(true);

    const items = new MenuBody().render().props.children[0];
    expect(items.map((item) => item.key)).toEqual([ENTRY_KEY, "properties"]);
    expect(items[0].props?.children).toBe("contextMenu.editMetadata");
    expect(injectedTarget(items)).toBe(`/decky-metadata/${ownerAppId || 200}`);
    expect(frontendLog).toHaveBeenCalledWith("trace", "context-menu", expect.objectContaining({
      isAppContextMenu: true,
      hasLaunchSource: false,
      anchor: "properties",
    }));
  });

  it.each([
    { key: "sgdb-change-artwork", props: { children: "Artwork options" } },
    { key: "artwork", props: { children: ["Change ", <span>Artwork...</span>] } },
  ])("inserts immediately after $key when it precedes Properties", (artwork) => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack([
      artwork,
      { key: "divider" },
      { key: "properties", onSelected: () => "AppProperties" },
    ]);
    contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(100).render().type();

    const items = new MenuBody().render().props.children[0];
    expect(items.map((item) => item.key)).toEqual([artwork.key, ENTRY_KEY, "divider", "properties"]);
  });

  it.each([
    { position: "absent", tail: [] },
    { position: "after Properties", tail: [{ key: "steamgriddb-artwork" }] },
  ])("inserts immediately above Properties when artwork is $position", ({ tail }) => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack([
      { key: "launch", props: { onSelected: () => "launchSource" } },
      { key: "properties", onSelected: () => "AppProperties" },
      ...tail,
    ]);
    contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(100).render().type();

    const items = new MenuBody().render().props.children[0];
    expect(items.map((item) => item.key)).toEqual(["launch", ENTRY_KEY, "properties", ...tail.map((item) => item.key)]);
  });

  it("keeps one editor entry across repeated render and update passes", () => {
    const items = [{ key: "properties", onSelected: () => "AppProperties" }];
    const { LibraryContextMenu, MenuBody } = makeMenuStack(items, items);
    contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(100).render().type();
    const body = new MenuBody();

    for (let pass = 0; pass < 2; pass++) {
      body.render();
      expect(items.map((item) => item.key)).toEqual([ENTRY_KEY, "properties"]);
      body.shouldComponentUpdate({ children: items });
      expect(items.map((item) => item.key)).toEqual([ENTRY_KEY, "properties"]);
      new LibraryContextMenu(100).render();
      expect(items.map((item) => item.key)).toEqual([ENTRY_KEY, "properties"]);
    }
  });

  it.each([100, 0])("skips menus without Properties even with a launch row (owner app ID %i)", (ownerAppId) => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack(
      [{ key: "launch", props: { onSelected: () => "launchSource" } }, { key: ENTRY_KEY }],
      [{ app: { appid: 100 } }],
    );
    contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(ownerAppId).render().type();

    const items = new MenuBody().render().props.children[0];
    expect(items.map((item) => item.key)).toEqual(["launch"]);
  });

  it("skips app menus when no positive app ID resolves", () => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(0).render().type();

    const items = new MenuBody().render().props.children[0];
    expect(items.map((item) => item.key)).toEqual(["launch", "properties"]);
  });

  it("does not add the Decky Metadata editor entry for official Steam games when HLTB is off", () => {
    const officialAppId = 55150;
    const shortcut = { appid: 2155012430, app_type: 1073741824, BIsShortcut: () => true };
    const official = { appid: officialAppId, app_type: 1, BIsShortcut: () => false };
    steam.getOverview.mockReturnValue(shortcut as any);
    steam.getNativeOverview.mockReturnValue(official as any);
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    contextMenuPatch(LibraryContextMenu);

    const menu = new LibraryContextMenu(officialAppId).render();
    menu.type();
    const items = new MenuBody().render().props.children[0];

    expect(items.find((item: any) => item?.key === ENTRY_KEY)).toBeUndefined();
    expect(steam.getNativeOverview).toHaveBeenCalledWith(officialAppId);
  });

  it("adds the Decky Metadata editor entry for official Steam games when HLTB is enabled, but never for tools", () => {
    hltb.effectiveEnabled = true;
    const steamGameId = 65540;
    const protonToolId = 1493710;
    steam.getNativeOverview.mockImplementation((appId: number) =>
      appId === steamGameId
        ? { appid: steamGameId, app_type: 1, BIsShortcut: () => false }
        : { appid: protonToolId, app_type: 4, BIsShortcut: () => false },
    );
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    contextMenuPatch(LibraryContextMenu);

    new LibraryContextMenu(steamGameId).render().type();
    const gameItems = new MenuBody().render().props.children[0];
    expect(injectedTarget(gameItems)).toBe(`/decky-metadata/${steamGameId}`);

    new LibraryContextMenu(protonToolId).render();
    const toolItems = new MenuBody().render().props.children[0];
    expect(toolItems.find((item: any) => item?.key === ENTRY_KEY)).toBeUndefined();
  });

  it("purges a legacy compatibility entry from a reused menu while keeping one editor entry", () => {
    const reusedItems = [
      { key: "launch", props: { onSelected: () => "launchSource" } },
      { key: LEGACY_COMPATIBILITY_ENTRY_KEY },
      { key: "properties", onSelected: () => "AppProperties" },
    ];
    const { LibraryContextMenu, MenuBody } = makeMenuStack(reusedItems);
    contextMenuPatch(LibraryContextMenu);

    new LibraryContextMenu(100).render().type();
    const items = new MenuBody().render().props.children[0];

    expect(items.filter((item: any) => item?.key === LEGACY_COMPATIBILITY_ENTRY_KEY)).toHaveLength(0);
    expect(items.filter((item: any) => item?.key === ENTRY_KEY)).toHaveLength(1);
  });

  it("removes the menu body patches on unpatch so a reload installs one fresh layer", () => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    const originalRender = MenuBody.prototype.render;
    const originalShouldUpdate = MenuBody.prototype.shouldComponentUpdate;
    const first = contextMenuPatch(LibraryContextMenu);
    const menu = new LibraryContextMenu(100).render();
    menu.type();
    menu.type();
    expect(MenuBody.prototype.render).not.toBe(originalRender);

    first.unpatch();
    expect(MenuBody.prototype.render).toBe(originalRender);
    expect(MenuBody.prototype.shouldComponentUpdate).toBe(originalShouldUpdate);

    const second = contextMenuPatch(LibraryContextMenu);
    new LibraryContextMenu(200).render().type();
    expect(injectedTarget(new MenuBody().render().props.children[0])).toBe("/decky-metadata/200");
    second.unpatch();
    expect(MenuBody.prototype.render).toBe(originalRender);
  });

  it("returns undefined instead of throwing when Webpack CSS lookup misses and no Vite fallback matches", () => {
    decky.findModuleByExport.mockReturnValueOnce(undefined);
    decky.findModuleExport.mockReturnValueOnce(undefined);
    expect(resolveLibraryContextMenu()).toBeUndefined();
  });

  it("resolves the Vite context-menu wrapper when Webpack CSS lookup misses", () => {
    class FakeViteMenu {}
    // Build a function whose toString() matches Steam's Vite wrapper signature.
    const viteWrapper = (e: any) => ({ navigator: 1, instance: 2, ...e });
    decky.findModuleByExport.mockReturnValueOnce(undefined);
    decky.findModuleExport.mockImplementationOnce((predicate: (m: unknown) => boolean) =>
      predicate(viteWrapper) ? viteWrapper : undefined,
    );
    decky.fakeRenderComponent.mockReturnValueOnce({ type: FakeViteMenu });
    expect(resolveLibraryContextMenu()).toBe(FakeViteMenu);
  });
});
