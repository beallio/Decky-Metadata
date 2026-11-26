import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ArtworkControllerSnapshot } from "../../artwork/controller";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  Field: "Field",
  ProgressBarWithInfo: "ProgressBarWithInfo",
  ToggleField: "ToggleField",
  showModal: ui.showModal,
}));
vi.mock("../../i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("../../styles", () => ({
  ButtonLabel: "ButtonLabel",
  inlineStatusStyle: () => ({}),
}));

import { ArtworkBody } from "./ArtworkSection";

type Node = { type?: unknown; props?: Record<string, any> };
const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as Node;
  return [el, ...nodes(el.props?.children)];
};

const makeSnapshot = (overrides: Partial<ArtworkControllerSnapshot> = {}): ArtworkControllerSnapshot => ({
  settings: {
    autoApply: false,
    preserveExisting: true,
    slots: { cover: true, wide: true, hero: true, logo: true, icon: true },
  },
  settingsLoaded: true,
  settingsError: "",
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

describe("ArtworkBody", () => {
  it("disables Preserve existing while Auto-apply is off and renders all 5 slot toggles", () => {
    const onSettingsChange = vi.fn();
    const root = ArtworkBody({
      snapshot: makeSnapshot(),
      listReady: true,
      onSettingsChange,
      onFillMissing: vi.fn(),
      onReplaceAll: vi.fn(),
    }) as ReactElement;

    const toggles = nodes(root).filter((n) => n.type === "ToggleField");
    // 2 automation toggles + 5 slot toggles = 7
    expect(toggles).toHaveLength(7);
    const preserve = toggles.find((t) => t.props?.label === "qam.artwork.preserveExistingLabel")!;
    expect(preserve.props?.disabled).toBe(true);
    expect(preserve.props?.checked).toBe(true);
  });

  it("shows SteamGridDB coexistence notice when installed and opens ConfirmModal for Replace all", () => {
    ui.showModal.mockClear();
    const onReplaceAll = vi.fn();
    const root = ArtworkBody({
      snapshot: makeSnapshot({ sgdbInstalled: true }),
      listReady: true,
      onSettingsChange: vi.fn(),
      onFillMissing: vi.fn(),
      onReplaceAll,
    }) as ReactElement;

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
