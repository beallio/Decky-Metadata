import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
const defaultSettings = vi.hoisted(() => ({
  autoApply: false,
  preserveExisting: true,
  slots: { cover: true, wide: true, hero: true, logo: true, icon: true },
  sgdbApiKey: "",
  defaultTab: "cover" as const,
  tabOrder: ["cover", "wide", "hero", "logo", "icon", "manage"] as const,
  hiddenTabs: [] as ("cover" | "wide" | "hero" | "logo" | "icon")[],
  filters: {
    cover: { dimensions: ["600x900", "342x482", "660x930"], styles: [], mimes: [], types: ["static"], nsfw: false, humor: true, epilepsy: false },
    wide: { dimensions: ["460x215", "920x430"], styles: [], mimes: [], types: ["static"], nsfw: false, humor: true, epilepsy: false },
    hero: { dimensions: ["1920x620", "3840x1240", "1600x650"], styles: [], mimes: [], types: ["static"], nsfw: false, humor: true, epilepsy: false },
    logo: { dimensions: [], styles: [], mimes: [], types: ["static"], nsfw: false, humor: true, epilepsy: false },
    icon: { dimensions: [], styles: [], mimes: [], types: ["static"], nsfw: false, humor: true, epilepsy: false },
  },
}));
const ctrl = vi.hoisted(() => ({
  getSnapshot: vi.fn(() => ({
    settings: structuredClone(defaultSettings),
    settingsLoaded: true,
    settingsError: "",
    sgdbKeyStatus: { hasUserKey: true, hasBuiltInKey: false, configured: true },
    summary: {
      matched: 0,
      complete: 0,
      missing_games: 0,
      missing_slots: 0,
      existing_enabled_slots: 0,
      locked_games: 0,
    },
    summaryLoaded: true,
    busy: false,
    progress: null,
    sgdbInstalled: false,
    revision: 0,
  })),
  subscribe: vi.fn(() => () => undefined),
  ensureSettingsLoaded: vi.fn(() => Promise.resolve(structuredClone(defaultSettings))),
  setGameLocked: vi.fn(),
  applySingleSlot: vi.fn(),
  applySgdbAsset: vi.fn(),
  applyLocalFile: vi.fn(),
  applyTransparentSlot: vi.fn(),
  clearSingleSlot: vi.fn(),
  applyForGame: vi.fn(),
  updateSlotFilter: vi.fn(),
}));
const hookState = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as (() => void)[],
}));
const nav = vi.hoisted(() => ({ nativeFocusedElement: vi.fn(), takeNativeFocus: vi.fn() }));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const idx = hookState.cursor++;
    if (idx >= hookState.slots.length) {
      hookState.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    }
    return [hookState.slots[idx], (val: unknown) => {
      hookState.slots[idx] = typeof val === "function" ? (val as (p: unknown) => unknown)(hookState.slots[idx]) : val;
    }];
  },
  useCallback: <T,>(fn: T) => fn,
  useMemo: <T,>(fn: () => T) => fn(),
  useRef: <T,>(initial: T) => {
    const ref = { current: initial };
    hookState.refs.push(ref);
    return ref;
  },
  // Recorded, not run: tests call only the focus effects (the others need live backend promises).
  useEffect: (effect: () => void) => {
    hookState.effects.push(effect);
  },
}));
vi.mock("@decky/api", () => ({ callable: () => vi.fn(), openFilePicker: vi.fn() }));
vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DialogButton: "DialogButton",
  Field: "Field",
  Focusable: "Focusable",
  GamepadButton: { BUMPER_LEFT: 5, BUMPER_RIGHT: 6 },
  ModalRoot: "ModalRoot",
  SliderField: "SliderField",
  TextField: "TextField",
  ToggleField: "ToggleField",
  showModal: ui.showModal,
}));
vi.mock("../../artwork/controller", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  artworkController: ctrl,
}));
vi.mock("../../backend", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGameArtworkState: vi.fn(),
  sgdbListAssets: vi.fn(),
  sgdbResolveGame: vi.fn(),
  sgdbSearchGames: vi.fn(),
  setSgdbGameOverride: vi.fn(),
  clearSgdbGameOverride: vi.fn(),
}));
vi.mock("../../i18n", () => ({
  useT: () => (key: string) => key,
  translateBackendError: (e: unknown) => String(e),
}));
vi.mock("../../toast", () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("../../steam/nativeFocus", () => nav);

import { DEFAULT_ARTWORK_SETTINGS, defaultSlotFilter } from "../../artwork/controller";
import { toastError } from "../../toast";

import {
  ArtworkEditorPage,
  computeVisibleArtworkTabs,
  countActiveSlotFilters,
  resolveInitialArtworkTab,
} from "./ArtworkEditorPage";
import { logoPreviewBoxStyle } from "./artwork/LogoPositionerModal";

type Node = { type?: unknown; props?: Record<string, any> };
const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as Node;
  return [el, ...nodes(el.props?.children)];
};

const renderPage = (props: Parameters<typeof ArtworkEditorPage>[0]) => {
  hookState.cursor = 0;
  hookState.slots = [];
  hookState.refs = [];
  hookState.effects = [];
  return ArtworkEditorPage(props) as ReactElement;
};

describe("ArtworkEditorPage", () => {
  it("computes visible tabs respecting tabOrder, hiddenTabs, and keeping manage visible", () => {
    const custom = {
      ...DEFAULT_ARTWORK_SETTINGS,
      tabOrder: ["hero", "cover", "wide", "logo", "icon", "manage"] as const,
      hiddenTabs: ["wide", "icon"] as ("wide" | "icon")[],
      defaultTab: "wide" as const,
    };
    expect(computeVisibleArtworkTabs({ ...custom, tabOrder: [...custom.tabOrder] })).toEqual([
      "hero",
      "cover",
      "logo",
      "manage",
    ]);
    // Hidden defaultTab falls back to first visible tab.
    expect(resolveInitialArtworkTab({ ...custom, tabOrder: [...custom.tabOrder] })).toBe("hero");
  });

  it("counts non-default slot filter selections", () => {
    const base = defaultSlotFilter("cover");
    expect(countActiveSlotFilters("cover", base)).toBe(0);
    expect(
      countActiveSlotFilters("cover", {
        ...base,
        nsfw: true,
        styles: ["alternate"],
      }),
    ).toBe(2);
  });

  it("shows non-blocking Save Steam Match banner when unsaved preview exists while keeping artwork tabs interactive", () => {
    const onSaveMatch = vi.fn();
    const root = renderPage({
      appId: 1001,
      gameName: "Hades II",
      isSteamGame: false,
      savedSteamAppId: null,
      unsavedSteamAppId: 1145350,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch,
    });
    const tree = nodes(root);
    const saveBtn = tree.find(
      (n) => n.type === "DialogButton" && n.props?.children === "editor.artwork.saveMatchAction",
    )!;
    expect(saveBtn).toBeDefined();
    saveBtn.props!.onClick();
    expect(onSaveMatch).toHaveBeenCalledTimes(1);
    // All 6 slot tabs render immediately.
    const tabLabels = tree
      .filter((n) => typeof n.props?.className === "string" && n.props.className.includes("__tab"))
      .filter((n) => !n.props.className.includes("__tabs") && !n.props.className.includes("__tab-list"))
      .map((n) => n.props?.children);
    expect(tabLabels).toHaveLength(6);
  });

  it("switches slot tabs only with L1/R1 or touch, and tabs are not gamepad focus targets", () => {
    const root = renderPage({
      appId: 1091500,
      gameName: "Cyberpunk 2077",
      isSteamGame: true,
      savedSteamAppId: 1091500,
      unsavedSteamAppId: 1091500,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch: vi.fn(),
    });
    const tab = (id: string) => nodes(root).find((n) => n.props?.["data-artwork-tab"] === id)!;
    // Initial tab is "cover" (slot 1 of hookState is activeTab).
    expect(hookState.slots[1]).toBe("cover");
    // Plain elements: the D-pad and stick cannot land on them, so only one tab is ever highlighted.
    expect(tab("cover").type).toBe("div");
    expect(nodes(root).find((n) => n.type === "Focusable" && n.props?.className?.endsWith("__tabs"))).toBeUndefined();

    root.props.onButtonDown({ detail: { button: 6 } }); // R1 -> wide
    expect(hookState.slots[1]).toBe("wide");
    root.props.onButtonDown({ detail: { button: 5 } }); // L1 -> back to cover
    expect(hookState.slots[1]).toBe("cover");
    tab("hero").props!.onClick(); // touch
    expect(hookState.slots[1]).toBe("hero");
  });

  it("cancels the entry card jump when L1/R1 changes the tab", () => {
    const root = renderPage({
      appId: 1091500,
      gameName: "Cyberpunk 2077",
      isSteamGame: true,
      savedSteamAppId: 1091500,
      unsavedSteamAppId: 1091500,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch: vi.fn(),
    });
    root.props.onButtonDown({ detail: { button: 6 } });
    expect(hookState.slots[1]).toBe("wide");
    expect(hookState.refs[2].current).toBe(false);
  });

  describe("focus effects", () => {
    const props = {
      appId: 1091500,
      gameName: "Cyberpunk 2077",
      isSteamGame: true,
      savedSteamAppId: 1091500,
      unsavedSteamAppId: 1091500,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch: vi.fn(),
    };
    // Minimal stand-ins for Big Picture's DOM: a toolbar button (entry focus), a grid card, and the sidebar.
    const makeDom = () => {
      const body = { id: "body" };
      const doc = { activeElement: body as unknown, body };
      const toolbar = { id: "toolbar" };
      const toolbarButton = { id: "filter", closest: (s: string) => (s.includes("__toolbar") ? toolbar : null) };
      const card = { id: "card", closest: () => null };
      const sidebar = { id: "sidebar", closest: () => null };
      const browser = {
        ownerDocument: doc,
        querySelector: (s: string) => (s.includes("__grid") ? card : null),
      };
      return { doc, toolbarButton, card, sidebar, browser };
    };
    // Render with artwork cards present, attach the fake DOM, and return the entry-jump effect.
    const renderWithCards = (browser: unknown) => {
      renderPage(props);
      hookState.slots[7] = [{ id: 1, url: "u", thumb: "t", animated: false, author: { name: "a" }, width: 1, height: 1 }];
      hookState.cursor = 0;
      hookState.refs = [];
      hookState.effects = [];
      ArtworkEditorPage(props);
      hookState.refs[1].current = browser;
      return hookState.effects[hookState.effects.length - 1];
    };

    it("moves Steam focus to the first card when the user is still on the toolbar entry spot", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      nav.nativeFocusedElement.mockReturnValue(dom.toolbarButton);
      renderWithCards(dom.browser)();
      expect(nav.takeNativeFocus).toHaveBeenCalledExactlyOnceWith(dom.card);
    });

    it("leaves Steam focus in the sidebar even when DOM focus is still on the toolbar", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      dom.doc.activeElement = dom.toolbarButton;
      nav.nativeFocusedElement.mockReturnValue(dom.sidebar);
      renderWithCards(dom.browser)();
      expect(nav.takeNativeFocus).not.toHaveBeenCalled();
    });

    it("falls back to the editor window's DOM focus without an active Steam context", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      nav.nativeFocusedElement.mockReturnValue(null);
      dom.doc.activeElement = dom.sidebar;
      renderWithCards(dom.browser)();
      expect(nav.takeNativeFocus).not.toHaveBeenCalled();
      dom.doc.activeElement = dom.doc.body;
      renderWithCards(dom.browser)();
      expect(nav.takeNativeFocus).toHaveBeenCalledExactlyOnceWith(dom.card);
    });

    it("puts Steam focus back into the new tab when L1/R1 replaces the content that held it", () => {
      nav.takeNativeFocus.mockClear();
      const marker = { id: "new-tab-entry" };
      const card = { id: "old-card" };
      const outside = { id: "sidebar" };
      const browser = {
        ownerDocument: { activeElement: null, body: {} },
        contains: (el: unknown) => el === card,
        querySelector: (s: string) => (s === "[data-artwork-initial-focus]" ? marker : null),
      };
      const root = renderPage(props);
      hookState.refs[1].current = browser;
      const tabRefocus = hookState.effects[hookState.effects.length - 2];

      nav.nativeFocusedElement.mockReturnValue(card);
      root.props.onButtonDown({ detail: { button: 6 } }); // R1 while a card has focus
      tabRefocus();
      expect(nav.takeNativeFocus).toHaveBeenCalledExactlyOnceWith(marker);

      nav.takeNativeFocus.mockClear();
      nav.nativeFocusedElement.mockReturnValue(outside);
      root.props.onButtonDown({ detail: { button: 6 } }); // focus outside the browser: leave it alone
      tabRefocus();
      expect(nav.takeNativeFocus).not.toHaveBeenCalled();
    });

    it("drops the old slot's cards in the same render as an L1/R1 tab change", () => {
      const root = renderPage(props);
      hookState.slots[7] = [{ id: 1, url: "u", thumb: "t", animated: false, author: { name: "a" }, width: 1, height: 1 }];
      root.props.onButtonDown({ detail: { button: 6 } }); // R1
      // Otherwise the new tab's entry target is a stale card that is removed a render later.
      expect(hookState.slots[1]).toBe("wide");
      expect(hookState.slots[7]).toEqual([]);
    });
  });

  it("keeps the filter modal open and shows an error when saving the filter fails", async () => {
    ui.showModal.mockClear();
    vi.mocked(toastError).mockClear();
    ctrl.updateSlotFilter.mockResolvedValueOnce(false);
    const root = renderPage({
      appId: 1091500,
      gameName: "Cyberpunk 2077",
      isSteamGame: true,
      savedSteamAppId: 1091500,
      unsavedSteamAppId: 1091500,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch: vi.fn(),
    });
    root.props.onSecondaryButton(); // Y opens Filter & Change Game
    const modal = ui.showModal.mock.calls[0][0] as ReactElement<{ onApplyFilter: (f: unknown) => Promise<boolean> }>;
    await expect(modal.props.onApplyFilter(defaultSlotFilter("cover"))).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("computes LogoPositioner anchor preview styles for all corners and center", () => {
    expect(
      logoPreviewBoxStyle({ pinnedPosition: "UpperLeft", nWidthPct: 40, nHeightPct: 30 }),
    ).toMatchObject({ top: 0, left: 0, width: "40%", height: "30%" });
    expect(
      logoPreviewBoxStyle({ pinnedPosition: "CenterCenter", nWidthPct: 50, nHeightPct: 50 }),
    ).toMatchObject({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
    expect(
      logoPreviewBoxStyle({ pinnedPosition: "BottomCenter", nWidthPct: 60, nHeightPct: 25 }),
    ).toMatchObject({ bottom: 0, left: "50%", width: "60%", height: "25%" });
  });
});
