import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as I18n from "./i18n";
import { hltbStore } from "./hltb/store";
import type { HltbEntry } from "./backend";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
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
  getOverview: vi.fn((): { app_type: number; BIsShortcut: () => boolean } => ({ app_type: 1073741824, BIsShortcut: () => true })),
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
type MockEffect = (() => unknown) & { deps: readonly unknown[] | undefined };
const effects = vi.hoisted(() => ({ enabled: false, callbacks: [] as MockEffect[] }));

vi.mock("@decky/ui", () => ({
  ConfirmModal: "ConfirmModal",
  afterPatch: vi.fn(),
  findInReactTree: vi.fn(),
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DropdownItem: "DropdownItem",
  Field: "Field",
  Focusable: "Focusable",
  Navigation: { NavigateBack: vi.fn() },
  TextField: "TextField",
  ToggleField: "ToggleField",
  useParams: () => ({ appid: route.appid }),
  showModal: ui.showModal,
}));

vi.mock("./backend", () => backend);
vi.mock("./steam", () => steam);
vi.mock("./steam/gamepadTextArea", () => ({ getGamepadTextArea: () => textarea.component }));
vi.mock("./toast", () => toast);
vi.mock("./editorLayout", () => ({
  EditorLayout: ({ title, pages, page, onPageRequested, saveLabel, saveDisabled, onSave }: LayoutProps) => (
    <>
      <h1>{title}</h1>
      <nav>
        {pages.filter(({ visible }) => visible).map(({ id, label }) => (
          <button key={id} type="button" aria-current={page === id ? "page" : undefined} onClick={() => onPageRequested(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main>{pages.find(({ id, visible }) => visible && id === page)?.content}</main>
      <footer><button type="button" disabled={saveDisabled} onClick={onSave}>{saveLabel}</button></footer>
    </>
  ),
}));
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
  useEffect: (callback: () => unknown, deps?: readonly unknown[]) => {
    if (effects.enabled) effects.callbacks.push(Object.assign(callback, { deps }));
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
import { EditorLayout } from "./editorLayout";
import { EDITOR_PAGE_ORDER, type EditorPageId } from "./editorPages";
import { metadataTemplate } from "./metadataForm";
import type { MetadataData } from "./types";
import { SteamMatchPicker } from "./SteamMatchPicker";
import { classifyShortcutNameState as actualClassifyShortcutNameState } from "./steam/shortcutNames";

type LayoutProps = Parameters<typeof EditorLayout>[0];

const makeMetadata = (overrides: Record<string, unknown> = {}) => ({
  ...metadataTemplate("Shortcut"),
  ...overrides,
});

const hydrateMetadata = (metadata: MetadataData) => {
  state.values[0] = metadata;
  state.values[8] = metadata.steam_appid ? String(metadata.steam_appid) : "";
  // The stored snapshot and hydration flag belong to this fixture's first entry.
  state.values[14] = 0;
  refs.values[14] = { current: metadata };
  refs.values[15] = { current: null };
};

// This harness walks JSX by hand, so only expand the fake layout component.
const renderedChildren = (node: { type?: unknown; props?: Record<string, unknown> }) =>
  node.type === EditorLayout ? EditorLayout(node.props as unknown as LayoutProps) : node.props?.children;

const walk = (node: any, predicate: (candidate: any) => boolean): any[] => {
  if (Array.isArray(node)) return node.flatMap((child) => walk(child, predicate));
  if (node == null || typeof node !== "object") return [];
  const matched = predicate(node) ? [node] : [];
  return matched.concat(walk(renderedChildren(node), predicate));
};

const renderPage = () => {
  state.cursor = 0;
  refs.cursor = 0;
  return MetadataPage();
};

const dropdown = (page: any) =>
  walk(page, (node) => node.type === "DropdownItem")[0];

const saveButton = (page: unknown) =>
  walk(page, (node) => node.type === "footer")[0].props.children;

const layoutProps = (page: unknown): LayoutProps =>
  walk(page, (node) => node.type === EditorLayout)[0].props;

const dirtyPageIds = (page: unknown) =>
  layoutProps(page).pages.filter(({ dirty }) => dirty).map(({ id }) => id);

const text = (node: unknown): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node !== "object" || !("props" in node)) return "";
  const rawProps = node.props;
  if (rawProps == null || typeof rawProps !== "object") return "";
  const props = rawProps as Record<string, unknown>;
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  return `${text(props.label)}${text(props.description)}${text(renderedChildren(element))}`;
};

const action = (page: any, label: string) =>
  walk(page, (node) => typeof node.props?.onClick === "function" && text(node) === label)[0];

const navButton = (page: unknown, label: string) =>
  action(walk(page, (node) => node.type === "nav")[0], label);

const openPage = (label: string) => {
  const page = renderPage();
  const button = navButton(page, label);
  if (button.props["aria-current"] === "page") return page;
  button.props.onClick();
  return renderPage();
};

const lastCall = (mock: any) => mock.mock.calls[mock.mock.calls.length - 1][0];

const openRemoveConfirmation = () => {
  action(openPage("Advanced"), "Remove Metadata").props.onClick();
  return lastCall(ui.showModal);
};

const textField = (page: unknown, label: string) =>
  walk(page, (node) => node.type === "TextField" && node.props["aria-label"] === label)[0];

const editTitle = (page: unknown, value: string) =>
  textField(page, "Title").props.onChange({ target: { value } });

// The marked heading above the stacked Title text box.
const titleHeading = (page: unknown) =>
  walk(page, (node) => node.type === "span" && node.props.style?.display === "inline-flex" && text(node).startsWith("Title"))[0];

const applySteamAppId = () =>
  action(openPage("Steam Match"), "Apply Steam App ID").props.onClick();

const hltbField = () => {
  const findField = (node: unknown): { props: { value: string; onChange: (event: { target: { value: string } }) => void } } | undefined => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const field = findField(child);
        if (field) return field;
      }
    } else if (node && typeof node === "object") {
      const candidate = node as { type?: unknown; props?: Record<string, unknown> };
      const children = renderedChildren(candidate);
      if (candidate.type === "div" && Array.isArray(children)) {
        // The TextField sits directly in the row or inside its flex wrapper.
        const isTextField = (child: unknown) => !!child && typeof child === "object" && "type" in child && child.type === "TextField";
        const field = children.map((child) => {
          if (isTextField(child)) return child;
          const inner = child && typeof child === "object" ? renderedChildren(child as { props?: Record<string, unknown> }) : undefined;
          return [inner].flat().find(isTextField);
        }).find(Boolean);
        const apply = children.find((child) => {
          if (!child || typeof child !== "object" || !("props" in child)) return false;
          const props = child.props;
          return !!props && typeof props === "object" && "onClick" in props &&
            typeof props.onClick === "function" && "children" in props && props.children === "Apply HLTB game";
        });
        if (field && apply) return field as { props: { value: string; onChange: (event: { target: { value: string } }) => void } };
      }
      return findField(children);
    }
    return undefined;
  };
  return findField(openPage("HowLongToBeat"));
};
const flushAsyncWork = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const clickSave = async (page = renderPage()) => {
  const button = saveButton(page);
  expect(button.props.disabled).toBe(false);
  button.props.onClick();
  await flushAsyncWork();
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

const ignSearchInput = (page: unknown) => textField(page, "Game name");

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
  hydrateMetadata(metadata);
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

    const control = dropdown(openPage("Compatibility"));

    expect(text(control.props.label)).toBe("Status");
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

    const control = dropdown(openPage("Compatibility"));

    expect(control.props.selectedOption).toBe(0);
    expect(control.props.renderButtonValue()).toBe("Unknown");
  });

  it("shows Follow Valve as a separate persisted per-game choice", async () => {
    hydrateMetadata(makeMetadata({ deck_compat_category: 2 }));
    const saved = makeMetadata({ deck_compat_category: 2, deck_compat_override: "valve" });
    backend.saveMetadata.mockResolvedValue(saved);

    dropdown(openPage("Compatibility")).props.onChange({ data: "valve" });
    const page = renderPage();
    expect(dropdown(page).props.selectedOption).toBe("valve");
    expect(dropdown(page).props.renderButtonValue()).toBe("Follow Valve (Playable)");

    await clickSave(page);
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

    expect(dropdown(openPage("Compatibility")).props.renderButtonValue()).toBe("Use global default (Verified)");
  });

  it("updates an inheriting editor preview when the selected scope excludes its record", () => {
    state.values[0] = makeMetadata({ steam_appid: null, deck_compat_category: 2 });
    state.values[15] = 3;
    state.values[16] = "steam";
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("steam");

    expect(dropdown(openPage("Compatibility")).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — Playable from Valve)",
    );
  });

  it("does not mistake an equal Valve category for global inheritance outside the scope", () => {
    state.values[0] = makeMetadata({ steam_appid: 15100, deck_compat_category: 3 });
    state.values[15] = 3;
    state.values[16] = "no-steam";
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("no-steam");

    expect(dropdown(openPage("Compatibility")).props.renderButtonValue()).toBe(
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
    expect(dropdown(openPage("Compatibility")).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — Playable from Valve)",
    );

    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("steam");
    notifyCompatibilityRevision();

    expect(dropdown(renderPage()).props.renderButtonValue()).toBe("Use global default (Verified)");
  });

  it("saves a dropdown change atomically and refreshes after success", async () => {
    hydrateMetadata(makeMetadata({ deck_compat_category: 3 }));
    const saved = makeMetadata({ deck_compat_category: 3, deck_compat_override: 0 });
    backend.saveMetadata.mockResolvedValue(saved);

    dropdown(openPage("Compatibility")).props.onChange({ data: 0 });
    const page = renderPage();

    expect(dropdown(page).props.selectedOption).toBe(0);
    await clickSave(page);

    expect(backend.saveMetadata).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ deck_compat_override: 0 })
    );
    expect(steam.metadataCache["100"]).toBe(saved);
    expect(steam.applyMetadata).toHaveBeenCalledWith(100, { publishCompatibility: false });
    expect(steam.refreshCompatibilitySurfaces).toHaveBeenCalledWith();
    expect(toast.toastSuccess).toHaveBeenCalledWith("Metadata saved", "Shortcut");
    expect(dropdown(renderPage()).props.selectedOption).toBe(0);
  });

  it("does not change cache or runtime compatibility when save fails", async () => {
    const persisted = makeMetadata({ deck_compat_override: 3 });
    hydrateMetadata(persisted);
    steam.metadataCache["100"] = persisted;
    backend.saveMetadata.mockRejectedValue(new Error("backend unavailable"));

    dropdown(openPage("Compatibility")).props.onChange({ data: 0 });
    await clickSave();

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

    const page = renderPage();
    expect(navButton(page, "Compatibility")).toBeUndefined();
    expect(layoutProps(page).pages.find(({ id }) => id === "compatibility")?.content).toBeNull();
  });

  it.each([true, false])("passes ordered pages with shortcut-only visibility (non-Steam: %s)", (nonSteam) => {
    steam.isNonSteamApp.mockReturnValue(nonSteam);
    const layout = layoutProps(renderPage());
    const shortcutOnly: EditorPageId[] = ["hltb", "compatibility", "shortcut-name"];

    expect(layout.title).toBe("Shortcut");
    expect(layout.page).toBe("details");
    expect(layout.pages.map(({ id }) => id)).toEqual(EDITOR_PAGE_ORDER);
    expect(layout.pages.every(({ icon }) => icon !== undefined)).toBe(true);
    expect(layout.pages.map(({ visible }) => visible)).toEqual(
      EDITOR_PAGE_ORDER.map((id) => nonSteam || !shortcutOnly.includes(id)),
    );
    expect(layout.pages.filter(({ separatorBefore }) => separatorBefore === true).map(({ id }) => id)).toEqual(["advanced"]);
  });

  it("puts Steam App ID and shortcut-name actions on their own pages", () => {
    configureShortcutPanel();
    const steamMatch = openPage("Steam Match");
    expect(textField(steamMatch, "Steam App ID")).toBeDefined();
    expect(action(steamMatch, "Use Steam name")).toBeUndefined();

    const shortcut = openPage("Shortcut Name");
    expect(textField(shortcut, "Steam App ID")).toBeUndefined();
    expect(action(shortcut, "Use Steam name")).toBeDefined();
    expect(text(shortcut)).toContain("These actions apply now. They do not use Save.");
  });

  it("shows the proposal only for an eligible native shortcut and makes equal names a no-op", () => {
    configureShortcutPanel({ current: "Steam Name" });
    const page = openPage("Shortcut Name");
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

    action(openPage("Shortcut Name"), "Use Steam name").props.onClick();
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

    action(openPage("Shortcut Name"), "Use Steam name").props.onClick();
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

    action(openPage("Shortcut Name"), "Restore original name").props.onClick();
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
    const page = openPage("Shortcut Name");
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

    const input = textField(openPage("Steam Match"), "Steam App ID");
    expect(input.props.value).toBe("15100");
    input.props.onChange({ target: { value: "15200" } });
    await applySteamAppId();

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
    await clickSave();

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
    editTitle(renderPage(), "Edited title");
    await clickSave();
    expect(backend.saveMetadata).toHaveBeenCalled();

    configureShortcutPanel({ busy: true });
    const restore = action(openPage("Shortcut Name"), "Use Steam name");
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

    const page = openPage("Shortcut Name");
    expect(text(page)).toContain("Shortcut-name management is unavailable");
    expect(action(page, "Use Steam name")).toBeUndefined();
    editTitle(openPage("Details"), "Edited title");
    await clickSave(openPage("Shortcut Name"));
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.any(Object));
    expect(backend.saveShortcutNameState).not.toHaveBeenCalled();
  });

  it("reports an unavailable Steam API before rename and does not save history", () => {
    configureShortcutPanel();
    steam.hasShortcutNameApi.mockReturnValue(false);

    const page = openPage("Shortcut Name");
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

    await applySteamAppId();
    expect(action(openPage("Shortcut Name"), "Use Steam name")).toBeUndefined();

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await clickSave();

    expect(action(renderPage(), "Use Steam name")).toBeDefined();
  });

  it("reports a successful Save and keeps the draft when Save fails", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockResolvedValue(makeMetadata({
      title: "Saved",
      steam_appid: 15100,
      steam_store_name: "Steam Name",
    }));

    editTitle(renderPage(), "Saved");
    await clickSave();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ title: "Saved" }));
    expect(steam.applyMetadata).toHaveBeenCalledWith(100, { publishCompatibility: false });
    expect(toast.toastSuccess).toHaveBeenCalledWith("Metadata saved", "Shortcut");
    expect(saveButton(renderPage()).props.disabled).toBe(true);

    backend.saveMetadata.mockRejectedValue(new Error("disk full"));
    editTitle(renderPage(), "Not saved");
    await clickSave();
    expect(toast.toastSuccess).toHaveBeenCalledTimes(1);
    expect(steam.applyMetadata).toHaveBeenCalledTimes(1);
    expect(saveButton(renderPage()).props.disabled).toBe(false);
    expect(toast.toastError).toHaveBeenCalledWith("Save failed", expect.stringContaining("disk full"));
  });

  it("refuses to save while the Steam App ID text holds an unapplied match", async () => {
    configureShortcutPanel();
    state.values[8] = "15200";

    await clickSave();

    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(toast.toastWarn).toHaveBeenCalledWith("Steam App ID not applied", expect.any(String));
  });

  it("keeps restore available after metadata removal", async () => {
    const managed = { original_name: "Original", applied_name: "Steam Name", steam_appid: 15100, updated_at: 1 };
    configureShortcutPanel({ management: { state: managed }, current: "Steam Name", status: "managed" });
    backend.removeMetadata.mockResolvedValue({});

    openRemoveConfirmation().props.onOK();
    await flushAsyncWork();

    expect(action(openPage("Shortcut Name"), "Restore original name")).toBeDefined();
  });

  it("confirms removal on Advanced, then removes metadata and closes the editor", async () => {
    configureShortcutPanel();
    backend.removeMetadata.mockResolvedValue({});

    const modal = openRemoveConfirmation();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props).toMatchObject({
      bDestructiveWarning: true,
      strTitle: "Remove Metadata?",
      strDescription: expect.stringContaining("Shortcut"),
      strOKButtonText: "Remove Metadata",
    });
    expect(backend.removeMetadata).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();

    modal.props.onOK();
    await flushAsyncWork();

    expect(backend.removeMetadata).toHaveBeenCalledWith(100);
    expect(toast.toastSuccess).toHaveBeenCalledWith("Metadata removed", "Shortcut");
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("stays in the editor when removal fails", async () => {
    configureShortcutPanel();
    backend.removeMetadata.mockRejectedValue(new Error("disk full"));

    openRemoveConfirmation().props.onOK();
    await flushAsyncWork();

    expect(toast.toastError).toHaveBeenCalledWith("Remove failed", "disk full");
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("excludes repeated confirmations and other editor actions while a rename is pending", async () => {
    configureShortcutPanel();
    steam.nativeShortcutName.mockReturnValue("Original");
    const pendingState = deferred<any>();
    backend.saveShortcutNameState.mockReturnValue(pendingState.promise);

    editTitle(renderPage(), "Edited title");
    action(openPage("Shortcut Name"), "Use Steam name").props.onClick();
    const modal = ui.showModal.mock.calls[0][0];
    modal.props.onOK();
    await Promise.resolve();
    expect(backend.saveShortcutNameState).toHaveBeenCalledTimes(1);
    expect(state.values[7]).toBe(true);
    saveButton(renderPage()).props.onClick();
    await flushAsyncWork();
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
    expect(text(openPage("Shortcut Name"))).toContain("Steam: Steam Name");
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
    await applySteamAppId();

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
    expect(text(openPage("Shortcut Name"))).toContain("Steam did not return an official name");

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
    expect(text(openPage("Shortcut Name"))).toContain("Steam: Steam Name");
  });

  it("merges a delayed legacy backfill while preserving an unsaved form edit", async () => {
    effects.enabled = true;
    const oldResponse = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Original", description: "Saved long", short_description: "Saved summary", source: "IGN", release_date: "2009-04-28", steam_store_name: "" } });
    backend.enrichSteamApp.mockReturnValue(oldResponse.promise);
    state.values[3] = "2009-04-28";

    renderPage();
    effects.callbacks[2]();
    editTitle(renderPage(), "Unsaved edit");
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
    await clickSave();
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
    editTitle(renderPage(), "Edit before backfill");
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
    textField(openPage("Steam Match"), "Steam App ID").props.onChange({ target: { value: "15200" } });
    await applySteamAppId();
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
    openRemoveConfirmation().props.onOK();
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
    await action(renderPage(), "Search").props.onClick();
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
    const searching = action(renderPage(), "Search").props.onClick();

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
    editTitle(renderPage(), "New title");
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
    await clickSave();
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
    const save = saveButton(renderPage());
    expect(save.props.disabled).toBe(true);
    save.props.onClick();
    await applySteamAppId();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(toast.toastWarn).toHaveBeenCalledTimes(2);
    expect(toast.toastWarn).toHaveBeenCalledWith("Not loaded", expect.any(String));

    pendingMetadata.resolve(makeMetadata({ title: "Saved title", description: "Saved description" }));
    await loading;
    await flushAsyncWork();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    editTitle(openPage("Details"), "Edited title");
    await clickSave();
    expect(backend.saveMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({ description: "Saved description" }));
  });

  it("keeps a newer title edit while previewing a changed Steam match", async () => {
    const pendingPreview = deferred<any>();
    configureShortcutPanel({ metadata: { title: "Old title", steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);

    const applying = applySteamAppId();
    editTitle(openPage("Details"), "New title");
    pendingPreview.resolve(makeMetadata({ title: "Steam title", steam_appid: 15200, steam_store_name: "New Steam name" }));
    await applying;
    await flushAsyncWork();

    const titleLabel = titleHeading(renderPage());
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
    await clickSave();
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
    const applying = applySteamAppId();
    const description = () => walk(openPage("Details"), node => node.type === (component || "textarea"))[0];
    description().props.onChange({ target: { value: "" } });
    pendingPreview.resolve(makeMetadata({ description: "Provider prose", short_description: "Provider summary", steam_appid: 15200, title: "Enriched title", developers: [{ name: "Developer", url: "" }] }));
    await applying;
    expect(description().props.value).toBe("");
    expect(state.values[0]).toMatchObject({ description: "", short_description: "", title: "Enriched title" });
    expect(state.values[1]).toBe("Developer");
    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await clickSave();
    expect(backend.savePreviewedMetadata).toHaveBeenLastCalledWith(100, expect.objectContaining({ description: "", short_description: "", title: "Enriched title" }), 15200);
    textarea.component = null;
  });

  it.each([["2024-11-03"], [""]])("keeps a newer date edit during a pending Steam preview with value %s", async (value) => {
    const pendingPreview = deferred<MetadataData>();
    configureShortcutPanel({ metadata: { description: "Long", short_description: "Short", release_date: "2009-04-28" } });
    state.values[3] = "2009-04-28";
    state.values[8] = "15200";
    backend.previewSteamMetadata.mockReturnValue(pendingPreview.promise);
    const applying = applySteamAppId();
    walk(openPage("Details"), node => node.type === "TextField" && node.props.value === "2009-04-28")[0]
      .props.onChange({ target: { value } });
    pendingPreview.resolve(makeMetadata({ description: "Provider long", short_description: "Provider short", release_date: "2023-11-14", steam_appid: 15200 }));
    await applying;
    expect(state.values[3]).toBe(value);
    backend.savePreviewedMetadata.mockImplementation(async (_id, metadata) => metadata);
    await clickSave();
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

    await applySteamAppId();

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
    await clickSave();
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

    const applying = applySteamAppId();
    await flushAsyncWork();
    editTitle(openPage("Details"), "My title");
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
    await clickSave();
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

    await applySteamAppId();

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
    expect(dropdown(openPage("Compatibility")).props.renderButtonValue()).toBe(
      "Use global default (outside selected scope — original Steam status)",
    );

    backend.saveMetadata.mockResolvedValue(makeMetadata({ title: "User title", steam_appid: null }));
    await clickSave();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ steam_appid: null }));
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
  });

  it("refuses unresolvable Steam App ID text and keeps the saved match", async () => {
    configureShortcutPanel({ metadata: { steam_appid: 15100, steam_store_name: "Old Steam name" } });
    state.values[8] = "not a steam id";

    await applySteamAppId();

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

    await applySteamAppId();

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

    action(openPage("Shortcut Name"), "Use Steam name").props.onClick();
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
    action(openPage("Shortcut Name"), "Use Steam name").props.onClick();
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

    action(openPage("Shortcut Name"), "Restore original name").props.onClick();
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

    action(openPage("Shortcut Name"), "Restore original name").props.onClick();
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
    hydrateMetadata(makeMetadata(metadata));
    state.values[18] = language;
    return openPage("Steam Match");
  };

  it("offers the manual refetch only while the stored language differs", () => {
    const mismatch = show({ steam_appid: 15100, metadata_language: "english" }, "french");
    expect(text(mismatch)).toContain("Steam text language: English");
    expect(action(mismatch, "Load Steam text in French")).toBeDefined();

    const matching = show({ steam_appid: 15100, metadata_language: "french" }, "french");
    expect(action(matching, "Load Steam text in French")).toBeUndefined();

    // Records without the field were fetched in English.
    const legacy = show({ steam_appid: 15100 }, "french");
    expect(action(legacy, "Load Steam text in French")).toBeDefined();

    const unmatched = show({ steam_appid: null, metadata_language: "english" }, "french");
    expect(action(unmatched, "Load Steam text in French")).toBeUndefined();
  });

  it("reads the Steam language when the editor opens", async () => {
    effects.enabled = true;
    i18nLanguage.currentSteamLanguage.mockResolvedValue("french");
    state.values[0] = makeMetadata({ steam_appid: 15100, metadata_language: "english" });
    state.values[14] = 0;
    renderPage();
    effects.callbacks[5]();
    await flushAsyncWork();
    expect(action(openPage("Steam Match"), "Load Steam text in French")).toBeDefined();
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

    action(page, "Load Steam text in French").props.onClick();
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
    expect(action(renderPage(), "Load Steam text in French")).toBeUndefined();

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await clickSave();
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

    await applySteamAppId();
    expect(backend.previewSteamMetadata.mock.calls[0][0]).toEqual(expect.objectContaining({ steam_appid: 15200 }));

    // Still an English draft, so the language button remains for the previewed id.
    backend.previewSteamMetadata.mockResolvedValueOnce(makeMetadata({
      steam_appid: 15200,
      metadata_language: "french",
      description: "Texte français",
      short_description: "Texte français",
    }));
    action(renderPage(), "Load Steam text in French").props.onClick();
    await flushAsyncWork();

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

    action(page, "Load Steam text in French").props.onClick();
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
    hydrateMetadata(makeMetadata({ description: "Retained long prose", short_description: "Source summary", release_date: "2009-04-28" }));
    state.values[3] = "2009-04-28";
    const page = renderPage();
    expect(walk(page, node => node.type === "textarea")[0].props.value).toBe("Source summary");
    editTitle(page, "Edited title");
    await clickSave();
    expect(backend.saveMetadata.mock.calls[0][1]).toMatchObject({ description: "Retained long prose", short_description: "Source summary", release_date: "2009-04-28" });
  });
  it("uses a long fallback when the saved summary contains only whitespace", () => {
    state.values[0] = makeMetadata({ description: "Readable fallback", short_description: " \n " });
    expect(walk(renderPage(), node => node.type === "textarea")[0].props.value).toBe("Readable fallback");
  });
  it("keeps a legitimate absent date absent on an unrelated save", async () => {
    hydrateMetadata(makeMetadata({ release_date: null }));
    editTitle(renderPage(), "Edited title");
    await clickSave();
    expect(backend.saveMetadata.mock.calls[0][1].release_date).toBeNull();
  });
  it("saves a changed calendar date and supports explicitly clearing it", async () => {
    hydrateMetadata(makeMetadata({ release_date: "2009-04-28" }));
    state.values[3] = "2009-04-28";
    renderPage();
    const field = walk(renderPage(), node => node.type === "TextField" && node.props.value === "2009-04-28")[0];
    field.props.onChange({ target: { value: "2024-03-10" } });
    await clickSave();
    expect(backend.saveMetadata.mock.calls[0][1].release_date).toBe("2024-03-10");
    walk(renderPage(), node => node.type === "TextField" && node.props.value === "2024-03-10")[0].props.onChange({ target: { value: "" } });
    await clickSave();
    expect(backend.saveMetadata.mock.calls[1][1].release_date).toBeNull();
  });
  it("saves an HLTB game typed into its field when Save is pressed, and refuses an invalid one", async () => {
    hydrateMetadata(makeMetadata());
    backend.checkHltbGameId.mockResolvedValue({ found: true, game_id: 6064, game_name: "Minecraft" });
    hltbField().props.onChange({ target: { value: "not a game" } });
    await clickSave();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    hltbField().props.onChange({ target: { value: "https://howlongtobeat.com/game/6064" } });
    await clickSave();
    expect(backend.saveMetadata.mock.calls[0][1].hltb_game_id).toBe(6064);
  });
  it("checks an applied HLTB game and keeps it as the draft until Save", async () => {
    hydrateMetadata(makeMetadata());
    backend.checkHltbGameId.mockResolvedValue({ found: true, game_id: 6064, game_name: "Minecraft" });

    hltbField().props.onChange({ target: { value: "https://howlongtobeat.com/game/6064" } });
    await action(renderPage(), "Apply HLTB game").props.onClick();

    expect(backend.checkHltbGameId).toHaveBeenCalledWith(6064);
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(hltbField().props.value).toBe("6064");
    expect(toast.toastSuccess).toHaveBeenCalledWith("HLTB game: Minecraft", "Save stores this choice.");

    await clickSave();
    expect(backend.saveMetadata.mock.calls[0][1].hltb_game_id).toBe(6064);
  });
  it("drops a delayed HLTB check after the editor moves to another game", async () => {
    effects.enabled = true;
    const pending = deferred<{ found: true; game_id: number; game_name: string }>();
    hydrateMetadata(makeMetadata());
    backend.checkHltbGameId.mockReturnValue(pending.promise);

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
    hydrateMetadata(makeMetadata());
    backend.checkHltbGameId.mockReturnValue(pending.promise);

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
    hydrateMetadata(makeMetadata());

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
    const current = makeMetadata();
    hydrateMetadata(current);
    backend.checkHltbGameId.mockResolvedValue({ found: true, game_id: 6064, game_name: "Minecraft" });
    backend.saveMetadata.mockReturnValueOnce(pendingSave.promise);

    hltbField().props.onChange({ target: { value: "6064" } });
    const save = saveButton(renderPage());
    expect(save.props.disabled).toBe(false);
    save.props.onClick();
    await flushAsyncWork();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ hltb_game_id: 6064 }));
    hltbField().props.onChange({ target: { value: "9999" } });
    pendingSave.resolve(saved);
    await flushAsyncWork();

    expect(hltbField().props.value).toBe("9999");
    expect(state.values[0]).toBe(current);
  });
  it("aborts a Save whose HLTB check resolves after a newer edit", async () => {
    const pending = deferred<{ found: true; game_id: number; game_name: string }>();
    hydrateMetadata(makeMetadata({ title: "Stored title" }));
    backend.checkHltbGameId.mockReturnValue(pending.promise);

    hltbField().props.onChange({ target: { value: "6064" } });
    const save = saveButton(renderPage());
    expect(save.props.disabled).toBe(false);
    save.props.onClick();
    await flushAsyncWork();
    expect(backend.checkHltbGameId).toHaveBeenCalledWith(6064);
    editTitle(openPage("Details"), "Newer title");
    pending.resolve({ found: true, game_id: 6064, game_name: "Minecraft" });
    await flushAsyncWork();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(textField(renderPage(), "Title").props.value).toBe("Newer title");
  });
  it("shows the automatically found HLTB game without saving it as a choice", async () => {
    hydrateMetadata(makeMetadata());
    editTitle(renderPage(), "Edited title");
    hltbMatch.entry = {
      status: "matched", hltb_id: 6064, game_name: "Minecraft", stats: null,
      steam_appid_used: null, title_used: "Minecraft Bedrock", pinned_id_used: null, fetched_at: 1,
    };
    expect(hltbField().props.value).toBe("6064");
    expect(text(renderPage())).toContain("Minecraft");
    await clickSave();
    expect(backend.saveMetadata.mock.calls[0][1].hltb_game_id).toBeUndefined();
    hltbMatch.entry = null;
  });
  it.each([null, "NativeTextarea"])("saves manual text and clearing in both fields through %s", async (component) => {
    textarea.component = component;
    hydrateMetadata(makeMetadata({ description: "Long", short_description: "Short" }));
    for (const input of ["Fly <pilot>\n\nLand", ""]) {
      walk(renderPage(), node => node.type === (component || "textarea"))[0].props.onChange({ target: { value: input } });
      await clickSave();
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

    await picker(openPage("Steam Match")).props.onApply(15200);

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
    const applying = picker(openPage("Steam Match")).props.onApply(400);
    walk(openPage("Details"), (node) => node.type === "textarea")[0]
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
    await clickSave();
    expect(backend.savePreviewedMetadata).toHaveBeenCalledWith(100, expect.objectContaining({
      steam_appid: 400,
      description: "My edit during the request",
    }), 400);
  });

  it("rejects a retired picker callback after visiting another game and returning", async () => {
    const retired = picker(openPage("Steam Match")).props.onApply;
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
    action(renderPage(), "Hades").props.onClick();
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
    const labels = walk(openPage("Store Categories"), (node) => node.type === "ToggleField")
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

  it("marks only Details dirty and counts the edited Title in Save", () => {
    configureShortcutPanel();

    const clean = renderPage();
    expect(dirtyPageIds(clean)).toEqual([]);
    expect(text(saveButton(clean))).toBe("Save");
    expect(saveButton(clean).props.disabled).toBe(true);

    editTitle(clean, "Edited title");
    const edited = renderPage();
    expect(dirtyPageIds(edited)).toEqual(["details"]);
    expect(text(saveButton(edited))).toBe("Save (1)");
    expect(saveButton(edited).props.disabled).toBe(false);

    editTitle(edited, "Shortcut");
    const restored = renderPage();
    expect(dirtyPageIds(restored)).toEqual([]);
    expect(text(saveButton(restored))).toBe("Save");
    expect(saveButton(restored).props.disabled).toBe(true);
  });

  it("marks a user-edited field as Edited", () => {
    configureShortcutPanel();

    editTitle(renderPage(), "Edited title");

    const label = titleHeading(renderPage());
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

    await applySteamAppId();

    const previewed = walk(openPage("Details"), (node) => node.type === "Field" && text(node.props.label).startsWith("Description"))[0];
    expect(text(previewed)).toContain("From Steam, not saved");
    expect(previewed.props.label.props.style).toMatchObject({ color: "#f59e0b" });

    walk(renderPage(), (node) => node.type === "textarea")[0]
      .props.onChange({ target: { value: "My description" } });
    const edited = walk(renderPage(), (node) => node.type === "Field" && text(node.props.label).startsWith("Description"))[0];
    expect(text(edited)).toContain("Edited");
    expect(text(edited)).not.toContain("From Steam");
  });

  it("loads a matched shortcut from Steam and marks only Steam Match dirty without saving", async () => {
    configureShortcutPanel();
    const pending = deferred<MetadataData>();
    backend.previewSteamMetadata.mockReturnValue(pending.promise);

    const steamMatch = openPage("Steam Match");
    const load = action(steamMatch, "Load from Steam");
    expect(load.props.disabled).toBe(false);
    expect(dirtyPageIds(steamMatch)).toEqual([]);
    load.props.onClick();

    const busy = action(renderPage(), "Load from Steam (Updating)");
    expect(busy.props.disabled).toBe(true);
    busy.props.onClick();
    pending.resolve(makeMetadata({
      steam_appid: 15100,
      steam_store_name: "Steam Name",
      steam_news: [{ id: "1", title: "News", url: "https://example.com/news", date: 1, contents: "" }],
    }));

    // Load updates the draft, not the stored record or the live metadata cache.
    await flushAsyncWork();
    expect(backend.previewSteamMetadata).toHaveBeenCalledTimes(1);
    expect(backend.previewSteamMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ steam_appid: 15100 }),
      "english",
    );
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
    expect(backend.enrichSteamApp).not.toHaveBeenCalled();
    expect(steam.setMetadataCacheEntry).not.toHaveBeenCalled();

    const page = renderPage();
    expect(dirtyPageIds(page)).toEqual(["steam-match"]);
    expect(action(page, "Load from Steam").props.disabled).toBe(false);
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
    await applySteamAppId();
    expect(text(openPage("Details"))).toContain("From Steam, not saved");

    backend.savePreviewedMetadata.mockImplementation(async (_id, value) => value);
    await clickSave();

    const page = renderPage();
    expect(text(page)).not.toContain("From Steam, not saved");
    expect(text(page)).not.toContain("Edited");
    expect(text(saveButton(page))).toBe("Save");
    expect(saveButton(page).props.disabled).toBe(true);
  });

  it.each([
    { nonSteam: true, match: null, label: "Load from Steam (No Steam match)" },
    { nonSteam: false, match: 15100, label: "Load from Steam (Not available for Steam games)" },
  ])("disables $label", async ({ nonSteam, match, label }) => {
    steam.isNonSteamApp.mockReturnValue(nonSteam);
    configureShortcutPanel({ metadata: { steam_appid: match } });

    const load = action(openPage("Steam Match"), label);
    expect(load.props.disabled).toBe(true);
    load.props.onClick();
    await flushAsyncWork();
    expect(backend.previewSteamMetadata).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(backend.savePreviewedMetadata).not.toHaveBeenCalled();
  });

  it("resets the selected page to Details when the app ID changes", () => {
    effects.enabled = true;
    steam.appName.mockImplementation((id) => id === 200 ? "Second Game" : "Shortcut");
    expect(layoutProps(openPage("Advanced")).page).toBe("advanced");
    expect(effects.callbacks[1].deps).toContain(100);

    route.appid = "200";
    effects.callbacks = [];
    renderPage();
    const resetEntry = effects.callbacks[1];
    expect(resetEntry.deps).toContain(200);
    resetEntry();

    const switched = renderPage();
    expect(layoutProps(switched)).toMatchObject({ title: "Second Game", page: "details" });
    expect(textField(switched, "Title")).toBeDefined();
  });

  it("saves from the controller X shortcut only when the draft changed", async () => {
    configureShortcutPanel();
    backend.saveMetadata.mockImplementation(async (_id, value) => value);
    expect(renderPage().props.onSecondaryActionDescription).toBe("Save");

    renderPage().props.onSecondaryButton();
    await flushAsyncWork();
    expect(backend.saveMetadata).not.toHaveBeenCalled();

    editTitle(renderPage(), "Edited title");
    const edited = renderPage();
    expect(edited.props.onSecondaryActionDescription).toBe("Save (1)");
    edited.props.onSecondaryButton();
    await flushAsyncWork();
    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.any(Object));
  });
  it("keeps Steam games unsavable after editing Title, including the controller X shortcut", async () => {
    steam.isNonSteamApp.mockReturnValue(false);
    steam.getOverview.mockReturnValue({ app_type: 1, BIsShortcut: () => false });
    configureShortcutPanel();

    editTitle(renderPage(), "Edited title");
    const edited = renderPage();
    expect(layoutProps(edited).saveDisabled).toBe(true);

    edited.props.onSecondaryButton();
    await flushAsyncWork();
    expect(backend.saveMetadata).not.toHaveBeenCalled();
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

  const pressB = () => renderPage().props.onCancelButton();
  const leavePrompt = () => lastCall(ui.showModal);

  it("leaves a clean form at once on B", () => {
    pressB();

    expect(ui.showModal).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("groups draft fields by page when B opens the prompt and leaves Cancel inert", () => {
    configureShortcutPanel();
    const details = renderPage();
    editTitle(details, "Edited title");
    walk(details, (node) => node.type === "textarea")[0]
      .props.onChange({ target: { value: "Edited description" } });
    textField(openPage("Steam Match"), "Steam App ID").props.onChange({ target: { value: "15200" } });

    pressB();

    const modal = leavePrompt();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.strTitle).toBe("Save changes?");
    expect(walk(modal, (node) => node.type === "li").map(text)).toEqual([
      "Details: Title, Description",
      "Steam Match: Steam App ID",
    ]);
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

    pressB();
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

    pressB();
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
    pressB();
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
    pressB();
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
    pressB();
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
    pressB();
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

    pressB();
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

    pressB();
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

    pressB();
    leavePrompt().props.onMiddleButton();

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("prompts when the record is still loading and the user already typed", () => {
    effects.enabled = true;
    const pending = deferred<MetadataData>();
    backend.getMetadata.mockReturnValue(pending.promise);

    renderPage();
    effects.callbacks[0]();

    editTitle(renderPage(), "Typed before load");
    pressB();

    expect(leavePrompt().type).toBe("ConfirmModal");
    expect(Navigation.NavigateBack).not.toHaveBeenCalled();
  });

  it("leaves an untouched form while the record is still loading", () => {
    effects.enabled = true;
    const pending = deferred<MetadataData>();
    backend.getMetadata.mockReturnValue(pending.promise);

    renderPage();
    effects.callbacks[0]();
    pressB();

    expect(ui.showModal).not.toHaveBeenCalled();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });

  it("marks the compatibility status Edited until its saved value returns", () => {
    configureShortcutPanel();
    const initial = openPage("Compatibility");
    expect(text(saveButton(initial))).toBe("Save");
    expect(text(initial)).not.toContain("Edited");

    dropdown(initial).props.onChange({ data: 2 });
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
