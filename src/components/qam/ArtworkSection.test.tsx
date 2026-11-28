import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { useEffect } from "react";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
const hookState = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  context: undefined as unknown,
  memo: undefined as { deps: readonly unknown[]; value: unknown } | undefined,
}));

vi.mock("@decky/api", () => ({ callable: () => vi.fn(), openFilePicker: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const idx = hookState.cursor++;
    if (idx >= hookState.slots.length) {
      hookState.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    }
    return [hookState.slots[idx], (val: unknown) => { hookState.slots[idx] = val; }];
  },
  useEffect: vi.fn(),
  // Cache like React so tests can check which changes rebuild the list entries.
  useMemo: <T,>(factory: () => T, deps: readonly unknown[]) => {
    const cached = hookState.memo;
    if (!cached || cached.deps.length !== deps.length || cached.deps.some((dep, i) => dep !== deps[i])) {
      hookState.memo = { deps: [...deps], value: factory() };
    }
    return hookState.memo.value as T;
  },
  createContext: () => ({ Provider: "ContextProvider" }),
  useContext: () => hookState.context,
  useRef: <T,>(initial: T) => ({ current: initial }),
}));
vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogButton: "DialogButton",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DropdownItem: "DropdownItem",
  Field: "Field",
  Focusable: "Focusable",
  ProgressBarWithInfo: "ProgressBarWithInfo",
  ReorderableList: "ReorderableList",
  TextField: "TextField",
  Toggle: "Toggle",
  ToggleField: "ToggleField",
  showModal: ui.showModal,
}));
vi.mock("../../i18n", () => {
  // Stable like the real `t`, which the list entries depend on.
  const t = (key: string) => key;
  return { useT: () => t, currentLocale: () => "en-US" };
});
vi.mock("../../styles", () => ({
  ButtonLabel: "ButtonLabel",
  inlineStatusStyle: () => ({}),
}));

import {
  DEFAULT_ARTWORK_SETTINGS,
  EMPTY_SGDB_KEY_STATUS,
  type ArtworkControllerSnapshot,
} from "../../artwork/controller";
import { ArtworkBody } from "./ArtworkSection";

type Node = { type?: unknown; props?: Record<string, any> };
const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as Node;
  return [el, ...nodes(el.props?.children)];
};

const makeSnapshot = (overrides: Partial<ArtworkControllerSnapshot> = {}): ArtworkControllerSnapshot => ({
  settings: structuredClone(DEFAULT_ARTWORK_SETTINGS),
  settingsLoaded: true,
  settingsError: "",
  sgdbKeyStatus: { ...EMPTY_SGDB_KEY_STATUS },
  summary: {
    matched: 5,
    complete: 3,
    missing_games: 2,
    missing_slots: 6,
    existing_enabled_slots: 4,
    locked_games: 1,
  },
  summaryLoaded: true,
  busy: false,
  progress: null,
  sgdbInstalled: false,
  revision: 0,
  ...overrides,
});

const renderBody = (props: Parameters<typeof ArtworkBody>[0]) => {
  hookState.cursor = 0;
  hookState.slots = [];
  return ArtworkBody(props) as ReactElement;
};

describe("ArtworkBody", () => {
  it("disables Preserve existing while Auto-apply is off and renders all 5 slot toggles plus unmasked API key", () => {
    const onSettingsChange = vi.fn();
    const root = renderBody({
      snapshot: makeSnapshot(),
      listReady: true,
      onSettingsChange,
      onFillMissing: vi.fn(),
      onReplaceAll: vi.fn(),
    });

    const tree = nodes(root);
    const toggles = tree.filter((n) => n.type === "ToggleField");
    // 2 automation toggles + 5 slot toggles = 7
    expect(toggles).toHaveLength(7);
    const preserve = toggles.find((t) => t.props?.label === "qam.artwork.preserveExistingLabel")!;
    expect(preserve.props?.disabled).toBe(true);
    expect(preserve.props?.checked).toBe(true);

    // Unmasked SteamGridDB API key TextField (not password-masked).
    const keyField = tree.find((n) => n.type === "TextField")!;
    expect(keyField).toBeDefined();
    expect(keyField.props?.bIsPassword).toBeUndefined();
    expect(keyField.props?.type).toBeUndefined();

    // Default tab dropdown and Decky's reorderable list with one entry per artwork tab.
    const dropdown = tree.find((n) => n.type === "DropdownItem")!;
    expect(dropdown.props?.label).toBe("qam.artwork.defaultTabLabel");
    const list = tree.find((n) => n.type === "ReorderableList")!;
    expect(list.props!.entries).toHaveLength(DEFAULT_ARTWORK_SETTINGS.tabOrder.length);
  });

  it("saves the trimmed API key on blur, only when it changed", () => {
    const onSettingsChange = vi.fn();
    const props = {
      snapshot: makeSnapshot(),
      listReady: true,
      onSettingsChange,
      onFillMissing: vi.fn(),
      onReplaceAll: vi.fn(),
    };
    let keyField = nodes(renderBody(props)).find((n) => n.type === "TextField")!;
    keyField.props!.onBlur();
    expect(onSettingsChange).not.toHaveBeenCalled();

    hookState.slots[0] = "  new-key  ";
    hookState.cursor = 0;
    keyField = nodes(ArtworkBody(props) as ReactElement).find((n) => n.type === "TextField")!;
    keyField.props!.onBlur();
    const update = onSettingsChange.mock.calls[0][0];
    expect(update(DEFAULT_ARTWORK_SETTINGS).sgdbApiKey).toBe("new-key");
  });

  it("saves a typed key when the page closes while the field still has focus", () => {
    const onSettingsChange = vi.fn();
    const props = { snapshot: makeSnapshot(), listReady: true, onSettingsChange, onFillMissing: vi.fn(), onReplaceAll: vi.fn() };
    renderBody(props);
    hookState.slots[0] = "typed-key";
    hookState.cursor = 0;
    ArtworkBody(props);
    // The mount-only effect's cleanup runs on unmount; no blur happens then.
    const calls = vi.mocked(useEffect).mock.calls;
    const [mountOnly] = [...calls].reverse().find(([, deps]) => Array.isArray(deps) && deps.length === 0)!;
    const cleanup = mountOnly() as () => void;
    cleanup();
    expect(onSettingsChange.mock.calls[0][0](DEFAULT_ARTWORK_SETTINGS).sgdbApiKey).toBe("typed-key");
  });

  // The list renders each row's toggle through its `interactables` component, which reads
  // visibility from the context provider around the list.
  const tabList = (tree: Node[]) => {
    const list = tree.find((n) => n.type === "ReorderableList")!;
    hookState.context = tree.find((n) => n.type === "ContextProvider")!.props!.value;
    const entries = list.props!.entries as { data: string; position: number; label: string }[];
    // Each row is a wrapper that keeps clicks from toggling reorder mode, around the Toggle.
    const row = (tab: string) =>
      list.props!.interactables({ entry: entries.find((entry) => entry.data === tab) }) as ReactElement<any>;
    const toggle = (tab: string) => row(tab).props.children as ReactElement<any>;
    return { list, entries, row, toggle };
  };

  it("saves the order from Decky's reorderable list and shows or hides tabs with toggles", () => {
    const onSettingsChange = vi.fn();
    const settings = { ...structuredClone(DEFAULT_ARTWORK_SETTINGS), hiddenTabs: ["hero" as const] };
    const { list, entries, row, toggle } = tabList(nodes(renderBody({
      snapshot: makeSnapshot({ settings }),
      listReady: true,
      onSettingsChange,
      onFillMissing: vi.fn(),
      onReplaceAll: vi.fn(),
    })));
    const order = settings.tabOrder;
    expect(entries.map((entry) => entry.data)).toEqual(order);
    expect(entries.map((entry) => entry.position)).toEqual(order.map((_, index) => index));

    // The list reports new positions on Save Order; the saved order follows them.
    const swapped = entries.map((entry) => ({ ...entry, position: entry.position === 0 ? 1 : entry.position === 1 ? 0 : entry.position }));
    list.props!.onSave(swapped);
    expect(onSettingsChange.mock.calls[0][0](settings).tabOrder).toEqual([order[1], order[0], ...order.slice(2)]);

    expect(toggle("hero").props.value).toBe(false);
    toggle("hero").props.onChange(true);
    expect(onSettingsChange.mock.calls[1][0](settings).hiddenTabs).toEqual([]);
    expect(toggle("manage").props).toMatchObject({ value: true, disabled: true });
    // Decky's list enters reorder mode on any click inside it; the toggle's clicks must stop here.
    const click = { stopPropagation: vi.fn() };
    row("cover").props.onClick(click);
    expect(click.stopPropagation).toHaveBeenCalled();
  });

  it("does not save the tab order before settings load or when the order did not change", () => {
    const onSettingsChange = vi.fn();
    const settings = structuredClone(DEFAULT_ARTWORK_SETTINGS);
    const base = { listReady: true, onSettingsChange, onFillMissing: vi.fn(), onReplaceAll: vi.fn() };
    const swap = (entries: { position: number }[]) =>
      entries.map((entry) => ({ ...entry, position: entry.position === 0 ? 1 : entry.position === 1 ? 0 : entry.position }));

    // X pressed twice without moving: nothing to write.
    const loaded = tabList(nodes(renderBody({ ...base, snapshot: makeSnapshot({ settings }) })));
    loaded.list.props!.onSave(loaded.entries);
    // Settings still loading: a save would write defaults over the stored settings.
    const loading = tabList(nodes(renderBody({ ...base, snapshot: makeSnapshot({ settings, settingsLoaded: false }) })));
    loading.list.props!.onSave(swap(loading.entries));
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it("keeps the list entries when only visibility changes, so an unsaved reorder survives a toggle", () => {
    const props = { listReady: true, onSettingsChange: vi.fn(), onFillMissing: vi.fn(), onReplaceAll: vi.fn() };
    const settings = structuredClone(DEFAULT_ARTWORK_SETTINGS);
    const before = tabList(nodes(renderBody({ ...props, snapshot: makeSnapshot({ settings }) }))).entries;
    const after = tabList(nodes(renderBody({
      ...props,
      snapshot: makeSnapshot({ settings: { ...settings, hiddenTabs: ["hero" as const] } }),
    })));
    // Decky's list resets its draft order when `entries` changes identity.
    expect(after.entries).toBe(before);
    expect(after.toggle("hero").props.value).toBe(false);
  });

  it("moves the default tab to the first shown tab when the default is hidden", () => {
    const onSettingsChange = vi.fn();
    const settings = { ...structuredClone(DEFAULT_ARTWORK_SETTINGS), defaultTab: "cover" as const };
    const props = { listReady: true, onSettingsChange, onFillMissing: vi.fn(), onReplaceAll: vi.fn() };
    const { toggle } = tabList(nodes(renderBody({ ...props, snapshot: makeSnapshot({ settings }) })));
    toggle("cover").props.onChange(false);
    const hidden = onSettingsChange.mock.calls[0][0](settings);
    expect(hidden).toMatchObject({ hiddenTabs: ["cover"], defaultTab: settings.tabOrder.find((tab) => tab !== "cover") });

    // A saved default that is hidden still shows a real choice in the dropdown.
    const stale = { ...settings, hiddenTabs: ["cover" as const] };
    const dropdown = nodes(renderBody({ ...props, snapshot: makeSnapshot({ settings: stale }) }))
      .find((n) => n.type === "DropdownItem")!;
    expect(dropdown.props!.selectedOption).toBe(stale.tabOrder.find((tab) => tab !== "cover"));
  });

  it("shows SteamGridDB coexistence notice when installed and opens ConfirmModal for Replace all", () => {
    ui.showModal.mockClear();
    const onReplaceAll = vi.fn();
    const root = renderBody({
      snapshot: makeSnapshot({ sgdbInstalled: true }),
      listReady: true,
      onSettingsChange: vi.fn(),
      onFillMissing: vi.fn(),
      onReplaceAll,
    });

    const tree = nodes(root);
    expect(tree.some((n) => n.props?.children === "qam.artwork.sgdbNotice")).toBe(true);

    const replaceBtn = tree.find(
      (n) => n.type === "ButtonItem" && n.props?.label === "qam.artwork.replaceAllLabel",
    )!;
    replaceBtn.props!.onClick();
    expect(ui.showModal).toHaveBeenCalledTimes(1);
    const modal = ui.showModal.mock.calls[0][0] as ReactElement<{ onOK: () => void }>;
    modal.props.onOK();
    expect(onReplaceAll).toHaveBeenCalledTimes(1);
  });
});
