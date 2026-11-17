import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ showModal: vi.fn(), showContextMenu: vi.fn() }));

vi.mock("@decky/ui", () => ({
  ConfirmModal: "ConfirmModal",
  Menu: "Menu",
  MenuItem: "MenuItem",
  showModal: ui.showModal,
  showContextMenu: ui.showContextMenu,
}));

import {
  draftFieldLabel,
  saveButtonLabel,
  showEditorMoreMenu,
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

const menuItems = (menu: TestElement): TestElement[] => menu.props.children as TestElement[];

beforeEach(() => {
  ui.showModal.mockClear();
  ui.showContextMenu.mockClear();
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
  it("offers Save, Discard and Cancel and lists the changed fields", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();

    showUnsavedChangesModal({
      changed: ["title", "steamData", "rating"],
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
    expect(listLabels(modal)).toEqual(["Title", "Steam data not shown in the form", "Rating"]);

    (modal.props.onOK as () => void)();
    expect(onSave).toHaveBeenCalledTimes(1);
    (modal.props.onMiddleButton as () => void)();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    (modal.props.onCancel as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("showRemoveMetadataModal", () => {
  it("warns destructively and names the game", () => {
    const onConfirm = vi.fn();

    showRemoveMetadataModal({ gameName: "Half-Life", onConfirm });

    const modal = lastModal();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.bDestructiveWarning).toBe(true);
    expect(modal.props.strTitle).toBe("Remove metadata?");
    expect(modal.props.strDescription as string).toContain("Half-Life");
    expect(modal.props.strOKButtonText).toBe("Remove metadata");
    (modal.props.onOK as () => void)();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("showEditorMoreMenu", () => {
  it("disables Refresh from Steam when it cannot refresh", () => {
    const onRefresh = vi.fn();
    const onRemove = vi.fn();
    const parent = new EventTarget();

    showEditorMoreMenu({ canRefresh: false, onRefresh, onRemove, parent });

    const menu = ui.showContextMenu.mock.calls[0][0] as TestElement;
    const [refresh, remove] = menuItems(menu);
    expect(menu.type).toBe("Menu");
    expect(menu.props.label).toBe("Metadata");
    expect(ui.showContextMenu.mock.calls[0][1]).toBe(parent);
    expect(refresh.props.disabled).toBe(true);
    expect(refresh.props.children).toBe("Refresh from Steam");
    (refresh.props.onSelected as () => void)();
    expect(onRefresh).not.toHaveBeenCalled();
    (remove.props.onSelected as () => void)();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(remove.props.children).toBe("Remove metadata");
  });

  it("runs Refresh from Steam when it can refresh", () => {
    const onRefresh = vi.fn();

    showEditorMoreMenu({ canRefresh: true, onRefresh, onRemove: vi.fn() });

    const menu = ui.showContextMenu.mock.calls[0][0] as TestElement;
    const [refresh] = menuItems(menu);
    expect(refresh.props.disabled).toBe(false);
    (refresh.props.onSelected as () => void)();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
