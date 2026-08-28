import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the stale-closure bug where opening the library
 * context menu for game A and then game B injected a "Decky metadata..."
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
  getOverview: vi.fn((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: () => true })),
  getNativeOverview: vi.fn((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: () => true })),
  isNonSteamApp: vi.fn((overview: any) => Number(overview?.app_type) === 1073741824),
  isNativeNonSteamShortcut: vi.fn((overview: any) => Number(overview?.app_type) === 1073741824),
  hasSteamInternals: vi.fn(() => true),
  patchInstallStatus: { contextMenu: "pending" },
}));

const compatibilityModal = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@decky/ui", () => ({
  afterPatch: decky.afterPatch,
  fakeRenderComponent: () => ({ type: {} }),
  findInReactTree: decky.findInReactTree,
  findInTree: decky.findInTree,
  findModuleByExport: () => ({}),
  MenuItem: "MenuItem",
  Navigation: { Navigate: decky.navigate },
}));

vi.mock("./steam/core", () => ({
  getOverview: steam.getOverview,
  getNativeOverview: steam.getNativeOverview,
  isNonSteamApp: steam.isNonSteamApp,
  isNativeNonSteamShortcut: steam.isNativeNonSteamShortcut,
  hasSteamInternals: steam.hasSteamInternals,
  patchInstallStatus: steam.patchInstallStatus,
}));

vi.mock("./log", () => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock("./backend", () => ({ frontendLog: vi.fn(() => Promise.resolve()) }));
vi.mock("./compatibilityStatusModal", () => ({
  openCompatibilityStatusModal: compatibilityModal.open,
}));

import contextMenuPatch from "./contextMenuPatch";

const ENTRY_KEY = "decky-metadata-edit";
const COMPATIBILITY_ENTRY_KEY = "decky-metadata-compatibility";

/**
 * Build a fake LibraryContextMenu whose shape mirrors what the patch walks:
 *  - render() -> a menu element carrying the appid on _owner.pendingProps
 *  - menu.type() -> the menu body element, whose class prototype.render
 *    returns the item list at output.props.children[0].
 */
function makeMenuStack() {
  class MenuBody {
    render() {
      return {
        props: {
          children: [
            [
              { key: "launch", props: { onSelected: () => "launchSource" } },
              { key: "properties", onSelected: () => "AppProperties" },
            ],
          ],
        },
      };
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
        props: { children: [] as any[] },
        type: bodyType,
      };
    }
  }

  return { LibraryContextMenu, MenuBody };
}

/** Read the navigation target baked into the injected menu entry, if present. */
function injectedTarget(items: any[]): string | undefined {
  const entry = items.find((node) => node?.key === ENTRY_KEY);
  if (!entry) return undefined;
  decky.navigate.mockClear();
  entry.props.onSelected();
  return decky.navigate.mock.calls[0]?.[0];
}

describe("contextMenuPatch", () => {
  beforeEach(() => {
    decky.navigate.mockClear();
    steam.getOverview.mockImplementation((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: () => true }));
    steam.getNativeOverview.mockImplementation((appId: number) => ({ appid: appId, app_type: 1073741824, BIsShortcut: () => true }));
    steam.isNonSteamApp.mockImplementation((overview: any) => Number(overview?.app_type) === 1073741824);
    steam.isNativeNonSteamShortcut.mockImplementation((overview: any) => Number(overview?.app_type) === 1073741824);
    compatibilityModal.open.mockClear();
  });

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

  it("adds one adjacent compatibility selector above Properties for each non-Steam game", () => {
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    contextMenuPatch(LibraryContextMenu);

    const menu = new LibraryContextMenu(100).render();
    menu.type();
    const firstItems = new MenuBody().render().props.children[0];
    const firstKeys = firstItems.map((item: any) => item?.key);

    expect(firstKeys.filter((key: string) => key === ENTRY_KEY)).toHaveLength(1);
    expect(firstKeys.filter((key: string) => key === COMPATIBILITY_ENTRY_KEY)).toHaveLength(1);
    expect(firstKeys.indexOf(ENTRY_KEY)).toBeLessThan(firstKeys.indexOf(COMPATIBILITY_ENTRY_KEY));
    expect(firstKeys.indexOf(COMPATIBILITY_ENTRY_KEY)).toBeLessThan(firstKeys.indexOf("properties"));

    const secondItems = new MenuBody().render().props.children[0];
    expect(secondItems.filter((item: any) => item?.key === COMPATIBILITY_ENTRY_KEY)).toHaveLength(1);
    const firstLauncher = {} as EventTarget;
    const firstSelector = secondItems.find((item: any) => item?.key === COMPATIBILITY_ENTRY_KEY) as any;
    firstSelector.props.onSelected();
    expect(compatibilityModal.open).toHaveBeenLastCalledWith(100, undefined);
    firstSelector.props.onSelected({ currentTarget: firstLauncher });
    expect(compatibilityModal.open).toHaveBeenLastCalledWith(100, firstLauncher);

    new LibraryContextMenu(200).render();
    const otherItems = new MenuBody().render().props.children[0];
    const secondLauncher = {} as EventTarget;
    const secondSelector = otherItems.find((item: any) => item?.key === COMPATIBILITY_ENTRY_KEY) as any;
    secondSelector.props.onSelected({ currentTarget: secondLauncher });
    expect(compatibilityModal.open).toHaveBeenLastCalledWith(200, secondLauncher);
  });

  it("does not add either Decky Metadata entry for official Steam games", () => {
    const officialAppId = 55150;
    const shortcut = { appid: 2155012430, app_type: 1073741824, BIsShortcut: () => true };
    const official = { appid: officialAppId, app_type: 0, BIsShortcut: () => false };
    steam.getOverview.mockReturnValue(shortcut as any);
    steam.getNativeOverview.mockReturnValue(official as any);
    const { LibraryContextMenu, MenuBody } = makeMenuStack();
    contextMenuPatch(LibraryContextMenu);

    const menu = new LibraryContextMenu(officialAppId).render();
    menu.type();
    const items = new MenuBody().render().props.children[0];

    expect(items.find((item: any) => item?.key === ENTRY_KEY)).toBeUndefined();
    expect(items.find((item: any) => item?.key === COMPATIBILITY_ENTRY_KEY)).toBeUndefined();
    expect(steam.getNativeOverview).toHaveBeenCalledWith(officialAppId);
  });
});
