import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));

vi.mock("@decky/ui", () => ({
  ConfirmModal: "ConfirmModal",
  showModal: ui.showModal,
}));

import {
  draftFieldLabel,
  saveButtonLabel,
  showRemoveMetadataModal,
  showUnsavedChangesModal,
} from "./editorDialogs";
import { t } from "./i18n";

type TestElement = {
  type: unknown;
  props: { [key: string]: unknown; children?: unknown };
};

const lastModal = (): TestElement => ui.showModal.mock.calls[0][0] as TestElement;

const listLabels = (modal: TestElement): string[] => {
  const list = modal.props.children as TestElement | null;
  return ((list?.props.children ?? []) as TestElement[]).map(
    (item) => item.props.children as string,
  );
};

beforeEach(() => {
  ui.showModal.mockClear();
});

describe("draftFieldLabel", () => {
  it("labels every draft field from the editor catalog", () => {
    expect(draftFieldLabel(t, "title")).toBe("Title");
    expect(draftFieldLabel(t, "steamAppId")).toBe("Steam App ID");
    expect(draftFieldLabel(t, "hltb")).toBe("HowLongToBeat game");
    expect(draftFieldLabel(t, "categories")).toBe("Categories");
    expect(draftFieldLabel(t, "steamData")).toBe("Steam data not shown in the form");
  });
});

describe("saveButtonLabel", () => {
  it("shows the plain Save label when nothing changed", () => {
    expect(saveButtonLabel(t, 0)).toBe("Save");
  });

  it("shows the changed count when fields changed", () => {
    expect(saveButtonLabel(t, 3)).toBe("Save (3)");
  });
});

describe("showUnsavedChangesModal", () => {
  it("offers Save, Discard and Cancel and groups changed fields by page", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();

    showUnsavedChangesModal({
      groups: [
        { page: "Details", fields: ["Title", "Rating"] },
        { page: "Steam Match", fields: ["Steam data not shown in the form"] },
      ],
      onSave,
      onDiscard,
      onCancel,
    });

    const modal = lastModal();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.strTitle).toBe("Save changes?");
    expect(modal.props.strDescription).toBe("You have unsaved changes to this game's metadata.");
    expect(modal.props.strOKButtonText).toBe("Save");
    expect(modal.props.strMiddleButtonText).toBe("Discard");
    expect(modal.props.strCancelButtonText).toBe("Cancel");
    expect(listLabels(modal)).toEqual([
      "Details: Title, Rating",
      "Steam Match: Steam data not shown in the form",
    ]);

    (modal.props.onOK as () => void)();
    expect(onSave).toHaveBeenCalledTimes(1);
    (modal.props.onMiddleButton as () => void)();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    (modal.props.onCancel as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("can prompt without field labels when saved metadata has not loaded", () => {
    showUnsavedChangesModal({ groups: [], onSave: vi.fn(), onDiscard: vi.fn() });

    expect(lastModal().props.children).toBeNull();
  });
});

describe("showRemoveMetadataModal", () => {
  it("warns destructively and names the game", () => {
    const onConfirm = vi.fn();

    showRemoveMetadataModal({ gameName: "Half-Life", onConfirm });

    const modal = lastModal();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.bDestructiveWarning).toBe(true);
    expect(modal.props.strTitle).toBe("Remove Metadata?");
    expect(modal.props.strDescription as string).toContain("Half-Life");
    expect(modal.props.strOKButtonText).toBe("Remove Metadata");
    (modal.props.onOK as () => void)();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
