import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as I18n from "./i18n";
import { hltbStore } from "./hltb/store";
import type { HltbEntry } from "./backend";

const ui = vi.hoisted(() => ({ showModal: vi.fn(), showContextMenu: vi.fn() }));
const route = vi.hoisted(() => ({ appid: "100" }));
const textarea = vi.hoisted(() => ({ component: null as any }));
const i18nLanguage = vi.hoisted(() => ({
  currentSteamLanguage: vi.fn(() => Promise.resolve("english")),
}));

const backend = vi.hoisted(() => ({
  applyFetchedMetadata: vi.fn(),
  previewFetchedMetadata: vi.fn(),
  previewSteamMetadata: vi.fn(),
  savePreviewedMetadata: vi.fn(),
  checkHltbGameId: vi.fn(),
  getHltbStats: vi.fn(),
  clearShortcutNameState: vi.fn(),
  enrichSteamApp: vi.fn(),
  getShortcutNameManagement: vi.fn(),
  getMetadata: vi.fn(),
  removeMetadata: vi.fn(),
  saveMetadata: vi.fn(),
  saveShortcutNameState: vi.fn(),
  searchMetadata: vi.fn(),
  searchSteamMatches: vi.fn(),
  getSteamMatchPreview: vi.fn(),
}));

const steam = vi.hoisted(() => ({
  appName: vi.fn((_appId?: number) => "Shortcut"),
  applyMetadata: vi.fn(),
  cleanTitle: vi.fn((value: string) => value.trim()),
  compatibilityDefaultSnapshot: vi.fn(() => null),
  compatibilityDefaultScopeSnapshot: vi.fn(() => "all"),
  currentRoutePath: vi.fn(() => `/decky-metadata/${route.appid}`),
  classifyShortcutNameState: vi.fn((_current: string | null, _state: any) => "unmanaged"),
  getOverview: vi.fn(() => ({ app_type: 1073741824, BIsShortcut: () => true })),
  hasShortcutNameApi: vi.fn(() => true),
  isNonSteamApp: vi.fn(() => true),
  ensureCompatibilityDefault: vi.fn(() => Promise.resolve(null)),
  effectiveCompatibilityCategory: vi.fn((metadata: any, globalDefault: any, scope: string) => {
    if (typeof metadata?.deck_compat_override === "number") return metadata.deck_compat_override;
    if (metadata?.deck_compat_override === "valve") return metadata.deck_compat_category ?? null;
    const eligible = scope === "all"
      || scope === "metadata"
      || (scope === "steam" && Number(metadata?.steam_appid) > 0)
      || (scope === "no-steam" && metadata !== undefined && Number(metadata?.steam_appid) <= 0);
    return eligible && globalDefault !== null ? globalDefault : metadata?.deck_compat_category ?? null;
  }),
  isCompatibilityDefaultEligible: vi.fn((metadata: any, scope: string) =>
    scope === "all"
      || (scope === "metadata" && metadata !== undefined)
      || (scope === "steam" && Number(metadata?.steam_appid) > 0)
      || (scope === "no-steam" && metadata !== undefined && Number(metadata?.steam_appid) <= 0)),
  metadataCache: {} as Record<string, any>,
  setMetadataCacheEntry: vi.fn((appId: number, value: any) => {
    steam.metadataCache[String(appId)] = value;
  }),
  removeMetadataCacheEntry: vi.fn((appId: number) => {
    delete steam.metadataCache[String(appId)];
  }),
  nativeShortcutName: vi.fn(() => "Shortcut"),
  refreshCompatibilitySurfaces: vi.fn(),
  setShortcutNameAndWait: vi.fn(),
  subscribeCompatibilityRevision: vi.fn(() => () => undefined),
}));

const toast = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarn: vi.fn(),
}));

// What the game page shows for this game; tests set it per case.
const hltbMatch = vi.hoisted(() => ({ entry: null as HltbEntry | null }));
const state = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
const refs = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
const effects = vi.hoisted(() => ({ enabled: false, callbacks: [] as Array<() => unknown> }));

vi.mock("@decky/ui", () => ({
  ConfirmModal: "ConfirmModal",
  afterPatch: vi.fn(),
  findInReactTree: vi.fn(),
  DropdownItem: "DropdownItem",
  Field: "Field",
  Focusable: "Focusable",
  Menu: "Menu",
  MenuItem: "MenuItem",
  Navigation: { NavigateBack: vi.fn() },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ScrollPanel: "ScrollPanel",
  TextField: "TextField",
  ToggleField: "ToggleField",
  useParams: () => ({ appid: route.appid }),
  showModal: ui.showModal,
  showContextMenu: ui.showContextMenu,
}));

vi.mock("./backend", () => backend);
vi.mock("./steam", () => steam);
vi.mock("./steam/gamepadTextArea", () => ({ getGamepadTextArea: () => textarea.component }));
vi.mock("./toast", () => toast);
// Pages are rendered by hand here with a partial React mock, so use the
// module-level translator instead of react-i18next's hook.
vi.mock("./i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof I18n>();
  return {
    ...actual,
    useT: () => actual.t,
    currentSteamLanguage: i18nLanguage.currentSteamLanguage,
  };
});
vi.mock("./hltb/gameView", () => ({
  useHltbSnapshot: () => ({ effectiveEnabled: true }),
  useHltbMatch: () => ({ active: true, entry: hltbMatch.entry }),
}));
vi.mock("react", () => ({
  createContext: () => ({}),
  useCallback: (callback: any) => callback,
  useEffect: (callback: () => unknown) => {
    if (effects.enabled) effects.callbacks.push(callback);
  },
  useMemo: (factory: any) => factory(),
  useRef: (initial: any) => {
    const slot = refs.cursor++;
    if (refs.values[slot] === undefined) refs.values[slot] = { current: initial };
    return refs.values[slot];
  },
  useState: (initial: any) => {
    const slot = state.cursor++;
    if (state.values[slot] === undefined) state.values[slot] = initial;
    return [
      state.values[slot],
      (next: any) => {
        state.values[slot] =
          typeof next === "function" ? next(state.values[slot]) : next;
      },
    ];
  },
}));

import { Navigation } from "@decky/ui";
import { MetadataPage } from "./MetadataPage";
import { metadataTemplate } from "./metadataForm";
import type { MetadataData } from "./types";
import { SteamMatchPicker } from "./SteamMatchPicker";
import { classifyShortcutNameState as actualClassifyShortcutNameState } from "./steam/shortcutNames";

const makeMetadata = (overrides: Record<string, unknown> = {}) => ({
  ...metadataTemplate("Shortcut"),
  ...overrides,
});

const walk = (node: any, predicate: (candidate: any) => boolean): any[] => {
  if (node == null || typeof node !== "object") return [];
  const matched = predicate(node) ? [node] : [];
  const children = node.props?.children;
  const childNodes = Array.isArray(children) ? children : [children];
  return matched.concat(...childNodes.flatMap((child) => walk(child, predicate)));
};

const renderPage = () => {
  state.cursor = 0;
  refs.cursor = 0;
  return MetadataPage() as any;
};

const dropdown = (page: any) =>
  walk(page, (node) => node.type === "DropdownItem")[0];

const saveButton = (page: any) =>
  walk(
    page,
    (node) =>
      typeof node.props?.className === "string" &&
      node.props.className.includes("decky-metadata-editor__action--save")
  )[0];

const sectionTitles = (page: any) =>
  walk(page, (node) => node.type === "PanelSection")
    .map((node) => node.props?.title)
    .filter(Boolean);

const text = (node: any): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
};

const action = (page: any, label: string) =>
  walk(page, (node) => typeof node.props?.onClick === "function" && text(node) === label)[0];

const moreButton = (page: any) =>
  walk(page, (node) => node.props?.["aria-label"] === "More options")[0];

const lastCall = (mock: any) => mock.mock.calls[mock.mock.calls.length - 1][0];

const openMoreMenu = (page: any) => {
  moreButton(page).props.onClick({ currentTarget: "more-button" });
  const children = lastCall(ui.showContextMenu).props.children;
  return Array.isArray(children) ? children : [children];
};

/** The remove confirmation is the only modal this flow opens. */
const removeViaMenu = (page: any) => {
  openMoreMenu(page)[1].props.onSelected();
  return lastCall(ui.showModal).props.onOK();
};

const labeledInput = (page: any, label: string) => {
  const container = walk(page, (node) => {
    const children = node.props?.children;
    const nodes = Array.isArray(children) ? children : [children];
    return nodes.some((child) => child?.type === "label" && text(child).startsWith(label));
  })[0];
  return walk(container, (node) => node.type === "TextField")[0];
};

const rootElement = (page: any) =>
  walk(page, (node) => node.props?.className === "decky-metadata-editor")[0];

const flushAsyncWork = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const ignSearchSection = (page: any) =>
  walk(page, (node) => node.type === "PanelSection" && node.props?.title === "Search IGN metadata")[0];

const ignSearchInput = (page: any) =>
  walk(ignSearchSection(page), (node) => node.type === "TextField")[0];

const ignSearchButton = (page: any) =>
  walk(ignSearchSection(page), (node) => typeof node.props?.onClick === "function")[0];

const shortcutState = (overrides: Record<string, unknown> = {}) => ({
  eligible: true,
  reason: "ready" as const,
  state: null,
  ...overrides,
});

const configureShortcutPanel = (overrides: {
  metadata?: Record<string, unknown>;
  management?: Record<string, unknown>;
  current?: string | null;
  status?: "unmanaged" | "managed" | "restored" | "diverged";
  busy?: boolean;
  managementError?: boolean;
} = {}) => {
  const metadata = makeMetadata({
    steam_appid: 15100,
    steam_store_name: "Steam Name",
    ...overrides.metadata,
  });
  state.values[0] = metadata;
  state.values[7] = overrides.busy ?? false;
  state.values[8] = metadata.steam_appid ? String(metadata.steam_appid) : "";
  state.values[9] = shortcutState(overrides.management);
  state.values[10] = overrides.managementError ?? false;
  state.values[11] = overrides.current ?? "Original";
  // These direct-render tests model metadata that has already been hydrated
  // for the initial editor entry. Real editor loads set this after the RPC.
  state.values[14] = 0;
  // Ref slot 14 is the saved-record snapshot that gates store writes; slot 15
  // is the pending Steam preview. Both are only set by backend responses.
  refs.values[14] = { current: metadata };
  refs.values[15] = { current: null };
  steam.classifyShortcutNameState.mockReturnValue(overrides.status ?? "unmanaged");
};

describe("MetadataPage compatibility status", () => {
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    refs.values = [];
    refs.cursor = 0;
    effects.enabled = false;
    effects.callbacks = [];
    Object.keys(steam.metadataCache).forEach((key) => delete steam.metadataCache[key]);
    vi.clearAllMocks();
    i18nLanguage.currentSteamLanguage.mockReset();
    i18nLanguage.currentSteamLanguage.mockResolvedValue("english");
    steam.appName.mockReturnValue("Shortcut");
    steam.cleanTitle.mockImplementation((value: string) => value.trim());
    steam.getOverview.mockReturnValue({ app_type: 1073741824, BIsShortcut: () => true });
    steam.isNonSteamApp.mockReturnValue(true);
    steam.hasShortcutNameApi.mockReturnValue(true);
    steam.classifyShortcutNameState.mockReturnValue("unmanaged");
    steam.nativeShortcutName.mockReturnValue("Shortcut");
    route.appid = "100";
  });

  it("shows the native dropdown in the required order with global inheritance", () => {
    state.values[0] = makeMetadata({ deck_compat_category: 3 });

    const control = dropdown(renderPage());

    expect(control.props.label).toBe("Compatibility status");
    expect(control.props.rgOptions).toEqual([
      { data: null, label: "Use global default" },
      { data: "valve", label: "Follow Valve" },
      { data: 3, label: "Verified" },
      { data: 2, label: "Playable" },
      { data: 1, label: "Unsupported" },
      { data: 0, label: "Unknown" },
    ]);
    expect(control.props.selectedOption).toBeNull();
    expect(control.props.renderButtonValue()).toBe("Use global default (Verified — from Valve)");
  });

  it("keeps explicit Unknown selected instead of treating zero as Automatic", () => {
    state.values[0] = makeMetadata({ deck_compat_override: 0 });

    const control = dropdown(renderPage());

    expect(control.props.selectedOption).toBe(0);
    expect(control.props.renderButtonValue()).toBe("Unknown");
  });

  it("shows Follow Valve as a separate persisted per-game choice", async () => {
    state.values[0] = makeMetadata({ deck_compat_category: 2 });
    state.values[14] = 0;
    const saved = makeMetadata({ deck_compat_category: 2, deck_compat_override: "valve" });
    backend.saveMetadata.mockResolvedValue(saved);

    dropdown(renderPage()).props.onChange({ data: "valve" });
    const page = renderPage();
    expect(dropdown(page).props.selectedOption).toBe("valve");
    expect(dropdown(page).props.renderButtonValue()).toBe("Follow Valve (Playable)");

    await saveButton(page).props.onClick();
    expect(backend.saveMetadata).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ deck_compat_override: "valve" }),
    );
  });

  it("shows the selected numeric global default without claiming Valve supplied it", () => {
    state.values[0] = makeMetadata({ deck_compat_category: 1 });
    // Compatibility-default state is appended after the editor's existing
    // state slots, preserving the legacy state-index fixture above.
    state.values[15] = 3;

    expect(dropdown(renderPage()).props.renderButtonValue()).toBe("Use global default (Verified)");
  });

  it("updates an inheriting editor preview when the selected scope excludes its record", () => {
    state.values[0] = makeMetadata({ steam_appid: null, deck_compat_category: 2 });
    state.values[15] = 3;
    state.values[16] = "steam";
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("steam");

    expect(dropdown(renderPage()).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — Playable from Valve)",
    );
  });

  it("does not mistake an equal Valve category for global inheritance outside the scope", () => {
    state.values[0] = makeMetadata({ steam_appid: 15100, deck_compat_category: 3 });
    state.values[15] = 3;
    state.values[16] = "no-steam";
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("no-steam");

    expect(dropdown(renderPage()).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — Verified from Valve)",
    );
  });

  it("updates the mounted editor preview after a scope-only revision", async () => {
    state.values[0] = makeMetadata({ steam_appid: 15100, deck_compat_category: 2 });
    state.values[15] = 3;
    state.values[16] = "no-steam";
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultSnapshot.mockReturnValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("no-steam");
    let notifyCompatibilityRevision!: () => void;
    steam.subscribeCompatibilityRevision.mockImplementation(((listener: () => void) => {
      notifyCompatibilityRevision = listener;
      return () => undefined;
    }) as any);
    effects.enabled = true;

    renderPage();
    effects.callbacks[4]();
    await flushAsyncWork();
    expect(dropdown(renderPage()).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — Playable from Valve)",
    );

    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("steam");
    notifyCompatibilityRevision();

    expect(dropdown(renderPage()).props.renderButtonValue()).toBe("Use global default (Verified)");
  });

  it("saves a dropdown change atomically and refreshes after success", async () => {
    state.values[0] = makeMetadata({ deck_compat_category: 3 });
    state.values[14] = 0;
    const saved = makeMetadata({ deck_compat_category: 3, deck_compat_override: 0 });
    backend.saveMetadata.mockResolvedValue(saved);

    dropdown(renderPage()).props.onChange({ data: 0 });
    const page = renderPage();

    expect(dropdown(page).props.selectedOption).toBe(0);
    await saveButton(page).props.onClick();

    expect(backend.saveMetadata).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ deck_compat_override: 0 })
    );
    expect(steam.metadataCache["100"]).toBe(saved);
    expect(steam.applyMetadata).toHaveBeenCalledWith(100, { publishCompatibility: false });
    expect(steam.refreshCompatibilitySurfaces).toHaveBeenCalledWith();
    expect(toast.toastSuccess).toHaveBeenCalledWith("Saved", "Metadata saved");
    expect(dropdown(renderPage()).props.selectedOption).toBe(0);
  });

  it("does not change cache or runtime compatibility when save fails", async () => {
    const persisted = makeMetadata({ deck_compat_override: 3 });
    state.values[0] = persisted;
    state.values[14] = 0;
    steam.metadataCache["100"] = persisted;
    backend.saveMetadata.mockRejectedValue(new Error("backend unavailable"));

    dropdown(renderPage()).props.onChange({ data: 0 });
    await saveButton(renderPage()).props.onClick();

    expect(steam.metadataCache["100"]).toBe(persisted);
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
    expect(toast.toastError).toHaveBeenCalledWith(
      "Save failed",
      expect.stringContaining("backend unavailable")
    );
  });

  it("does not expose the dropdown for an official Steam game", () => {
    steam.isNonSteamApp.mockReturnValue(false);

    expect(dropdown(renderPage())).toBeUndefined();
  });

  it("places the per-game shortcut-name panel immediately after Steam App ID", () => {
    const titles = sectionTitles(renderPage());
    const steamAppId = titles.indexOf("Steam App ID");
    expect(steamAppId).toBeGreaterThanOrEqual(0);
    expect(titles[steamAppId + 1]).toBe("Shortcut name");
  });

  it("shows the proposal only for an eligible native shortcut and makes equal names a no-op", () => {
    configureShortcutPanel({ current: "Steam Name" });
    const page = renderPage();
    expect(text(page)).toContain("Shortcut name already matches Steam");
    expect(action(page, "Use Steam name")).toBeUndefined();

    configureShortcutPanel({ management: { eligible: false, reason: "derived_shortcut_id" } });
    expect(action(renderPage(), "Use Steam name")).toBeUndefined();
  });

  it("saves history before the observed native rename and reports only observed success", async () => {
    configureShortcutPanel();
    steam.nativeShortcutName.mockReturnValue("Original");
    const saved = { original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 };
    backend.saveShortcutNameState.mockResolvedValue(saved);
    steam.setShortcutNameAndWait.mockResolvedValue("Steam Name");

    action(renderPage(), "Use Steam name").props.onClick();
    const modal = ui.showModal.mock.calls[0][0];
    expect(modal.props.strTitle).toBe("Use Steam name?");
    expect(modal.props.strOKButtonText).toBe("Use Steam name");
    modal.props.onOK();
    await flushAsyncWork();

    expect(backend.saveShortcutNameState).toHaveBeenCalledWith(100, "Original", "Steam Name", 15100);
    expect(steam.setShortcutNameAndWait).toHaveBeenCalledWith(100, "Original", "Steam Name");
    expect(backend.saveShortcutNameState.mock.invocationCallOrder[0]).toBeLessThan(
      steam.setShortcutNameAndWait.mock.invocationCallOrder[0]
    );
    expect(toast.toastSuccess).toHaveBeenCalledWith("Shortcut name updated", expect.any(String));
  });

  it("keeps saved history after a rename failure and does not toast success", async () => {
    configureShortcutPanel();
    steam.nativeShortcutName.mockReturnValue("Original");
    backend.saveShortcutNameState.mockResolvedValue({ original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 });
    steam.setShortcutNameAndWait.mockRejectedValue(new Error("timeout"));
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());

    action(renderPage(), "Use Steam name").props.onClick();
    ui.showModal.mock.calls[0][0].props.onOK();
    await flushAsyncWork();

    expect(backend.saveShortcutNameState).toHaveBeenCalled();
    expect(toast.toastSuccess).not.toHaveBeenCalledWith("Shortcut name updated", expect.any(String));
    expect(toast.toastError).toHaveBeenCalledWith("Shortcut name was not updated", expect.stringContaining("timeout"));
  });

  it("guards restore, clears history only after Steam confirms it, and reports a clear failure", async () => {
    const managed = { original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 };
    configureShortcutPanel({ management: { state: managed }, current: "Steam Name", status: "managed" });
    steam.nativeShortcutName.mockReturnValue("Steam Name");
    steam.setShortcutNameAndWait.mockResolvedValue("Original");
    backend.clearShortcutNameState.mockResolvedValue({ ok: true });

    action(renderPage(), "Restore original name").props.onClick();
    const modal = ui.showModal.mock.calls[0][0];
    expect(modal.props.strTitle).toBe("Restore original shortcut name?");
    modal.props.onOK();
    await flushAsyncWork();
    expect(steam.setShortcutNameAndWait).toHaveBeenCalledWith(100, "Steam Name", "Original");
    expect(backend.clearShortcutNameState).toHaveBeenCalledWith(100);
    expect(steam.setShortcutNameAndWait.mock.invocationCallOrder[0]).toBeLessThan(
      backend.clearShortcutNameState.mock.invocationCallOrder[0]
    );

    configureShortcutPanel({ management: { state: managed }, current: "Steam Name", status: "managed" });
    steam.nativeShortcutName.mockReturnValue("Steam Name");
    steam.setShortcutNameAndWait.mockResolvedValue("Original");
    backend.clearShortcutNameState.mockRejectedValue(new Error("storage unavailable"));
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState({ state: managed }));
    action(renderPage(), "Restore original name").props.onClick();
    ui.showModal.mock.calls[1][0].props.onOK();
    await flushAsyncWork();
    expect(toast.toastError).toHaveBeenCalledWith("Shortcut name restored", expect.stringContaining("history could not be cleared"));
  });

  it("fails closed for diverged history and forgets history without a Steam write", async () => {
    const diverged = { original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 };
    configureShortcutPanel({ management: { state: diverged }, current: "Changed outside", status: "diverged" });
    steam.classifyShortcutNameState.mockImplementation(actualClassifyShortcutNameState);
    backend.clearShortcutNameState.mockResolvedValue({ ok: true });
    const page = renderPage();
    expect(action(page, "Use Steam name")).toBeUndefined();
    expect(action(page, "Restore original name")).toBeUndefined();
    action(page, "Forget saved name history").props.onClick();
    ui.showModal.mock.calls[0][0].props.onOK();
    await Promise.resolve();
    expect(backend.clearShortcutNameState).toHaveBeenCalledWith(100);
    expect(steam.setShortcutNameAndWait).not.toHaveBeenCalled();
  });

  it("previews a changed Steam match without saving and stores its provider fields on Save", async () => {
    const oldNews = [{ id: "old", title: "Old news", url: "https://example.com/old" }];
    configureShortcutPanel({
      metadata: {
        steam_appid: 15100,
        steam_store_name: "Old Steam Name",
        steam_store_url: "https://store.steampowered.com/app/15100/",
        deck_compat_category: 3,
        steamos_compat_category: 2,
        steam_machine_compat_category: 1,
        steam_frame_compat_category: 0,
        steam_news: oldNews,
        steam_news_enriched_at: 7,
        steam_dlc_appids: [10],
        has_points_shop: true,
        steam_store_state: "available",
      },
    });
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      title: "New title",
      steam_appid: 15200,
      steam_store_name: "New Steam Name",
      steam_store_url: "https://store.steampowered.com/app/15200/",
      steam_news: [],
      steam_dlc_appids: [],
      has_points_shop: false,
      deck_compat_category: null,
      steamos_compat_category: null,
      steam_machine_compat_category: null,
      steam_frame_compat_category: null,
      steam_store_state: "unknown",
    }));

    const page = renderPage();
    walk(page, (node) => node.type === "TextField" && node.props.value === "15100")[0]
      .props.onChange({ target: { value: "15200" } });
    await action(renderPage(), "Apply Steam App ID").props.onClick();

    const sentDraft = backend.previewSteamMetadata.mock.calls[0][0];
    expect(sentDraft).toEqual(expect.objectContaining({
      steam_appid: 15200,
      steam_store_name: "",
      steam_store_url: "https://store.steampowered.com/app/15200/",
      deck_compat_category: null,
      steamos_compat_category: null,
      steam_machine_compat_category: null,
      steam_frame_compat_category: null,
      steam_news: [],
      steam_news_enriched_at: 0,
      steam_dlc_appids: [],
      has_points_shop: false,
    }));
    // Absence means "never looked up" for the per-device categories;
    // the old match's store state must not survive either.
    expect(sentDraft.steam_store_state).toBeUndefined();
    expect(backend.previewSteamMetadata.mock.calls[0][1]).toBe("english");
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
    expect(steam.setMetadataCacheEntry).not.toHaveBeenCalled();
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
      steam_store_name: "New Steam Name",
      steam_news: [],
    }));
    expect(state.values[8]).toBe("15200");
    expect(toast.toastSuccess).toHaveBeenCalledWith("Details loaded", expect.stringContaining("Save"));

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();

    const stored = backend.savePreviewedMetadata.mock.calls[0][1];
    expect(backend.savePreviewedMetadata).toHaveBeenCalledWith(100, expect.any(Object), 15200);
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    // The trusted save must not carry the old match's news, DLC, points shop or compat.
    expect(stored.steam_news).toEqual([]);
    expect(stored.steam_dlc_appids).toEqual([]);
    expect(stored.has_points_shop).toBe(false);
    expect(stored.deck_compat_category).toBeNull();
    expect(stored.steamos_compat_category).toBeNull();
    expect(stored.steam_machine_compat_category).toBeNull();
    expect(stored.steam_frame_compat_category).toBeNull();
    expect(steam.applyMetadata).toHaveBeenCalledWith(100, { publishCompatibility: false });
  });

  it("keeps normal metadata controls available when management is unavailable and excludes busy actions", async () => {
    configureShortcutPanel({ managementError: true });
    backend.saveMetadata.mockResolvedValue(makeMetadata());
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenCalled();

    configureShortcutPanel({ busy: true });
    const restore = action(renderPage(), "Use Steam name");
    expect(restore).toBeUndefined();
  });

  it("keeps metadata editing available after a rejected management load and never offers a rename", async () => {
    effects.enabled = true;
    backend.getMetadata.mockResolvedValue(makeMetadata({ steam_appid: 15100, steam_store_name: "Steam Name" }));
    backend.getShortcutNameManagement.mockRejectedValue(new Error("backend unavailable"));
    backend.saveMetadata.mockResolvedValue(makeMetadata());

    renderPage();
    await effects.callbacks[0]();
    await flushAsyncWork();

    const page = renderPage();
    expect(text(page)).toContain("Shortcut-name management is unavailable");
    expect(action(page, "Use Steam name")).toBeUndefined();
    await saveButton(page).props.onClick();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.any(Object));
    expect(backend.saveShortcutNameState).not.toHaveBeenCalled();
  });

  it("reports an unavailable Steam API before rename and does not save history", () => {
    configureShortcutPanel();
    steam.hasShortcutNameApi.mockReturnValue(false);

    const page = renderPage();
    expect(text(page)).toContain("Steam's native shortcut-name API is unavailable");
    expect(action(page, "Use Steam name")).toBeUndefined();
    expect(backend.saveShortcutNameState).not.toHaveBeenCalled();
  });

  it("withholds shortcut-name actions until an unsaved Steam match is saved", async () => {
    configureShortcutPanel();
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15200,
      steam_store_name: "New Steam Name",
    }));
    state.values[8] = "15200";

    await action(renderPage(), "Apply Steam App ID").props.onClick();
    expect(action(renderPage(), "Use Steam name")).toBeUndefined();

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();

    expect(action(renderPage(), "Use Steam name")).toBeDefined();
  });

  it("reports whether Save committed and applied the record", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockResolvedValue(makeMetadata({
      title: "Saved",
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));

    expect(await saveButton(renderPage()).props.onClick()).toBe(true);

    backend.saveMetadata.mockRejectedValue(new Error("disk full"));
    expect(await saveButton(renderPage()).props.onClick()).toBe(false);
    expect(toast.toastError).toHaveBeenCalledWith("Save failed", expect.stringContaining("disk full"));
  });

  it("refuses to save while the Steam App ID text holds an unapplied match", async () => {
    configureShortcutPanel();
    state.values[8] = "15200";

    expect(await saveButton(renderPage()).props.onClick()).toBe(false);

    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(toast.toastWarn).toHaveBeenCalledWith("Steam App ID not applied", expect.any(String));
  });

  it("keeps restore available after metadata removal", async () => {
    const managed = { original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 };
    configureShortcutPanel({ management: { state: managed }, current: "Steam Name", status: "managed" });
    backend.removeMetadata.mockResolvedValue({});

    removeViaMenu(renderPage());
    await flushAsyncWork();

    expect(action(renderPage(), "Restore original name")).toBeDefined();
  });

  it("closes the editor after a successful removal so Save cannot recreate a record", async () => {
    configureShortcutPanel();
    backend.removeMetadata.mockResolvedValue({});

    removeViaMenu(renderPage());
    await flushAsyncWork();

    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("stays in the editor when removal fails", async () => {
    configureShortcutPanel();
    backend.removeMetadata.mockRejectedValue(new Error("disk full"));

    removeViaMenu(renderPage());
    await flushAsyncWork();

    expect(toast.toastError).toHaveBeenCalledWith("Remove failed", "disk full");
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("excludes repeated confirmations and other editor actions while a rename is pending", async () => {
    configureShortcutPanel();
    steam.nativeShortcutName.mockReturnValue("Original");
    const pendingState = deferred<any>();
    backend.saveShortcutNameState.mockReturnValue(pendingState.promise);

    action(renderPage(), "Use Steam name").props.onClick();
    const modal = ui.showModal.mock.calls[0][0];
    modal.props.onOK();
    await Promise.resolve();
    expect(backend.saveShortcutNameState).toHaveBeenCalledTimes(1);
    expect(state.values[7]).toBe(true);
    void saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).not.toHaveBeenCalled();

    modal.props.onOK();
    expect(backend.saveShortcutNameState).toHaveBeenCalledTimes(1);

    steam.setShortcutNameAndWait.mockResolvedValue("Steam Name");
    pendingState.resolve({ original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 });
    await flushAsyncWork();
    expect(state.values[7]).toBe(false);
    expect(toast.toastSuccess).toHaveBeenCalledWith("Shortcut name updated", expect.any(String));
  });

  it("backfills a legacy Steam match exactly once and shows the returned proposal", async () => {
    effects.enabled = true;
    backend.getMetadata.mockResolvedValue(makeMetadata({ steam_appid: 15100, steam_store_name: "" }));
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());
    backend.enrichSteamApp.mockResolvedValue(makeMetadata({ steam_appid: 15100, steam_store_name: "Steam Name" }));

    renderPage();
    await effects.callbacks[0]();
    await flushAsyncWork();
    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);
    expect(text(renderPage())).toContain("Steam: Steam Name");
    // The backfill persists the name, so the stored snapshot now offers it.
    expect(action(renderPage(), "Use Steam name")).toBeDefined();

    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);
  });

  it("does not backfill a Steam name while a preview of another match is pending", async () => {
    effects.enabled = true;
    backend.getMetadata.mockResolvedValue(makeMetadata({ steam_appid: 15100, steam_store_name: "" }));
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15200,
      steam_store_name: "New Steam Name",
    }));

    renderPage();
    await effects.callbacks[0]();
    await flushAsyncWork();
    effects.callbacks = [];
    renderPage();
    state.values[8] = "15200";
    await action(renderPage(), "Apply Steam App ID").props.onClick();

    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();

    expect(backend.previewSteamMetadata).toHaveBeenCalledTimes(1);
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
  });

  it("does not retry a failed legacy backfill on each render", async () => {
    effects.enabled = true;
    backend.getMetadata.mockResolvedValue(makeMetadata({ steam_appid: 15100, steam_store_name: "" }));
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());
    backend.enrichSteamApp.mockRejectedValue(new Error("offline"));

    renderPage();
    await effects.callbacks[0]();
    await flushAsyncWork();
    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);
    expect(text(renderPage())).toContain("Steam did not return an official name");

    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);
  });

  it("waits for the current entry metadata before starting its one-time backfill", async () => {
    effects.enabled = true;
    const listedMetadata = deferred<any>();
    configureShortcutPanel({ metadata: { steam_appid: 15100, steam_store_name: "" } });
    backend.getMetadata.mockImplementation((id: number) =>
      id === 101 ? listedMetadata.promise : new Promise(() => {}),
    );
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());
    backend.enrichSteamApp.mockResolvedValue(makeMetadata({
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));

    renderPage();
    route.appid = "101";
    effects.callbacks = [];
    renderPage();
    effects.callbacks[1]();
    effects.callbacks[2]();
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();

    const loadingListed = effects.callbacks[0]();
    listedMetadata.resolve(makeMetadata({ steam_appid: 15100, steam_store_name: "" }));
    await loadingListed;
    await flushAsyncWork();

    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();

    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);
    expect(text(renderPage())).toContain("Steam: Steam Name");
  });

  it("merges a delayed legacy backfill while preserving an unsaved form edit", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Original", description: "Saved long", short_description: "Saved summary", source: "IGN", release_date: "2009-04-28", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(oldResponse.promise);
    state.values[3] = "2009-04-28";

    renderPage();
    effects.callbacks[2]();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "Unsaved edit" } });
    walk(renderPage(), node => node.type === "TextField" && node.props.value === "2009-04-28")[0]
      .props.onChange({ target: { value: "2024-11-03" } });
    oldResponse.resolve(makeMetadata({
      title: "Original",
      description: "Saved long",
      short_description: "Saved summary",
      source: "IGN",
      release_date: "2009-04-28",
      steam_appid: 15100,
      steam_store_name: "Old Steam Name",
    }));
    await flushAsyncWork();

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "Unsaved edit",
      description: "Saved long",
      short_description: "Saved summary",
      source: "IGN",
      release_date: "2009-04-28",
      steam_store_name: "Old Steam Name",
    }));
    expect(state.values[1]).toBe("");
    // The cache is stored data only; the unsaved edit stays in the form.
    expect(steam.metadataCache["100"]).toEqual(expect.objectContaining({
      title: "Original",
      description: "Saved long",
      short_description: "Saved summary",
      source: "IGN",
      release_date: "2009-04-28",
    }));
    expect(state.values[3]).toBe("2024-11-03");
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      release_date: "2024-11-03", source: "IGN", description: "Saved long", short_description: "Saved summary", steam_appid: 15100,
    }));
  });

  it("keeps an edit made before the backfill starts", async () => {
    effects.enabled = true;
    const pendingBackfill = deferred<MetadataData>();
    configureShortcutPanel({ metadata: { title: "Stored title", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(pendingBackfill.promise);

    renderPage();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "Edit before backfill" } });
    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    pendingBackfill.resolve(makeMetadata({
      title: "Stored title",
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));
    await flushAsyncWork();

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "Edit before backfill",
      steam_store_name: "Steam Name",
    }));
    expect(steam.metadataCache["100"]).toEqual(expect.objectContaining({ title: "Stored title" }));
  });

  it("discards a delayed legacy backfill after the user previews another Steam ID", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    const previewed = makeMetadata({ title: "New match", steam_appid: 15200, steam_store_name: "New Steam Name" });
    configureShortcutPanel({ metadata: { title: "Original", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValueOnce(oldResponse.promise);
    backend.previewSteamMetadata.mockResolvedValue(previewed);

    renderPage();
    effects.callbacks[2]();
    const fields = walk(renderPage(), (node) => node.type === "TextField");
    fields[fields.length - 1]
      .props.onChange({ target: { value: "15200" } });
    await action(renderPage(), "Apply Steam App ID").props.onClick();
    oldResponse.resolve(makeMetadata({ title: "Original", steam_appid: 15100, steam_store_name: "Old Steam Name" }));
    await flushAsyncWork();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(state.values[0]).toEqual(expect.objectContaining({ steam_appid: 15200, steam_store_name: "New Steam Name" }));
    expect(steam.metadataCache["100"]).toBeUndefined();
  });

  it("discards a delayed legacy backfill after metadata removal", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Original", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(oldResponse.promise);
    backend.removeMetadata.mockResolvedValue({});

    renderPage();
    effects.callbacks[2]();
    removeViaMenu(renderPage());
    await flushAsyncWork();
    oldResponse.resolve(makeMetadata({ title: "Original", steam_appid: 15100, steam_store_name: "Old Steam Name" }));
    await flushAsyncWork();

    expect(state.values[0].title).toBe("Shortcut");
    expect(state.values[0].steam_store_name).toBeUndefined();
    expect(steam.metadataCache["100"]).toBeUndefined();
  });

  it("discards a delayed legacy backfill after navigation to another shortcut", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Original", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(oldResponse.promise);

    renderPage();
    effects.callbacks[2]();
    route.appid = "101";
    effects.callbacks = [];
    renderPage();
    effects.callbacks[1]();
    state.values[0] = makeMetadata({ title: "New editor", steam_appid: 15200, steam_store_name: "" });
    oldResponse.resolve(makeMetadata({ title: "Original", steam_appid: 15100, steam_store_name: "Old Steam Name" }));
    await flushAsyncWork();

    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toEqual(expect.objectContaining({ title: "New editor", steam_store_name: "" }));
  });

  it("resets the IGN search query and results when the editor moves to another game", async () => {
    effects.enabled = true;
    configureShortcutPanel();
    steam.appName.mockImplementation((appId?: number) => (appId === 200 ? "Second Game" : "Shortcut"));
    backend.searchMetadata.mockResolvedValue([
      { title: "Old game result", description: "Old game", slug: "old-game", url: "https://www.ign.com/games/old-game" },
    ]);

    ignSearchInput(renderPage()).props.onChange({ target: { value: "Old game query" } });
    await ignSearchButton(renderPage()).props.onClick();
    expect(backend.searchMetadata).toHaveBeenCalledWith("Old game query", 8);
    expect(text(renderPage())).toContain("Old game result");

    route.appid = "200";
    effects.callbacks = [];
    renderPage();
    effects.callbacks[1]();

    const switched = renderPage();
    expect(ignSearchInput(switched).props.value).toBe("Second Game");
    expect(text(switched)).not.toContain("Old game result");
    expect(text(switched)).toContain("No results yet.");
  });

  it("drops an IGN search reply that resolves after the editor moved to another game", async () => {
    effects.enabled = true;
    configureShortcutPanel();
    steam.appName.mockImplementation((appId?: number) => (appId === 200 ? "Second Game" : "Shortcut"));
    const pendingSearch = deferred<any>();
    backend.searchMetadata.mockReturnValue(pendingSearch.promise);

    ignSearchInput(renderPage()).props.onChange({ target: { value: "Old game query" } });
    const searching = ignSearchButton(renderPage()).props.onClick();

    route.appid = "200";
    effects.callbacks = [];
    renderPage();
    effects.callbacks[1]();
    pendingSearch.resolve([
      { title: "Old game result", description: "Old game", slug: "old-game", url: "https://www.ign.com/games/old-game" },
    ]);
    await searching;
    await flushAsyncWork();

    const switched = renderPage();
    expect(text(switched)).not.toContain("Old game result");
    expect(ignSearchInput(switched).props.value).toBe("Second Game");
  });

  it("hydrates untouched fields without discarding an edit made before metadata loads", async () => {
    effects.enabled = true;
    const pendingMetadata = deferred<any>();
    const saved = makeMetadata({
      title: "Saved title",
      description: "Saved description",
      steam_appid: 15200,
      steam_store_name: "Saved Steam name",
    });
    backend.getMetadata.mockReturnValue(pendingMetadata.promise);
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());

    renderPage();
    const loading = effects.callbacks[0]();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "New title" } });
    pendingMetadata.resolve(saved);
    await loading;
    await flushAsyncWork();

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "New title",
      description: "Saved description",
      steam_appid: 15200,
      steam_store_name: "Saved Steam name",
    }));
    backend.saveMetadata.mockResolvedValue(saved);
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
      steam_store_name: "Saved Steam name",
    }));
  });

  it("does not save the default form over a record that has not loaded yet", async () => {
    effects.enabled = true;
    const pendingMetadata = deferred<any>();
    backend.getMetadata.mockReturnValue(pendingMetadata.promise);
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());

    renderPage();
    const loading = effects.callbacks[0]();
    await saveButton(renderPage()).props.onClick();
    await action(renderPage(), "Apply Steam App ID").props.onClick();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(toast.toastWarn).toHaveBeenCalledWith("Not loaded", expect.any(String));

    pendingMetadata.resolve(makeMetadata({ title: "Saved title", description: "Saved description" }));
    await loading;
    await flushAsyncWork();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({ description: "Saved description" }));
  });

  it("keeps a newer title edit while previewing a changed Steam match", async () => {
    const pendingPreview = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Old title", steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);

    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "New title" } });
    pendingPreview.resolve(makeMetadata({ title: "Steam title", steam_appid: 15200, steam_store_name: "New Steam name" }));
    await applying;
    await flushAsyncWork();

    const titleLabel = walk(renderPage(), (node) => node.type === "label" && text(node).startsWith("Title"))[0];
    expect(text(titleLabel)).toContain("Edited");
    expect(text(titleLabel)).not.toContain("From Steam");

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
      steam_store_name: "New Steam name",
    }));
    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
    }), 15200);
  });

  it.each([null, "NativeTextarea"])("keeps an explicit clear during a pending Steam preview (%s)", async (component) => {
    textarea.component = component;
    const pendingPreview = deferred<any>();
    configureShortcutPanel({ metadata: { description: "Long", short_description: "" } });
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);
    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    const description = () => walk(renderPage(), node => node.type === (component || "textarea"))[0];
    description().props.onChange({ target: { value: "" } });
    pendingPreview.resolve(makeMetadata({ description: "Provider prose", short_description: "Provider summary", steam_appid: 15200, title: "Enriched title", developers: [{ name: "Developer", url: "" }] }));
    await applying;
    expect(description().props.value).toBe("");
    expect(state.values[0]).toMatchObject({ description: "", short_description: "", title: "Enriched title" });
    expect(state.values[1]).toBe("Developer");
    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({ description: "", short_description: "", title: "Enriched title" }), 15200);
    textarea.component = null;
  });

  it.each([["2024-11-03"], [""]])("keeps a newer date edit during a pending Steam preview with value %s", async (value) => {
    const pendingPreview = deferred<MetadataData>();
    configureShortcutPanel({ metadata: { description: "Long", short_description: "Short", release_date: "2009-04-28" } });
    state.values[3] = "2009-04-28";
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);
    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    walk(renderPage(), node => node.type === "TextField" && node.props.value === "2009-04-28")[0].props.onChange({ target: { value } });
    pendingPreview.resolve(makeMetadata({ description: "Provider long", short_description: "Provider short", release_date: "2023-11-14", steam_appid: 15200 }));
    await applying;
    expect(state.values[3]).toBe(value);
    backend.savePreviewedMetadata.mockImplementation(async (_id, metadata) => metadata);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({ release_date: value || null, steam_appid: 15200 }), 15200);
  });

  it("reconciles every untouched field from a successful Steam preview", async () => {
    const enriched = makeMetadata({
      title: "Steam title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      publishers: [{ name: "Steam publisher", url: "" }],
      release_date: "2023-11-14",
      rating: 92,
      store_categories: [1, 2],
      steam_appid: 15200,
      steam_store_name: "Steam title",
      steam_store_url: "https://store.steampowered.com/app/15200/",
      steam_dlc_appids: [10, 20],
      has_points_shop: true,
      deck_compat_category: 3,
    });
    configureShortcutPanel({ metadata: { title: "Before enrichment", description: "Old description" } });
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockResolvedValue(enriched);

    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    await applying;

    expect(backend.previewSteamMetadata).toHaveBeenCalledWith(expect.objectContaining({ steam_appid: 15200 }), "english");
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
    expect(steam.setMetadataCacheEntry).not.toHaveBeenCalled();
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "Steam title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      publishers: [{ name: "Steam publisher", url: "" }],
      release_date: "2023-11-14",
      rating: 92,
      store_categories: [1, 2],
      steam_dlc_appids: [10, 20],
      has_points_shop: true,
      deck_compat_category: 3,
    }));
    expect(state.values[1]).toBe("Steam developer");
    expect(state.values[2]).toBe("Steam publisher");
    expect(state.values[3]).toBe("2023-11-14");
    expect(state.values[4]).toBe("92");

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "Steam title",
      description: "Steam description",
      steam_dlc_appids: [10, 20],
      deck_compat_category: 3,
    }), 15200);
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.applyMetadata).toHaveBeenCalledWith(100, { publishCompatibility: false });
  });

  it("keeps a concurrent title edit while reconciling untouched Steam preview fields", async () => {
    const pendingPreview = deferred<any>();
    const enriched = makeMetadata({
      title: "Steam title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      steam_appid: 15200,
      steam_store_name: "Steam title",
      steam_store_url: "https://store.steampowered.com/app/15200/",
      steam_dlc_appids: [10],
      has_points_shop: true,
      deck_compat_category: 2,
    });
    configureShortcutPanel({ metadata: { title: "Before enrichment", description: "Old description" } });
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);

    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    await flushAsyncWork();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "My title" } });
    pendingPreview.resolve(enriched);
    await applying;

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "My title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      steam_dlc_appids: [10],
      deck_compat_category: 2,
    }));
    expect(steam.metadataCache["100"]).toBeUndefined();

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "My title",
      description: "Steam description",
      steam_dlc_appids: [10],
    }), 15200);
    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "My title",
      description: "Steam description",
    }));
  });

  it("clears the Steam match in the form without a backend call and saves it on Save", async () => {
    configureShortcutPanel({
      metadata: {
        title: "User title",
        steam_appid: 15100,
        steam_store_name: "Old Steam name",
        steam_store_url: "https://store.steampowered.com/app/15100/",
        deck_compat_category: 3,
        steamos_compat_category: 2,
        steam_machine_compat_category: 2,
        steam_frame_compat_category: 1,
        steam_news: [{ title: "Old news" }],
        steam_news_enriched_at: 1700000000,
        steam_dlc_appids: [123],
        has_points_shop: true,
        steam_store_state: "available",
      },
    });
    state.values[15] = 3;
    state.values[16] = "steam";
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("steam");
    state.values[8] = "";

    await action(renderPage(), "Apply Steam App ID").props.onClick();

    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "User title",
      steam_appid: null,
      deck_compat_category: null,
      steamos_compat_category: null,
      steam_machine_compat_category: null,
      steam_frame_compat_category: null,
      steam_news: [],
      steam_news_enriched_at: 0,
      steam_dlc_appids: [],
      has_points_shop: false,
      steam_store_name: "",
      steam_store_url: "",
    }));
    expect(state.values[0].steam_store_state).toBeUndefined();
    expect(state.values[8]).toBe("");
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
    expect(dropdown(renderPage()).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — original Steam status)",
    );

    backend.saveMetadata.mockResolvedValue(makeMetadata({ title: "User title", steam_appid: null }));
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ steam_appid: null }));
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
  });

  it("refuses unresolvable Steam App ID text and keeps the saved match", async () => {
    configureShortcutPanel({ metadata: { steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "not a steam id";

    await action(renderPage(), "Apply Steam App ID").props.onClick();

    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(toast.toastWarn).toHaveBeenCalledWith("Invalid Steam App ID", expect.any(String));
    expect(state.values[0]).toEqual(expect.objectContaining({
      steam_appid: 15100,
      steam_store_name: "Old Steam name",
    }));
  });

  it("treats a whitespace-only Steam App ID as an empty match", async () => {
    configureShortcutPanel({ metadata: { steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "   ";

    await action(renderPage(), "Apply Steam App ID").props.onClick();

    expect(toast.toastWarn).not.toHaveBeenCalled();
    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(state.values[0]).toEqual(expect.objectContaining({ steam_appid: null, steam_store_name: "" }));
    expect(state.values[8]).toBe("");
  });

  it("does not let an old rename operation overwrite a later A editor entry", async () => {
    const nativeWrite = deferred<string>();
    const firstA = { original_name: "First A", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 1 };
    const returningA = { original_name: "Returning A", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 2 };
    configureShortcutPanel({ management: { state: null }, current: "First A" });
    steam.nativeShortcutName.mockReturnValue("First A");
    backend.saveShortcutNameState.mockResolvedValue(firstA);
    steam.setShortcutNameAndWait.mockReturnValue(nativeWrite.promise);

    action(renderPage(), "Use Steam name").props.onClick();
    ui.showModal.mock.calls[0][0].props.onOK();
    await flushAsyncWork();

    route.appid = "101";
    renderPage();
    state.values[9] = shortcutState({ state: { original_name: "B original", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 1 } });
    state.values[11] = "Shared Steam name";
    route.appid = "100";
    renderPage();
    state.values[9] = shortcutState({ state: returningA });
    state.values[11] = "Shared Steam name";

    nativeWrite.resolve("Shared Steam name");
    await flushAsyncWork();

    expect(state.values[9]).toEqual(shortcutState({ state: returningA }));
    expect(toast.toastSuccess).not.toHaveBeenCalledWith("Shortcut name updated", expect.any(String));
  });

  it("ignores a stale name-operation modal callback after navigation", () => {
    configureShortcutPanel({ current: "First A" });
    action(renderPage(), "Use Steam name").props.onClick();
    const oldModal = ui.showModal.mock.calls[0][0];

    route.appid = "101";
    renderPage();
    oldModal.props.onOK();

    expect(backend.saveShortcutNameState).not.toHaveBeenCalled();
    expect(steam.setShortcutNameAndWait).not.toHaveBeenCalled();
  });

  it("clears captured restore history after navigation without changing the new editor", async () => {
    const nativeRestore = deferred<string>();
    const managedA = { original_name: "A original", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 1 };
    const managedB = { original_name: "B original", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 2 };
    const history = new Map([[100, managedA], [101, managedB]]);
    configureShortcutPanel({ management: { state: managedA }, current: "Shared Steam name", status: "managed" });
    steam.nativeShortcutName.mockReturnValue("Shared Steam name");
    steam.setShortcutNameAndWait.mockReturnValue(nativeRestore.promise);
    backend.clearShortcutNameState.mockImplementation(async (id: number) => {
      history.delete(id);
      return { ok: true };
    });

    action(renderPage(), "Restore original name").props.onClick();
    ui.showModal.mock.calls[0][0].props.onOK();
    await flushAsyncWork();

    route.appid = "101";
    renderPage();
    const bMetadata = makeMetadata({ title: "B metadata", description: "B description" });
    state.values[0] = bMetadata;
    state.values[9] = shortcutState({ state: managedB });
    state.values[11] = "Shared Steam name";
    nativeRestore.resolve("A original");
    await flushAsyncWork();

    expect(backend.clearShortcutNameState).toHaveBeenCalledWith(100);
    expect(history.has(100)).toBe(false);
    expect(history.get(101)).toEqual(managedB);
    expect(state.values[0]).toBe(bMetadata);
    expect(state.values[9]).toEqual(shortcutState({ state: managedB }));
    expect(toast.toastSuccess).not.toHaveBeenCalledWith("Shortcut name restored", expect.any(String));
  });

  it("keeps captured restore history after cleanup failure without changing the new editor", async () => {
    const nativeRestore = deferred<string>();
    const managedA = { original_name: "A original", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 1 };
    const managedB = { original_name: "B original", applied_name: "Shared Steam name", steam_appid: 15100, updated_at: 2 };
    const history = new Map([[100, managedA], [101, managedB]]);
    configureShortcutPanel({ management: { state: managedA }, current: "Shared Steam name", status: "managed" });
    steam.nativeShortcutName.mockReturnValue("Shared Steam name");
    steam.setShortcutNameAndWait.mockReturnValue(nativeRestore.promise);
    backend.clearShortcutNameState.mockImplementation(async (id: number) => {
      if (id === 100) throw new Error("storage unavailable");
      history.delete(id);
      return { ok: true };
    });

    action(renderPage(), "Restore original name").props.onClick();
    ui.showModal.mock.calls[0][0].props.onOK();
    await flushAsyncWork();

    route.appid = "101";
    renderPage();
    const bMetadata = makeMetadata({ title: "B metadata", description: "B description" });
    state.values[0] = bMetadata;
    state.values[9] = shortcutState({ state: managedB });
    state.values[11] = "Shared Steam name";
    nativeRestore.resolve("A original");
    await flushAsyncWork();

    expect(backend.clearShortcutNameState).toHaveBeenCalledWith(100);
    expect(history.get(100)).toEqual(managedA);
    expect(history.get(101)).toEqual(managedB);
    expect(state.values[0]).toBe(bMetadata);
    expect(state.values[9]).toEqual(shortcutState({ state: managedB }));
    expect(toast.toastError).not.toHaveBeenCalledWith("Shortcut name restored", expect.any(String));
  });
});


describe("Steam text language", () => {
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    refs.values = [];
    refs.cursor = 0;
    effects.enabled = false;
    effects.callbacks = [];
    route.appid = "100";
    vi.clearAllMocks();
    i18nLanguage.currentSteamLanguage.mockReset();
    i18nLanguage.currentSteamLanguage.mockResolvedValue("english");
    Object.keys(steam.metadataCache).forEach((key) => delete steam.metadataCache[key]);
    steam.isNonSteamApp.mockReturnValue(true);
  });

  const show = (metadata: Record<string, unknown>, language: string) => {
    state.values[0] = makeMetadata(metadata);
    state.values[8] = metadata.steam_appid ? String(metadata.steam_appid) : "";
    state.values[14] = 0;
    state.values[18] = language;
    return renderPage();
  };

  it("offers the manual refetch only while the stored language differs", () => {
    const mismatch = show({ steam_appid: 15100, metadata_language: "english" }, "french");
    expect(text(mismatch)).toContain("Steam text language: English");
    expect(action(mismatch, "Fetch Steam text in French")).toBeDefined();

    const matching = show({ steam_appid: 15100, metadata_language: "french" }, "french");
    expect(action(matching, "Fetch Steam text in French")).toBeUndefined();

    // Records without the field were fetched in English.
    const legacy = show({ steam_appid: 15100 }, "french");
    expect(action(legacy, "Fetch Steam text in French")).toBeDefined();

    const unmatched = show({ steam_appid: null, metadata_language: "english" }, "french");
    expect(action(unmatched, "Fetch Steam text in French")).toBeUndefined();
  });

  it("reads the Steam language when the editor opens", async () => {
    effects.enabled = true;
    i18nLanguage.currentSteamLanguage.mockResolvedValue("french");
    state.values[0] = makeMetadata({ steam_appid: 15100, metadata_language: "english" });
    state.values[14] = 0;
    renderPage();
    effects.callbacks[5]();
    await flushAsyncWork();
    expect(action(renderPage(), "Fetch Steam text in French")).toBeDefined();
  });

  it("previews Steam text in the current language without storing it", async () => {
    const page = show({
      steam_appid: 15100,
      metadata_language: "english",
      description: "Old",
      short_description: "Old",
    }, "french");
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15100,
      metadata_language: "french",
      description: "Nouveau",
      short_description: "Nouveau",
    }));

    await action(page, "Fetch Steam text in French").props.onClick();
    await flushAsyncWork();

    expect(backend.previewSteamMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ steam_appid: 15100 }),
      "french",
    );
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.setMetadataCacheEntry).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
    expect(state.values[0]).toEqual(expect.objectContaining({
      metadata_language: "french",
      description: "Nouveau",
    }));
    expect(toast.toastSuccess).toHaveBeenCalledWith("Details loaded", expect.stringContaining("Save"));
    expect(action(renderPage(), "Fetch Steam text in French")).toBeUndefined();

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenCalledWith(100, expect.objectContaining({
      steam_appid: 15100,
      description: "Nouveau",
    }), 15100);
    expect(backend.saveMetadata).not.toHaveBeenCalled();
  });

  it("refreshes the language of an unsaved preview instead of the stored match", async () => {
    show({ steam_appid: 15100, metadata_language: "english", description: "Old" }, "french");
    backend.previewSteamMetadata.mockResolvedValueOnce(makeMetadata({
      steam_appid: 15200,
      metadata_language: "english",
      description: "New Steam text",
      short_description: "New Steam text",
    }));
    state.values[8] = "15200";

    await action(renderPage(), "Apply Steam App ID").props.onClick();
    expect(backend.previewSteamMetadata.mock.calls[0][0]).toEqual(expect.objectContaining({ steam_appid: 15200 }));

    // Still an English draft, so the language button remains for the previewed id.
    backend.previewSteamMetadata.mockResolvedValueOnce(makeMetadata({
      steam_appid: 15200,
      metadata_language: "french",
      description: "Texte français",
      short_description: "Texte français",
    }));
    await action(renderPage(), "Fetch Steam text in French").props.onClick();

    expect(backend.previewSteamMetadata).toHaveBeenCalledTimes(2);
    expect(backend.previewSteamMetadata.mock.calls[1][0]).toEqual(expect.objectContaining({ steam_appid: 15200 }));
    expect(backend.previewSteamMetadata.mock.calls[1][1]).toBe("french");
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toEqual(expect.objectContaining({
      steam_appid: 15200,
      description: "Texte français",
    }));
  });

  it("reports a failed preview without applying a record", async () => {
    const page = show({ steam_appid: 15100, metadata_language: "english" }, "french");
    backend.previewSteamMetadata.mockRejectedValue(new Error("offline"));

    await action(page, "Fetch Steam text in French").props.onClick();
    await flushAsyncWork();

    expect(toast.toastError).toHaveBeenCalledWith("Fetch failed", expect.stringContaining("offline"));
    expect(steam.setMetadataCacheEntry).not.toHaveBeenCalled();
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
  });
});

describe("metadata summary and date persistence", () => {
  beforeEach(() => { state.values = []; refs.values = []; effects.enabled = false; textarea.component = null; vi.clearAllMocks(); backend.saveMetadata.mockImplementation(async (_id, metadata) => metadata); });
  it("displays saved summary but saves the original untouched description and calendar date", async () => {
    state.values[0] = makeMetadata({ description: "Retained long prose", short_description: "Source summary", release_date: "2009-04-28" });
    state.values[14] = 0;
    state.values[3] = "2009-04-28";
    const page = renderPage();
    expect(walk(page, node => node.type === "textarea")[0].props.value).toBe("Source summary");
    await saveButton(page).props.onClick();
    expect(backend.saveMetadata.mock.calls[0][1]).toMatchObject({ description: "Retained long prose", short_description: "Source summary", release_date: "2009-04-28" });
  });
  it("uses a long fallback when the saved summary contains only whitespace", () => {
    state.values[0] = makeMetadata({ description: "Readable fallback", short_description: " \n " });
    expect(walk(renderPage(), node => node.type === "textarea")[0].props.value).toBe("Readable fallback");
  });
  it("keeps a legitimate absent date absent on an unrelated save", async () => {
    state.values[0] = makeMetadata({ release_date: null });
    state.values[14] = 0;
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata.mock.calls[0][1].release_date).toBeNull();
  });
  it("saves a changed calendar date and supports explicitly clearing it", async () => {
    state.values[0] = makeMetadata({ release_date: "2009-04-28" });
    state.values[14] = 0;
    state.values[3] = "2009-04-28";
    renderPage();
    const field = walk(renderPage(), node => node.type === "TextField" && node.props.value === "2009-04-28")[0];
    field.props.onChange({ target: { value: "2024-03-10" } });
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata.mock.calls[0][1].release_date).toBe("2024-03-10");
    walk(renderPage(), node => node.type === "TextField" && node.props.value === "2024-03-10")[0].props.onChange({ target: { value: "" } });
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata.mock.calls[1][1].release_date).toBeNull();
  });
  it("saves an HLTB game typed into its field when Save is pressed, and refuses an invalid one", async () => {
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    backend.checkHltbGameId.mockResolvedValue({ found: true, game_id: 6064, game_name: "Minecraft" });
    const hltbField = () => walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0];
    hltbField().props.onChange({ target: { value: "not a game" } });
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    hltbField().props.onChange({ target: { value: "https://howlongtobeat.com/game/6064" } });
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata.mock.calls[0][1].hltb_game_id).toBe(6064);
  });
  it("checks an applied HLTB game and keeps it as the draft until Save", async () => {
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    backend.checkHltbGameId.mockResolvedValue({ found: true, game_id: 6064, game_name: "Minecraft" });
    const hltbField = () => walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0];

    hltbField().props.onChange({ target: { value: "https://howlongtobeat.com/game/6064" } });
    await action(renderPage(), "Apply HLTB game").props.onClick();

    expect(backend.checkHltbGameId).toHaveBeenCalledWith(6064);
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(hltbField().props.value).toBe("6064");
    expect(toast.toastSuccess).toHaveBeenCalledWith("HLTB game: Minecraft", "Save stores this choice.");

    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata.mock.calls[0][1].hltb_game_id).toBe(6064);
  });
  it("drops a delayed HLTB check after the editor moves to another game", async () => {
    effects.enabled = true;
    const pending = deferred<{ found: true; game_id: number; game_name: string }>();
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    backend.checkHltbGameId.mockReturnValue(pending.promise);
    const hltbField = () => walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0];

    hltbField().props.onChange({ target: { value: "6064" } });
    const applying = action(renderPage(), "Apply HLTB game").props.onClick();

    route.appid = "200";
    effects.callbacks = [];
    renderPage();
    effects.callbacks[1]();
    // B has its own draft; the delayed A check must not touch it.
    state.values[17] = "77";
    pending.resolve({ found: true, game_id: 6064, game_name: "Minecraft" });
    await applying;
    await flushAsyncWork();

    expect(hltbField().props.value).toBe("77");
    expect(toast.toastSuccess).not.toHaveBeenCalledWith("HLTB game: Minecraft", expect.any(String));
    route.appid = "100";
  });

  it("keeps newer HLTB typing while an earlier check is pending", async () => {
    const pending = deferred<{ found: true; game_id: number; game_name: string }>();
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    backend.checkHltbGameId.mockReturnValue(pending.promise);
    const hltbField = () => walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0];

    hltbField().props.onChange({ target: { value: "6064" } });
    const applying = action(renderPage(), "Apply HLTB game").props.onClick();
    hltbField().props.onChange({ target: { value: "9999" } });

    pending.resolve({ found: true, game_id: 6064, game_name: "Minecraft" });
    await applying;

    expect(hltbField().props.value).toBe("9999");
    expect(toast.toastSuccess).not.toHaveBeenCalledWith("HLTB game: Minecraft", expect.any(String));
  });
  it("does not carry an unsaved HLTB draft into another game", () => {
    effects.enabled = true;
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    const hltbField = () =>
      walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0];

    hltbField().props.onChange({ target: { value: "6064" } });
    expect(hltbField().props.value).toBe("6064");

    route.appid = "200";
    effects.callbacks = [];
    renderPage();
    effects.callbacks[1]();

    expect(hltbField().props.value).toBe("");
    route.appid = "100";
  });
  it("keeps an HLTB draft typed while Save is pending", async () => {
    const pendingSave = deferred<MetadataData>();
    const saved = makeMetadata({ hltb_game_id: 6064, title: "Saved title" });
    route.appid = "100";
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    const current = state.values[0];
    backend.checkHltbGameId.mockResolvedValue({ found: true, game_id: 6064, game_name: "Minecraft" });
    backend.saveMetadata.mockReturnValueOnce(pendingSave.promise);
    const hltbField = () =>
      walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0];

    hltbField().props.onChange({ target: { value: "6064" } });
    const saving = saveButton(renderPage()).props.onClick();
    await flushAsyncWork();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ hltb_game_id: 6064 }));
    hltbField().props.onChange({ target: { value: "9999" } });
    pendingSave.resolve(saved);
    await saving;
    await flushAsyncWork();

    expect(hltbField().props.value).toBe("9999");
    expect(state.values[0]).toBe(current);
  });
  it("aborts a Save whose HLTB check resolves after a newer edit", async () => {
    const pending = deferred<{ found: true; game_id: number; game_name: string }>();
    state.values[0] = makeMetadata({ title: "Stored title" });
    state.values[14] = 0;
    backend.checkHltbGameId.mockReturnValue(pending.promise);

    walk(walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0], node => node.type === "TextField")[0]
      .props.onChange({ target: { value: "6064" } });
    const saving = saveButton(renderPage()).props.onClick();
    await flushAsyncWork();
    walk(renderPage(), node => node.type === "TextField")[1]
      .props.onChange({ target: { value: "Newer title" } });
    pending.resolve({ found: true, game_id: 6064, game_name: "Minecraft" });
    await expect(saving).resolves.toBe(false);

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
  });
  it("shows the automatically found HLTB game without saving it as a choice", async () => {
    state.values[0] = makeMetadata();
    state.values[14] = 0;
    hltbMatch.entry = {
      status: "matched", hltb_id: 6064, game_name: "Minecraft", stats: null,
      steam_appid_used: null, title_used: "Minecraft Bedrock", pinned_id_used: null, fetched_at: 1,
    };
    const section = walk(renderPage(), node => node.props?.title === "HowLongToBeat game")[0];
    expect(walk(section, node => node.type === "TextField")[0].props.value).toBe("6064");
    expect(text(section)).toContain("Minecraft");
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata.mock.calls[0][1].hltb_game_id).toBeUndefined();
    hltbMatch.entry = null;
  });
  it.each([null, "NativeTextarea"])("saves manual text and clearing in both fields through %s", async (component) => {
    textarea.component = component;
    state.values[0] = makeMetadata({ description: "Long", short_description: "Short" });
    state.values[14] = 0;
    for (const input of ["Fly <pilot>\n\nLand", ""]) {
      walk(renderPage(), node => node.type === (component || "textarea"))[0].props.onChange({ target: { value: input } });
      await saveButton(renderPage()).props.onClick();
      expect(backend.saveMetadata.mock.calls[backend.saveMetadata.mock.calls.length - 1]?.[1]).toMatchObject({ description: input, short_description: input });
    }
    textarea.component = null;
  });
});

describe("Steam-match picker application", () => {
  beforeEach(() => {
    state.values = [];
    refs.values = [];
    effects.enabled = false;
    effects.callbacks = [];
    route.appid = "100";
    textarea.component = null;
    vi.clearAllMocks();
    Object.keys(steam.metadataCache).forEach((key) => delete steam.metadataCache[key]);
    steam.isNonSteamApp.mockReturnValue(true);
    steam.nativeShortcutName.mockReturnValue("Shortcut");
  });

  const picker = (page: any) => walk(page, (node) => node.type === SteamMatchPicker)[0];

  it("labels the picker with the stored match, not an unsaved preview", async () => {
    configureShortcutPanel({
      metadata: { title: "Original", steam_appid: 15100, steam_store_name: "Old Steam Name" },
    });
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      title: "New match",
      steam_appid: 15200,
      steam_store_name: "New Steam Name",
    }));

    await picker(renderPage()).props.onApply(15200);

    // The preview is in the form, but only Save stores it.
    expect(state.values[0].steam_appid).toBe(15200);
    expect(picker(renderPage()).props.matchedSteamAppId).toBe(15100);
    expect(backend.saveMetadata).not.toHaveBeenCalled();
  });

  it("previews the chosen match instead of a conflicting manual ID and preserves edits made during the request", async () => {
    const pendingPreview = deferred<MetadataData>();
    configureShortcutPanel({ metadata: { description: "Old description", deck_compat_override: "valve" } });
    state.values[8] = "620";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);
    const applying = picker(renderPage()).props.onApply(400);
    walk(renderPage(), (node) => node.type === "textarea")[0]
      .props.onChange({ target: { value: "My edit during the request" } });
    pendingPreview.resolve(makeMetadata({
      title: "Portal", steam_appid: 400, steam_store_name: "Portal",
      description: "Steam description", short_description: "Steam description",
      developers: [{ name: "Valve", url: "" }], deck_compat_override: "valve",
    }));
    await applying;

    expect(backend.previewSteamMetadata.mock.calls[0][0]).toEqual(expect.objectContaining({
      steam_appid: 400,
      steam_store_name: "",
      deck_compat_category: null,
    }));
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toMatchObject({
      steam_appid: 400, title: "Portal", description: "My edit during the request",
      short_description: "My edit during the request", deck_compat_override: "valve",
    });
    expect(state.values[8]).toBe("400");
    expect(steam.setShortcutNameAndWait).not.toHaveBeenCalled();

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();
    expect(backend.savePreviewedMetadata).toHaveBeenCalledWith(100, expect.objectContaining({
      steam_appid: 400,
      description: "My edit during the request",
    }), 400);
  });

  it("rejects a retired picker callback after visiting another game and returning", async () => {
    const retired = picker(renderPage()).props.onApply;
    route.appid = "101";
    renderPage();
    route.appid = "100";
    renderPage();

    await retired(400);

    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
  });

  it("shows HLTB times again after a removed game gets an IGN match, without a reload", async () => {
    const inputs = { steam: null, title: "Hades", pinned: null };
    configureShortcutPanel({ metadata: { title: "Hades" } });
    // The game page asked once after Remove metadata and was told the game is removed.
    backend.getHltbStats.mockResolvedValueOnce({ status: "blocked" });
    hltbStore.request(100, true, inputs);
    await flushAsyncWork();
    expect(hltbStore.view(100, inputs)).toEqual({ entry: null, needsFetch: false });

    state.values[6] = [{ slug: "hades", url: "https://www.ign.com/games/hades", title: "Hades", description: "" }];
    // The backend merges IGN text into the sent draft and keeps its Steam match.
    backend.previewFetchedMetadata.mockResolvedValue(makeMetadata({
      title: "Hades",
      source: "IGN",
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));
    // `walk` skips nested arrays such as `results.map(...)`; search them here.
    const find = (node: any): any => Array.isArray(node) ? node.map(find).find(Boolean)
      : node && typeof node === "object" ? (String(node.props?.className ?? "").includes("decky-metadata-editor__result")
        ? node : find(node.props?.children)) : undefined;
    const result = find(renderPage());
    await result.props.onClick();
    await flushAsyncWork();

    expect(backend.previewFetchedMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Hades" }),
      "hades",
    );
    expect(backend.applyFetchedMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["100"]).toBeUndefined();
    expect(state.values[0]).toEqual(expect.objectContaining({ title: "Hades", source: "IGN" }));
    expect(hltbStore.view(100, inputs).needsFetch).toBe(true);
  });
});

describe("Steam information toggles", () => {
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    refs.values = [];
    refs.cursor = 0;
    effects.enabled = false;
    vi.clearAllMocks();
    steam.isNonSteamApp.mockReturnValue(true);
  });

  it("labels each toggle, in StoreCategory order", () => {
    // JS orders numeric keys ascending, so this is the display order too.
    const labels = walk(renderPage(), (node) => node.type === "ToggleField")
      .map((node) => node.props.label);
    expect(labels).toEqual([
      "Multiplayer",
      "Single-player",
      "Co-op",
      "MMO",
      "Achievements",
      "Split screen",
      "Full controller support",
      "Online multiplayer",
      "Local multiplayer",
      "Online co-op",
      "Local co-op",
    ]);
  });
});

describe("Draft field markers and editor actions", () => {
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    refs.values = [];
    refs.cursor = 0;
    effects.enabled = false;
    effects.callbacks = [];
    textarea.component = null;
    vi.clearAllMocks();
    i18nLanguage.currentSteamLanguage.mockReset();
    i18nLanguage.currentSteamLanguage.mockResolvedValue("english");
    steam.appName.mockReturnValue("Shortcut");
    steam.cleanTitle.mockImplementation((value: string) => value.trim());
    steam.getOverview.mockReturnValue({ app_type: 1073741824, BIsShortcut: () => true });
    steam.isNonSteamApp.mockReturnValue(true);
    steam.hasShortcutNameApi.mockReturnValue(true);
    steam.classifyShortcutNameState.mockReturnValue("unmanaged");
    steam.nativeShortcutName.mockReturnValue("Shortcut");
    route.appid = "100";
  });

  it("labels Save with the changed-field count and disables it when nothing changed", () => {
    configureShortcutPanel();

    expect(text(saveButton(renderPage()))).toBe("Save");
    expect(saveButton(renderPage()).props.disabled).toBe(true);

    labeledInput(renderPage(), "Title").props.onChange({ target: { value: "Edited title" } });
    const edited = renderPage();
    expect(text(saveButton(edited))).toBe("Save (1)");
    expect(saveButton(edited).props.disabled).toBe(false);

    labeledInput(edited, "Title").props.onChange({ target: { value: "Shortcut" } });
    expect(text(saveButton(renderPage()))).toBe("Save");
    expect(saveButton(renderPage()).props.disabled).toBe(true);
  });

  it("marks a user-edited field as Edited", () => {
    configureShortcutPanel();

    labeledInput(renderPage(), "Title").props.onChange({ target: { value: "Edited title" } });

    const label = walk(renderPage(), (node) => node.type === "label" && text(node).startsWith("Title"))[0];
    expect(text(label)).toContain("Edited");
    expect(text(label)).not.toContain("From Steam");
    expect(label.props.style).toMatchObject({ color: "#1a9fff" });
  });

  it("marks a field a Steam preview filled as From Steam until the user edits it", async () => {
    configureShortcutPanel();
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15100,
      steam_store_name: "Steam Name",
      description: "Steam description",
      short_description: "Steam description",
    }));

    await action(renderPage(), "Apply Steam App ID").props.onClick();

    const previewed = walk(renderPage(), (node) => node.type === "label" && text(node).startsWith("Description"))[0];
    expect(text(previewed)).toContain("From Steam, not saved");
    expect(previewed.props.style).toMatchObject({ color: "#f59e0b" });

    walk(renderPage(), (node) => node.type === "textarea")[0]
      .props.onChange({ target: { value: "My description" } });
    const edited = walk(renderPage(), (node) => node.type === "label" && text(node).startsWith("Description"))[0];
    expect(text(edited)).toContain("Edited");
    expect(text(edited)).not.toContain("From Steam");
  });

  it("shows the Steam-data warning and Save (1) when only hidden Steam data changed", async () => {
    configureShortcutPanel();
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15100,
      steam_store_name: "Steam Name",
      steam_news: [{ id: "1", title: "News", url: "https://example.com/news", date: 1, contents: "" }],
    }));

    openMoreMenu(renderPage())[0].props.onSelected();
    await flushAsyncWork();

    const page = renderPage();
    expect(text(page)).toContain("Steam data not shown in the form");
    expect(text(saveButton(page))).toBe("Save (1)");
  });

  it("clears the markers and disables Save after a successful save", async () => {
    configureShortcutPanel();
    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15100,
      steam_store_name: "Steam Name",
      description: "Steam description",
      short_description: "Steam description",
    }));
    await action(renderPage(), "Apply Steam App ID").props.onClick();
    expect(text(renderPage())).toContain("From Steam, not saved");

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await saveButton(renderPage()).props.onClick();

    const page = renderPage();
    expect(text(page)).not.toContain("From Steam, not saved");
    expect(text(page)).not.toContain("Edited");
    expect(text(saveButton(page))).toBe("Save");
    expect(saveButton(page).props.disabled).toBe(true);
  });

  it("opens the more menu for refresh and confirms removal destructively", async () => {
    configureShortcutPanel();

    const items = openMoreMenu(renderPage());
    expect(ui.showContextMenu).toHaveBeenCalledTimes(1);
    expect(ui.showContextMenu.mock.calls[0][1]).toBe("more-button");
    expect(items).toHaveLength(2);

    backend.previewSteamMetadata.mockResolvedValue(makeMetadata({
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));
    items[0].props.onSelected();
    await flushAsyncWork();
    expect(backend.previewSteamMetadata).toHaveBeenCalled();

    items[1].props.onSelected();
    const modal = lastCall(ui.showModal);
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.bDestructiveWarning).toBe(true);
    expect(backend.removeMetadata).not.toHaveBeenCalled();

    modal.props.onOK();
    await flushAsyncWork();
    expect(backend.removeMetadata).toHaveBeenCalledWith(100);
  });

  it("saves from the controller X shortcut only when the draft changed", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    expect(rootElement(renderPage()).props.onSecondaryActionDescription).toBe("Save");

    rootElement(renderPage()).props.onSecondaryButton();
    await flushAsyncWork();
    expect(backend.saveMetadata).not.toHaveBeenCalled();

    labeledInput(renderPage(), "Title").props.onChange({ target: { value: "Edited title" } });
    rootElement(renderPage()).props.onSecondaryButton();
    await flushAsyncWork();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.any(Object));
  });
});

describe("Leaving the editor with a draft", () => {
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    refs.values = [];
    refs.cursor = 0;
    effects.enabled = false;
    effects.callbacks = [];
    textarea.component = null;
    vi.clearAllMocks();
    i18nLanguage.currentSteamLanguage.mockReset();
    i18nLanguage.currentSteamLanguage.mockResolvedValue("english");
    steam.appName.mockReturnValue("Shortcut");
    steam.getOverview.mockReturnValue({ app_type: 1073741824, BIsShortcut: () => true });
    steam.isNonSteamApp.mockReturnValue(true);
    steam.hasShortcutNameApi.mockReturnValue(true);
    steam.classifyShortcutNameState.mockReturnValue("unmanaged");
    steam.nativeShortcutName.mockReturnValue("Shortcut");
    steam.currentRoutePath.mockImplementation(() => `/decky-metadata/${route.appid}`);
    route.appid = "100";
  });

  const done = (page: unknown) => action(page, "Done");
  const leavePrompt = () => lastCall(ui.showModal);
  const editTitle = (page: unknown, title: string) =>
    labeledInput(page, "Title").props.onChange({ target: { value: title } });

  it("leaves a clean form at once", () => {
    done(renderPage()).props.onClick();

    expect(ui.showModal).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("asks before dropping a draft and leaves Cancel inert", () => {
    configureShortcutPanel();
    editTitle(renderPage(), "Edited title");

    done(renderPage()).props.onClick();

    const modal = leavePrompt();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.strOKButtonText).toBe("Save");
    expect(modal.props.strMiddleButtonText).toBe("Discard");
    expect(modal.props.strCancelButtonText).toBe("Cancel");
    expect(modal.props.onCancel).toBeUndefined();
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
  });

  it("saves and then leaves when the prompt's Save succeeds", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    editTitle(renderPage(), "Edited title");

    done(renderPage()).props.onClick();
    leavePrompt().props.onOK();
    await flushAsyncWork();

    expect(backend.saveMetadata).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ title: "Edited title" }),
    );
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("stays in the editor when the prompt's Save fails", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockRejectedValue(new Error("disk full"));
    editTitle(renderPage(), "Edited title");

    done(renderPage()).props.onClick();
    leavePrompt().props.onOK();
    await flushAsyncWork();

    expect(toast.toastError).toHaveBeenCalledWith("Save failed", "disk full");
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("does not save from the prompt while the Steam-name backfill is pending", async () => {
    const pendingName = deferred<MetadataData>();
    effects.enabled = true;
    backend.getMetadata.mockResolvedValue(makeMetadata({ steam_appid: 15100, steam_store_name: "" }));
    backend.getShortcutNameManagement.mockResolvedValue(shortcutState());
    backend.enrichSteamApp.mockReturnValue(pendingName.promise);
    renderPage();
    await effects.callbacks[0]();
    await flushAsyncWork();
    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);

    editTitle(renderPage(), "Edited title");
    done(renderPage()).props.onClick();
    leavePrompt().props.onOK();
    await flushAsyncWork();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("saves the form as it is when the prompt's Save is chosen", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    editTitle(renderPage(), "Edited title");
    done(renderPage()).props.onClick();
    // A preview that resolves while the prompt is open changes the draft after it opened.
    editTitle(renderPage(), "Newer title");
    renderPage();

    leavePrompt().props.onOK();
    await flushAsyncWork();

    expect(backend.saveMetadata).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ title: "Newer title" }),
    );
  });

  it("ignores a prompt Save after the editor moved to another game", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    editTitle(renderPage(), "Edited title");
    done(renderPage()).props.onClick();
    const prompt = leavePrompt();

    route.appid = "200";
    steam.currentRoutePath.mockImplementation(() => "/decky-metadata/200");
    renderPage();
    prompt.props.onOK();
    await flushAsyncWork();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
    route.appid = "100";
  });

  it("ignores a prompt Save after the editor unmounted", async () => {
    effects.enabled = true;
    configureShortcutPanel();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    editTitle(renderPage(), "Edited title");
    done(renderPage()).props.onClick();
    const prompt = leavePrompt();

    (effects.callbacks[effects.callbacks.length - 1]() as unknown as () => void)();
    prompt.props.onOK();
    await flushAsyncWork();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
  });

  it("does not leave when a delayed save finishes after the route moved on", async () => {
    configureShortcutPanel();
    const pending = deferred<MetadataData>();
    backend.saveMetadata.mockReturnValue(pending.promise);
    editTitle(renderPage(), "Edited title");

    done(renderPage()).props.onClick();
    leavePrompt().props.onOK();
    steam.currentRoutePath.mockImplementation(() => "/routes/library/home");
    pending.resolve(makeMetadata({
      title: "Edited title",
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));
    await flushAsyncWork();

    expect(backend.saveMetadata).toHaveBeenCalled();
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("does not leave when a delayed save finishes after unmount", async () => {
    effects.enabled = true;
    configureShortcutPanel();
    const pending = deferred<MetadataData>();
    backend.saveMetadata.mockReturnValue(pending.promise);
    editTitle(renderPage(), "Edited title");

    done(renderPage()).props.onClick();
    leavePrompt().props.onOK();
    // The last recorded effect is this editor's unmount cleanup.
    (effects.callbacks[effects.callbacks.length - 1]() as unknown as () => void)();
    pending.resolve(makeMetadata({
      title: "Edited title",
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));
    await flushAsyncWork();

    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("discards the draft and leaves", () => {
    configureShortcutPanel();
    editTitle(renderPage(), "Edited title");

    done(renderPage()).props.onClick();
    leavePrompt().props.onMiddleButton();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("treats the controller B button like Done", () => {
    configureShortcutPanel();
    rootElement(renderPage()).props.onCancelButton();
    expect(ui.showModal).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);

    editTitle(renderPage(), "Edited title");
    rootElement(renderPage()).props.onCancelButton();
    expect(leavePrompt().type).toBe("ConfirmModal");
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("prompts when the record is still loading and the user already typed", () => {
    effects.enabled = true;
    const pending = deferred<MetadataData>();
    backend.getMetadata.mockReturnValue(pending.promise);

    renderPage();
    effects.callbacks[0]();

    editTitle(renderPage(), "Typed before load");
    done(renderPage()).props.onClick();

    expect(leavePrompt().type).toBe("ConfirmModal");
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("leaves an untouched form while the record is still loading", () => {
    effects.enabled = true;
    const pending = deferred<MetadataData>();
    backend.getMetadata.mockReturnValue(pending.promise);

    renderPage();
    effects.callbacks[0]();
    done(renderPage()).props.onClick();

    expect(ui.showModal).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("marks the compatibility status Edited until its saved value returns", () => {
    configureShortcutPanel();
    expect(text(saveButton(renderPage()))).toBe("Save");
    expect(text(renderPage())).not.toContain("Edited");

    dropdown(renderPage()).props.onChange({ data: 2 });
    const edited = renderPage();
    expect(text(edited)).toContain("Edited");
    expect(text(saveButton(edited))).toBe("Save (1)");
    expect(dropdown(edited).props.selectedOption).toBe(2);

    dropdown(edited).props.onChange({ data: null });
    const restored = renderPage();
    expect(text(restored)).not.toContain("Edited");
    expect(text(saveButton(restored))).toBe("Save");
    expect(dropdown(restored).props.selectedOption).toBeNull();
  });
});
