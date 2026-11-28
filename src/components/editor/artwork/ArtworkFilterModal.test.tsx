import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  refCursor: 0,
  refs: [] as { current: unknown }[],
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.slots.length) hooks.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(hooks.slots[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.refCursor++;
    if (!hooks.refs[index]) hooks.refs[index] = { current: initial };
    return hooks.refs[index];
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

import { sgdbSearchGames } from "../../../backend";
import { defaultSlotFilter } from "../../../artwork/controller";
import type { SgdbGame, SgdbSlotFilter } from "../../../types";
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
  hooks.refCursor = 0;
  if (!keepState) {
    hooks.slots = [];
    hooks.refs = [];
  }
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
  hooks.refCursor = 0;
  hooks.refs = [];
  vi.mocked(sgdbSearchGames).mockReset();
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

  it("clears previous results when a search starts and leaves them cleared on failure", async () => {
    vi.mocked(sgdbSearchGames)
      .mockResolvedValueOnce([{ id: 1, name: "Old result" }])
      .mockRejectedValueOnce(new Error("search failed"));
    const closeModal = vi.fn();
    let modal = renderModal(vi.fn(async () => true), closeModal);
    nodes(modal).find((node) => node.type === "TextField")!.props!.onChange({ target: { value: "first" } });
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    nodes(modal).find((node) => node.type === "DialogButton" && node.props?.children === "editor.search")!.props!.onClick();
    await Promise.resolve();
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    expect(nodes(modal).some((node) => node.props?.label === "Old result")).toBe(true);

    nodes(modal).find((node) => node.type === "TextField")!.props!.onChange({ target: { value: "second" } });
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    nodes(modal).find((node) => node.type === "DialogButton" && node.props?.children === "editor.search")!.props!.onClick();
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    expect(nodes(modal).some((node) => node.props?.label === "Old result")).toBe(false);

    await Promise.resolve();
    await Promise.resolve();
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    expect(nodes(modal).some((node) => node.props?.label === "Old result")).toBe(false);
    expect(nodes(modal).some((node) => node.props?.description === "Error: search failed")).toBe(true);
  });

  it("ignores results from superseded searches", async () => {
    const first = Promise.withResolvers<SgdbGame[]>();
    const second = Promise.withResolvers<SgdbGame[]>();
    vi.mocked(sgdbSearchGames).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const closeModal = vi.fn();
    let modal = renderModal(vi.fn(async () => true), closeModal);
    nodes(modal).find((node) => node.type === "TextField")!.props!.onChange({ target: { value: "first" } });
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    nodes(modal).find((node) => node.type === "DialogButton" && node.props?.children === "editor.search")!.props!.onClick();
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    nodes(modal).find((node) => node.type === "TextField")!.props!.onChange({ target: { value: "second" } });
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    nodes(modal).find(
      (node) =>
        node.type === "DialogButton" &&
        (node.props?.children === "editor.search" || node.props?.children === "editor.searching"),
    )!.props!.onClick();

    second.resolve([{ id: 2, name: "Current result" }]);
    await second.promise;
    await Promise.resolve();
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    first.resolve([{ id: 1, name: "Stale result" }]);
    await first.promise;
    await Promise.resolve();
    modal = renderModal(vi.fn(async () => true), closeModal, true);
    expect(nodes(modal).some((node) => node.props?.label === "Current result")).toBe(true);
    expect(nodes(modal).some((node) => node.props?.label === "Stale result")).toBe(false);
  });
  it("labels Microsoft icon MIME as ICO", () => {
    expect(mimeLabel("image/vnd.microsoft.icon")).toBe("ICO");
  });
});
