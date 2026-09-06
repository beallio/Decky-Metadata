import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));

const backend = vi.hoisted(() => ({
  applyFetchedMetadata: vi.fn(),
  clearShortcutNameState: vi.fn(),
  enrichSteamApp: vi.fn(),
  getShortcutNameManagement: vi.fn(),
  getMetadata: vi.fn(),
  removeMetadata: vi.fn(),
  saveMetadata: vi.fn(),
  saveShortcutNameState: vi.fn(),
  searchMetadata: vi.fn(),
}));

const steam = vi.hoisted(() => ({
  appName: vi.fn(() => "Shortcut"),
  applyMetadata: vi.fn(),
  cleanTitle: vi.fn((value: string) => value.trim()),
  classifyShortcutNameState: vi.fn((_current: string | null, _state: any) => "unmanaged"),
  getOverview: vi.fn(() => ({ app_type: 1073741824, BIsShortcut: () => true })),
  isNonSteamApp: vi.fn(() => true),
  metadataCache: {} as Record<string, any>,
  nativeShortcutName: vi.fn(() => "Shortcut"),
  refreshCompatibilitySurfaces: vi.fn(),
  setShortcutNameAndWait: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarn: vi.fn(),
}));

const state = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
const refs = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
const effects = vi.hoisted(() => ({ enabled: false, callbacks: [] as Array<() => unknown> }));

vi.mock("@decky/ui", () => ({
  ConfirmModal: "ConfirmModal",
  afterPatch: vi.fn(),
  findInReactTree: vi.fn(),
  DropdownItem: "DropdownItem",
  Focusable: "Focusable",
  Navigation: { NavigateBack: vi.fn() },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ScrollPanel: "ScrollPanel",
  TextField: "TextField",
  ToggleField: "ToggleField",
  useParams: () => ({ appid: "100" }),
  showModal: ui.showModal,
}));

vi.mock("./backend", () => backend);
vi.mock("./steam", () => steam);
vi.mock("./steam/gamepadTextArea", () => ({ getGamepadTextArea: () => null }));
vi.mock("./toast", () => toast);
vi.mock("react", () => ({
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

import { MetadataPage } from "./MetadataPage";
import { metadataTemplate } from "./metadataForm";
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

const flushAsyncWork = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

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
  state.values[0] = makeMetadata({
    steam_appid: 15100,
    steam_store_name: "Steam Name",
    ...overrides.metadata,
  });
  state.values[7] = overrides.busy ?? false;
  state.values[9] = shortcutState(overrides.management);
  state.values[10] = overrides.managementError ?? false;
  state.values[11] = overrides.current ?? "Original";
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
    steam.appName.mockReturnValue("Shortcut");
    steam.cleanTitle.mockImplementation((value: string) => value.trim());
    steam.getOverview.mockReturnValue({ app_type: 1073741824, BIsShortcut: () => true });
    steam.isNonSteamApp.mockReturnValue(true);
    steam.classifyShortcutNameState.mockReturnValue("unmanaged");
    steam.nativeShortcutName.mockReturnValue("Shortcut");
  });

  it("shows the native dropdown in the required order with Automatic's Valve status", () => {
    state.values[0] = makeMetadata({ deck_compat_category: 3 });

    const control = dropdown(renderPage());

    expect(control.props.label).toBe("Compatibility status");
    expect(control.props.rgOptions).toEqual([
      { data: null, label: "Automatic" },
      { data: 3, label: "Verified" },
      { data: 2, label: "Playable" },
      { data: 1, label: "Unsupported" },
      { data: 0, label: "Unknown" },
    ]);
    expect(control.props.selectedOption).toBeNull();
    expect(control.props.renderButtonValue()).toBe("Automatic (Valve: Verified)");
  });

  it("keeps explicit Unknown selected instead of treating zero as Automatic", () => {
    state.values[0] = makeMetadata({ deck_compat_override: 0 });

    const control = dropdown(renderPage());

    expect(control.props.selectedOption).toBe(0);
    expect(control.props.renderButtonValue()).toBe("Unknown");
  });

  it("saves a dropdown change atomically and refreshes after success", async () => {
    state.values[0] = makeMetadata({ deck_compat_category: 3 });
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
    expect(steam.applyMetadata).toHaveBeenCalledWith(100);
    expect(steam.refreshCompatibilitySurfaces).toHaveBeenCalledWith();
    expect(toast.toastSuccess).toHaveBeenCalledWith("Saved", "Metadata saved");
    expect(dropdown(renderPage()).props.selectedOption).toBe(0);
  });

  it("does not change cache or runtime compatibility when save fails", async () => {
    const persisted = makeMetadata({ deck_compat_override: 3 });
    state.values[0] = persisted;
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

  it("clears a stale Steam proposal when the manual Steam ID changes, even if enrichment fails", async () => {
    state.values[0] = makeMetadata({ steam_appid: 15100, steam_store_name: "Old Steam Name" });
    state.values[8] = "15100";
    backend.saveMetadata.mockResolvedValue(makeMetadata({ steam_appid: 15200, steam_store_name: "" }));
    backend.enrichSteamApp.mockResolvedValue(null);

    const page = renderPage();
    walk(page, (node) => node.type === "TextField" && node.props.value === "15100")[0]
      .props.onChange({ target: { value: "15200" } });
    action(renderPage(), "Apply Steam App ID").props.onClick();
    await flushAsyncWork();

    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ steam_appid: 15200, steam_store_name: "" }));
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

    effects.callbacks = [];
    renderPage();
    effects.callbacks[2]();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledTimes(1);
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
});
