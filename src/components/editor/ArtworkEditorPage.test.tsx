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
  NavEntryPositionPreferences: { PREFERRED_CHILD: 4 },
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
      savedSteamName: "",
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

  it("keeps joystick and L1/R1 on one tab and cancels the entry card jump on a manual change", () => {
    const root = renderPage({
      appId: 1091500,
      gameName: "Cyberpunk 2077",
      isSteamGame: true,
      savedSteamAppId: 1091500,
      savedSteamName: "Cyberpunk 2077",
      unsavedSteamAppId: 1091500,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch: vi.fn(),
    });
    // Refs in order: requestSeq, browser, cardFocusPending.
    const cardFocusPending = hookState.refs[2];
    const tab = (id: string) => nodes(root).find((n) => n.props?.["data-artwork-tab"] === id)!;
    // Initial tab is "cover" (slot 1 of hookState is activeTab).
    expect(hookState.slots[1]).toBe("cover");
    expect(tab("cover").props!.preferredFocus).toBe(true);

    // Entry focus landing on the active tab keeps the jump armed.
    tab("cover").props!.onGamepadFocus();
    expect(cardFocusPending.current).toBe(true);

    tab("wide").props!.onGamepadFocus(); // joystick -> wide
    expect(hookState.slots[1]).toBe("wide");
    expect(cardFocusPending.current).toBe(false);

    root.props.onButtonDown({ detail: { button: 6 } }); // R1 -> hero
    expect(hookState.slots[1]).toBe("hero");
    root.props.onButtonDown({ detail: { button: 5 } }); // L1 -> back to wide
    expect(hookState.slots[1]).toBe("wide");
  });

  it("cancels the entry card jump when L1/R1 changes the tab", () => {
    const root = renderPage({
      appId: 1091500,
      gameName: "Cyberpunk 2077",
      isSteamGame: true,
      savedSteamAppId: 1091500,
      savedSteamName: "Cyberpunk 2077",
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
      savedSteamName: "Cyberpunk 2077",
      unsavedSteamAppId: 1091500,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch: vi.fn(),
    };
    // Minimal stand-ins for Big Picture's DOM: a tab strip with two tabs, a grid card, and the sidebar.
    const makeDom = () => {
      const body = { id: "body" };
      const doc = { activeElement: body as unknown, body };
      const strip: Record<string, unknown> = { ownerDocument: doc };
      const tab = (id: string) => ({ id, closest: (s: string) => (s.includes("__tabs") ? strip : null) });
      const cover = tab("cover");
      const wide = tab("wide");
      const card = { id: "card", closest: () => null };
      const sidebar = { id: "sidebar", closest: () => null };
      strip.contains = (el: unknown) => el === cover || el === wide;
      strip.querySelector = (s: string) => (s.includes('"wide"') ? wide : cover);
      const browser = {
        ownerDocument: doc,
        querySelector: (s: string) => (s.includes("__grid") ? card : s.includes("__tabs") ? strip : null),
      };
      return { doc, cover, wide, card, sidebar, browser };
    };
    // Render with artwork cards present, attach the fake DOM, and return [entryJump, tabSync].
    const renderWithCards = (browser: unknown, activeTab = "cover") => {
      renderPage(props);
      hookState.slots[1] = activeTab;
      hookState.slots[7] = [{ id: 1, url: "u", thumb: "t", animated: false, author: { name: "a" }, width: 1, height: 1 }];
      hookState.cursor = 0;
      hookState.refs = [];
      hookState.effects = [];
      ArtworkEditorPage(props);
      hookState.refs[1].current = browser;
      return hookState.effects.slice(-2);
    };

    it("moves Steam focus to the first card when the user is still on the tab strip", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      nav.nativeFocusedElement.mockReturnValue(dom.cover);
      const [entryJump] = renderWithCards(dom.browser);
      entryJump();
      expect(nav.takeNativeFocus).toHaveBeenCalledExactlyOnceWith(dom.card);
    });

    it("leaves Steam focus in the sidebar even when DOM focus is still on a tab", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      dom.doc.activeElement = dom.cover;
      nav.nativeFocusedElement.mockReturnValue(dom.sidebar);
      const [entryJump] = renderWithCards(dom.browser);
      entryJump();
      expect(nav.takeNativeFocus).not.toHaveBeenCalled();
    });

    it("falls back to the editor window's DOM focus without an active Steam context", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      nav.nativeFocusedElement.mockReturnValue(null);
      dom.doc.activeElement = dom.sidebar;
      renderWithCards(dom.browser)[0]();
      expect(nav.takeNativeFocus).not.toHaveBeenCalled();
      dom.doc.activeElement = dom.doc.body;
      renderWithCards(dom.browser)[0]();
      expect(nav.takeNativeFocus).toHaveBeenCalledExactlyOnceWith(dom.card);
    });

    it("moves Steam focus to the new tab after L1/R1 only while focus is on the strip", () => {
      nav.takeNativeFocus.mockClear();
      const dom = makeDom();
      nav.nativeFocusedElement.mockReturnValue(dom.cover);
      renderWithCards(dom.browser, "wide")[1]();
      expect(nav.takeNativeFocus).toHaveBeenCalledExactlyOnceWith(dom.wide);

      nav.takeNativeFocus.mockClear();
      nav.nativeFocusedElement.mockReturnValue(dom.card);
      renderWithCards(dom.browser, "wide")[1]();
      expect(nav.takeNativeFocus).not.toHaveBeenCalled();
    });
  });

  it("computes LogoPositioner anchor preview styles for all corners and center", () => {
    expect(
      logoPreviewBoxStyle({ pinnedPosition: "UpperLeft", nWidthPct: 40, nHeightPct: 30 }),
    ).toMatchObject({ top: 0, left: 0, width: "40%", height: "30%" });
    expect(
      logoPreviewBoxStyle({ pinnedPosition: "CenterCenter", nWidthPct: 50, nHeightPct: 50 }),
    ).toMatchObject({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
    expect(
      logoPreviewBoxStyle({ pinnedPosition: "BottomRight", nWidthPct: 60, nHeightPct: 25 }),
    ).toMatchObject({ bottom: 0, right: 0, width: "60%", height: "25%" });
  });
});
