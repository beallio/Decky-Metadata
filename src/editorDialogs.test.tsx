import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as React from "react";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
// The Steam App ID dialog is a component; render it by hand with one state slot.
const dialogState = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    if (dialogState.value === undefined) dialogState.value = initial;
    return [dialogState.value, (next: unknown) => { dialogState.value = next; }];
  },
}));

vi.mock("@decky/ui", () => ({
  ConfirmModal: "ConfirmModal",
  ScrollPanelGroup: "ScrollPanelGroup",
  TextField: "TextField",
  showModal: ui.showModal,
}));

import {
  draftFieldLabel,
  saveButtonLabel,
  showMetadataReviewModal,
  showRemoveMetadataModal,
  showSteamAppIdModal,
  showUnsavedChangesModal,
} from "./editorDialogs";
import { metadataTemplate } from "./metadataForm";
import { t } from "./i18n";

type TestElement = {
  type: unknown;
  props: { [key: string]: unknown; children?: unknown };
};

const lastModal = (): TestElement =>
  ui.showModal.mock.calls[ui.showModal.mock.calls.length - 1][0] as TestElement;

const listLabels = (modal: TestElement): string[] => {
  const list = modal.props.children as TestElement | null;
  return ((list?.props.children ?? []) as TestElement[]).map(
    (item) => item.props.children as string,
  );
};

const walk = (node: unknown, texts: string[], images: TestElement[]): void => {
  if (typeof node === "string" || typeof node === "number") {
    texts.push(String(node));
  } else if (Array.isArray(node)) {
    node.forEach((child) => walk(child, texts, images));
  } else if (node && typeof node === "object") {
    const element = node as TestElement;
    if (element.type === "img") images.push(element);
    walk(element.props.children, texts, images);
  }
};

beforeEach(() => {
  ui.showModal.mockClear();
  dialogState.value = undefined;
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

describe("showMetadataReviewModal", () => {
  it("shows fetched game details as plain text with a cover and up to three screenshots", () => {
    showMetadataReviewModal({
      metadata: {
        ...metadataTemplate("Hades"),
        developers: [{ name: "Supergiant", url: "" }],
        publishers: [],
        rating: 93,
        genres: ["Action"],
        store_categories: [2],
        description: "Long",
        short_description: "Short text",
        screenshots: ["one", "two", "three", "four"].map((id) => ({
          url: `https://cdn.example/${id}.jpg`,
        })),
      },
      coverUrl: "https://cdn.example/cover.jpg",
    });

    const modal = lastModal();
    expect(modal.type).toBe("ConfirmModal");
    expect(modal.props.strTitle).toBe("Review game details");
    expect(modal.props.strOKButtonText).toBe("Apply");
    expect(modal.props.strCancelButtonText).toBe("Cancel");
    expect(modal.props.strDescription).toBeUndefined();
    // The details scroll in a bounded panel so Apply/Cancel stay on screen;
    // the bound must be on Steam's scroll panel, which is the element that scrolls.
    const panel = modal.props.children as TestElement;
    expect(panel.type).toBe("ScrollPanelGroup");
    expect(panel.props.style).toMatchObject({ maxHeight: "60vh" });
    const texts: string[] = [];
    const images: TestElement[] = [];
    walk(modal.props.children, texts, images);
    expect(texts).toContain("Hades");
    expect(texts).toContain("Developers");
    expect(texts).toContain("Supergiant");
    expect(texts).toContain("Genres");
    expect(texts).toContain("Action");
    expect(texts).toContain("Short text");
    expect(texts).not.toContain("Publishers");
    expect(texts).not.toContain("Long");
    expect(images).toHaveLength(4);
    expect(images[0].props.src).toBe("https://cdn.example/cover.jpg");
  });

  it("resolves true on Apply and false on Cancel or modal close", async () => {
    const applied = showMetadataReviewModal({
      metadata: metadataTemplate("Hades"),
      coverUrl: null,
    });
    const applyElement = ui.showModal.mock.lastCall![0] as TestElement;
    (applyElement.props.onOK as () => void)();
    await expect(applied).resolves.toBe(true);

    const cancelled = showMetadataReviewModal({
      metadata: metadataTemplate("Hades"),
      coverUrl: null,
    });
    const cancelElement = ui.showModal.mock.lastCall![0] as TestElement;
    (cancelElement.props.onCancel as () => void)();
    await expect(cancelled).resolves.toBe(false);

    const closed = showMetadataReviewModal({
      metadata: metadataTemplate("Hades"),
      coverUrl: null,
    });
    const closeProps = ui.showModal.mock.lastCall![2] as {
      fnOnClose: () => void;
    };
    closeProps.fnOnClose();
    await expect(closed).resolves.toBe(false);
  });
});

describe("showSteamAppIdModal", () => {
  it("starts with the current ID, applies the edited text and closes at once", () => {
    const onApply = vi.fn(() => Promise.resolve());
    showSteamAppIdModal({ initial: "15100", onApply });
    const element = lastModal() as TestElement & { type: (props: object) => TestElement };
    const closeModal = vi.fn();
    const render = () => element.type({ ...element.props, closeModal });

    const field = render().props.children as TestElement;
    expect(field.type).toBe("TextField");
    expect(field.props.value).toBe("15100");
    (field.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "620" } });

    const modal = render();
    expect((modal.props.children as TestElement).props.value).toBe("620");
    expect(modal.props.strTitle).toBe("Steam App ID");
    expect(modal.props.strOKButtonText).toBe("Apply");
    expect(modal.props.closeModal).toBe(closeModal);
    // OK must not hand back the load's promise, or Steam keeps the dialog open until it settles.
    expect((modal.props.onOK as () => unknown)()).toBeUndefined();
    expect(onApply).toHaveBeenCalledWith("620");
  });
});
