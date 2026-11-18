import { ConfirmModal, showModal } from "@decky/ui";

import { t } from "./i18n";
import type { DraftFieldKey } from "./metadataDraft";

type TFunction = typeof t;

const FIELD_LABEL_KEYS: Record<DraftFieldKey, string> = {
  title: "editor.field.title",
  description: "editor.field.description",
  developers: "editor.field.developers",
  publishers: "editor.field.publishers",
  releaseDate: "editor.field.releaseDate",
  rating: "editor.field.rating",
  categories: "editor.field.categories",
  compatibility: "editor.compatibilityStatus",
  steamAppId: "editor.steamAppId",
  hltb: "editor.hltbGame",
  steamData: "editor.field.steamData",
};

const changedListStyle = {
  margin: "8px 0 0",
  paddingLeft: 20,
} as const;

export function draftFieldLabel(t: TFunction, key: DraftFieldKey): string {
  return t(FIELD_LABEL_KEYS[key]);
}

export function showUnsavedChangesModal(opts: {
  groups: { page: string; fields: string[] }[];
  onSave: () => void;
  onDiscard: () => void;
  onCancel?: () => void;
}): void {
  showModal(
    <ConfirmModal
      strTitle={t("editor.unsaved.title")}
      strDescription={t("editor.unsaved.body")}
      strOKButtonText={t("editor.save")}
      strMiddleButtonText={t("editor.unsaved.discard")}
      strCancelButtonText={t("editor.unsaved.cancel")}
      onOK={opts.onSave}
      onMiddleButton={opts.onDiscard}
      onCancel={opts.onCancel}
    >
      {opts.groups.length > 0 ? (
        <ul style={changedListStyle}>
          {opts.groups.map(({ page, fields }) => (
            <li key={page}>{t("editor.unsaved.group", { page, fields: fields.join(", ") })}</li>
          ))}
        </ul>
      ) : null}
    </ConfirmModal>,
  );
}

export function showRemoveMetadataModal(opts: {
  gameName: string;
  onConfirm: () => void;
}): void {
  showModal(
    <ConfirmModal
      bDestructiveWarning
      strTitle={t("editor.removeConfirm.title")}
      strDescription={t("editor.removeConfirm.body", { name: opts.gameName })}
      strOKButtonText={t("editor.removeMetadata")}
      strCancelButtonText={t("editor.removeConfirm.cancel")}
      onOK={opts.onConfirm}
    />,
  );
}

export function saveButtonLabel(t: TFunction, count: number): string {
  return count > 0 ? t("editor.saveCount", { count }) : t("editor.save");
}
