import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
const ctrl = vi.hoisted(() => ({
  getSnapshot: vi.fn(() => ({
    settings: {
      autoApply: false,
      preserveExisting: true,
      slots: { cover: true, wide: true, hero: true, logo: true, icon: true },
    },
    settingsLoaded: true,
    settingsError: "",
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
  setGameLocked: vi.fn(),
  applySingleSlot: vi.fn(),
  clearSingleSlot: vi.fn(),
  applyForGame: vi.fn(),
}));
const hookState = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const idx = hookState.cursor++;
    if (idx >= hookState.slots.length) {
      hookState.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    }
    return [hookState.slots[idx], (val: unknown) => { hookState.slots[idx] = val; }];
  },
  useCallback: <T,>(fn: T) => fn,
  useEffect: vi.fn(),
}));
vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DialogButton: "DialogButton",
  Field: "Field",
  ToggleField: "ToggleField",
  showModal: ui.showModal,
}));
vi.mock("../../artwork/controller", () => ({ artworkController: ctrl }));
vi.mock("../../backend", () => ({ getGameArtworkState: vi.fn() }));
vi.mock("../../i18n", () => ({
  useT: () => (key: string) => key,
  translateBackendError: (e: unknown) => String(e),
}));
vi.mock("../../toast", () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("../../styles", () => ({ FocusableButton: "FocusableButton" }));

import { ArtworkEditorPage } from "./ArtworkEditorPage";

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
  return ArtworkEditorPage(props) as ReactElement;
};

describe("ArtworkEditorPage", () => {
  it("guards unsaved Steam match previews before allowing artwork changes", () => {
    const onSaveMatch = vi.fn();
    const root = renderPage({
      appId: 1001,
      gameName: "Hades II",
      savedSteamAppId: null,
      savedSteamName: "",
      unsavedSteamAppId: 1145350,
      entryBusy: false,
      onGoToSteamMatch: vi.fn(),
      onSaveMatch,
    });
    const saveBtn = nodes(root).find((n) => n.type === "ButtonItem")!;
    expect(saveBtn.props?.label).toBe("editor.artwork.pendingMatchLabel");
    saveBtn.props!.onClick();
    expect(onSaveMatch).toHaveBeenCalledTimes(1);
  });

  it("shows empty unmatched state with jump button to Steam Match", () => {
    const onGoToSteamMatch = vi.fn();
    const root = renderPage({
      appId: 1001,
      gameName: "Bloodborne",
      savedSteamAppId: null,
      savedSteamName: "",
      unsavedSteamAppId: null,
      entryBusy: false,
      onGoToSteamMatch,
      onSaveMatch: vi.fn(),
    });
    const btn = nodes(root).find((n) => n.type === "ButtonItem")!;
    expect(btn.props?.label).toBe("editor.artwork.noMatchLabel");
    btn.props!.onClick();
    expect(onGoToSteamMatch).toHaveBeenCalledTimes(1);
  });
});
