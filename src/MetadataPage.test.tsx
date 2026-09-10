import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
const route = vi.hoisted(() => ({ appid: "100" }));

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
  compatibilityDefaultSnapshot: vi.fn(() => null),
  compatibilityDefaultScopeSnapshot: vi.fn(() => "all"),
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
  Navigation: { NavigateBack: vi.fn() },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ScrollPanel: "ScrollPanel",
  TextField: "TextField",
  ToggleField: "ToggleField",
  useParams: () => ({ appid: route.appid }),
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  // These direct-render tests model metadata that has already been hydrated
  // for the initial editor entry. Real editor loads set this after the RPC.
  state.values[14] = 0;
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

  it("keeps restore available after metadata removal", async () => {
    const managed = { original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 };
    configureShortcutPanel({ management: { state: managed }, current: "Steam Name", status: "managed" });
    backend.removeMetadata.mockResolvedValue({});

    await action(renderPage(), "Remove metadata").props.onClick();

    expect(action(renderPage(), "Restore original name")).toBeDefined();
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
    expect(backend.enrichSteamApp).toHaveBeenCalledWith(101);
    expect(text(renderPage())).toContain("Steam: Steam Name");
  });

  it("merges a delayed legacy backfill while preserving an unsaved form edit", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Original", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(oldResponse.promise);

    renderPage();
    effects.callbacks[2]();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "Unsaved edit" } });
    oldResponse.resolve(makeMetadata({
      title: "Steam title",
      description: "Steam description",
      developers: [{ name: "Steam developer", url: "" }],
      steam_appid: 15100,
      steam_store_name: "Old Steam Name",
    }));
    await flushAsyncWork();

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "Unsaved edit",
      description: "Steam description",
      steam_store_name: "Old Steam Name",
    }));
    expect(state.values[1]).toBe("Steam developer");
    expect(steam.metadataCache["100"]).toEqual(expect.objectContaining({
      title: "Unsaved edit",
      description: "Steam description",
    }));
  });

  it("discards a delayed legacy backfill after the user changes Steam ID", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    const newer = makeMetadata({ title: "New match", steam_appid: 15200, steam_store_name: "New Steam Name" });
    configureShortcutPanel({ metadata: { title: "Original", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(newer);
    backend.saveMetadata.mockResolvedValue(makeMetadata({ title: "Original", steam_appid: 15200, steam_store_name: "" }));

    renderPage();
    effects.callbacks[2]();
    const fields = walk(renderPage(), (node) => node.type === "TextField");
    fields[fields.length - 1]
      .props.onChange({ target: { value: "15200" } });
    await action(renderPage(), "Apply Steam App ID").props.onClick();
    oldResponse.resolve(makeMetadata({ title: "Original", steam_appid: 15100, steam_store_name: "Old Steam Name" }));
    await flushAsyncWork();

    expect(state.values[0]).toEqual(expect.objectContaining({ steam_appid: 15200, steam_store_name: "New Steam Name" }));
  });

  it("discards a delayed legacy backfill after metadata removal", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Original", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(oldResponse.promise);
    backend.removeMetadata.mockResolvedValue({});

    renderPage();
    effects.callbacks[2]();
    await action(renderPage(), "Remove metadata").props.onClick();
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

  it("keeps a newer title edit while applying the saved Steam identity", async () => {
    const pendingSave = deferred<any>();
    const saved = makeMetadata({ steam_appid: 15200, steam_store_name: "New Steam name" });
    configureShortcutPanel({ metadata: { title: "Old title", steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "15200";
    backend.saveMetadata.mockReturnValueOnce(pendingSave.promise).mockResolvedValue(saved);
    backend.enrichSteamApp.mockResolvedValue(saved);

    const apply = action(renderPage(), "Apply Steam App ID").props.onClick();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "New title" } });
    pendingSave.resolve(saved);
    await apply;
    await flushAsyncWork();

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
      steam_store_name: "New Steam name",
    }));
    expect(steam.metadataCache["100"]).toEqual(expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
    }));
    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "New title",
      steam_appid: 15200,
    }));
  });

  it("reconciles every untouched field from a successful Steam enrichment", async () => {
    const pendingEnrichment = deferred<any>();
    const saved = makeMetadata({
      title: "Before enrichment",
      description: "Old description",
      steam_appid: 15200,
      steam_store_name: "",
      steam_store_url: "https://store.steampowered.com/app/15200/",
    });
    const enriched = makeMetadata({
      title: "Steam title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      publishers: [{ name: "Steam publisher", url: "" }],
      release_date: 1700000000,
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
    backend.saveMetadata.mockResolvedValueOnce(saved).mockResolvedValueOnce(enriched);
    backend.enrichSteamApp.mockReturnValue(pendingEnrichment.promise);

    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    await flushAsyncWork();
    expect(backend.enrichSteamApp).toHaveBeenCalledWith(100);
    pendingEnrichment.resolve(enriched);
    await applying;

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "Steam title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      publishers: [{ name: "Steam publisher", url: "" }],
      release_date: 1700000000,
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
    expect(steam.metadataCache["100"]).toEqual(expect.objectContaining({
      description: "Steam description",
      steam_dlc_appids: [10, 20],
    }));

    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "Steam title",
      description: "Steam description",
      steam_dlc_appids: [10, 20],
      deck_compat_category: 3,
    }));
  });

  it("keeps a concurrent title edit while reconciling untouched Steam enrichment fields", async () => {
    const pendingEnrichment = deferred<any>();
    const saved = makeMetadata({
      title: "Before enrichment",
      description: "Old description",
      steam_appid: 15200,
      steam_store_name: "",
      steam_store_url: "https://store.steampowered.com/app/15200/",
    });
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
    const savedUserEdit = { ...enriched, title: "My title" };
    configureShortcutPanel({ metadata: { title: "Before enrichment", description: "Old description" } });
    state.values[8] = "15200";
    backend.saveMetadata.mockResolvedValueOnce(saved).mockResolvedValueOnce(savedUserEdit);
    backend.enrichSteamApp.mockReturnValue(pendingEnrichment.promise);

    const applying = action(renderPage(), "Apply Steam App ID").props.onClick();
    await flushAsyncWork();
    walk(renderPage(), (node) => node.type === "TextField")[1]
      .props.onChange({ target: { value: "My title" } });
    pendingEnrichment.resolve(enriched);
    await applying;

    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "My title",
      description: "Steam description",
      short_description: "Steam summary",
      developers: [{ name: "Steam developer", url: "" }],
      steam_dlc_appids: [10],
      deck_compat_category: 2,
    }));
    expect(steam.metadataCache["100"]).toEqual(expect.objectContaining({
      title: "My title",
      description: "Steam description",
    }));

    await saveButton(renderPage()).props.onClick();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({
      title: "My title",
      description: "Steam description",
      steam_dlc_appids: [10],
    }));
    expect(state.values[0]).toEqual(expect.objectContaining({
      title: "My title",
      description: "Steam description",
    }));
  });

  it("normalizes a cleared Steam ID and completes its consumer-visible refresh", async () => {
    configureShortcutPanel({ metadata: { steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "";
    const cleared = makeMetadata({ steam_appid: null, steam_store_name: "", steam_store_url: "" });
    backend.saveMetadata.mockResolvedValue(cleared);
    backend.enrichSteamApp.mockResolvedValue(null);

    await action(renderPage(), "Apply Steam App ID").props.onClick();

    expect(state.values[0]).toEqual(expect.objectContaining({ steam_appid: null, steam_store_name: "" }));
    expect(state.values[8]).toBe("");
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
    expect(steam.applyMetadata).toHaveBeenCalledWith(100, { publishCompatibility: false });
    expect(steam.refreshCompatibilitySurfaces).toHaveBeenCalledWith();
    expect(toast.toastSuccess).toHaveBeenCalledWith("Saved", "Metadata saved");
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
