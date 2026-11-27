import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.slots.length) hooks.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(hooks.slots[index]) : value;
    }];
  },
}));
vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  Field: "Field",
  Focusable: "Focusable",
  ModalRoot: "ModalRoot",
  TextField: "TextField",
  ToggleField: "ToggleField",
}));
vi.mock("@decky/api", () => ({ callable: () => vi.fn(), openFilePicker: vi.fn() }));
vi.mock("../../../backend", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  clearSgdbGameOverride: vi.fn(),
  setSgdbGameOverride: vi.fn(),
  sgdbSearchGames: vi.fn(),
}));
vi.mock("../../../i18n", () => ({ useT: () => (key: string) => key, translateBackendError: String }));
vi.mock("../../../toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

import { defaultSlotFilter } from "../../../artwork/controller";
import type { SgdbSlotFilter } from "../../../types";
import { ArtworkFilterModal } from "./ArtworkFilterModal";
import { mimeLabel } from "./artworkStyles";

type Node = { type?: unknown; props?: Record<string, any> };
const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const element = node as Node;
  return [element, ...nodes(element.props?.children)];
};

const renderModal = (
  onApplyFilter: (filter: SgdbSlotFilter) => Promise<boolean>,
  closeModal: () => void,
  keepState = false,
) => {
  hooks.cursor = 0;
  if (!keepState) hooks.slots = [];
  return ArtworkFilterModal({
    appId: 1,
    slot: "cover",
    currentGame: null,
    isOverride: false,
    initialQuery: "",
    initialFilter: defaultSlotFilter("cover"),
    onApplyFilter,
    onGameChanged: vi.fn(),
    closeModal,
  }) as ReactElement;
};

beforeEach(() => {
  hooks.cursor = 0;
  hooks.slots = [];
});

describe("ArtworkFilterModal", () => {
  it("closes after apply only when the save succeeds", async () => {
    for (const succeeds of [true, false]) {
      const closeModal = vi.fn();
      const onApplyFilter = vi.fn(async () => succeeds);
      let modal = renderModal(onApplyFilter, closeModal);
      const apply = nodes(modal).find((node) => node.type === "DialogButton" && node.props?.children === "editor.artwork.applyFilters");
      await apply?.props?.onClick();
      expect(onApplyFilter).toHaveBeenCalledWith(defaultSlotFilter("cover"));
      expect(closeModal).toHaveBeenCalledTimes(succeeds ? 1 : 0);
    }
  });

  it("passes a toggled chip filter to apply", async () => {
    const closeModal = vi.fn();
    const onApplyFilter = vi.fn(async () => true);
    let modal = renderModal(onApplyFilter, closeModal);
    const dimension = nodes(modal).find((node) => node.type === "Focusable" && node.props?.children === "512x512");
    expect(dimension).toBeDefined();
    dimension!.props!.onClick();
    modal = renderModal(onApplyFilter, closeModal, true);
    const apply = nodes(modal).find((node) => node.type === "DialogButton" && node.props?.children === "editor.artwork.applyFilters");
    await apply?.props?.onClick();
    expect(onApplyFilter).toHaveBeenCalledWith({ ...defaultSlotFilter("cover"), dimensions: [...defaultSlotFilter("cover").dimensions, "512x512"] });
  });

  it("labels Microsoft icon MIME as ICO", () => {
    expect(mimeLabel("image/vnd.microsoft.icon")).toBe("ICO");
  });
});
