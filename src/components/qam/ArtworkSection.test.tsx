import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
const hookState = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }));

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
  ToggleField: "ToggleField",
  showModal: ui.showModal,
}));
vi.mock("../../i18n", () => ({ useT: () => (key: string) => key }));
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

    // Default tab dropdown and ReorderableList are rendered.
    const dropdown = tree.find((n) => n.type === "DropdownItem")!;
    expect(dropdown.props?.label).toBe("qam.artwork.defaultTabLabel");
    expect(tree.some((n) => n.type === "ReorderableList")).toBe(true);
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
