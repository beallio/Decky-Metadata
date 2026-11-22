import { ConfirmModal, Focusable, ScrollPanelGroup, showModal } from "@decky/ui";

import { t } from "./i18n";
import { personsToText } from "./metadataForm";
import type { DraftFieldKey } from "./metadataDraft";
import { categoryLabel, type MetadataData } from "./types";

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

const reviewCoverStyle = {
  maxWidth: 184,
  maxHeight: 184,
  flexShrink: 0,
  objectFit: "contain",
  borderRadius: 4,
} as const;

const reviewDescriptionStyle = {
  marginTop: 12,
  whiteSpace: "pre-line",
} as const;

// Long details scroll inside the modal instead of pushing Apply/Cancel off screen (same bound as PluginLogModal).
const reviewBodyStyle = {
  maxHeight: "60vh",
  overflowY: "auto",
} as const;

const reviewScreenshotStyle = {
  width: 160,
  height: 90,
  objectFit: "cover",
  borderRadius: 4,
} as const;

const reviewHeaderStyle = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
} as const;

const reviewTitleStyle = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 8,
} as const;

const reviewFactsStyle = {
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  columnGap: 12,
  rowGap: 4,
} as const;

const reviewFactLabelStyle = {
  color: "#8b929a",
} as const;

const reviewScreenshotsStyle = {
  display: "flex",
  gap: 8,
  marginTop: 12,
} as const;

const reviewFactRowStyle = {
  display: "contents",
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

export function showMetadataReviewModal(opts: {
  metadata: MetadataData;
  coverUrl: string | null;
}): Promise<boolean> {
  const { metadata, coverUrl } = opts;
  const facts: [string, string][] = (
    [
      [t("editor.field.developers"), personsToText(metadata.developers)],
      [t("editor.field.publishers"), personsToText(metadata.publishers)],
      [t("editor.field.releaseDate"), metadata.release_date ?? ""],
      [t("editor.field.rating"), metadata.rating == null ? "" : String(metadata.rating)],
      [t("editor.review.genres"), (metadata.genres ?? []).join(", ")],
      [
        t("editor.field.categories"),
        (metadata.store_categories ?? []).map((category) => categoryLabel(category, t)).join(", "),
      ],
    ] as [string, string][]
  ).filter(([, value]) => value !== "");
  const description = metadata.short_description?.trim()
    ? metadata.short_description
    : metadata.description || "";
  const screenshots = (metadata.screenshots ?? []).slice(0, 3);
  const content = (
    <ScrollPanelGroup>
      <Focusable noFocusRing style={reviewBodyStyle}>
        <div style={reviewHeaderStyle}>
          {coverUrl ? <img src={coverUrl} alt="" style={reviewCoverStyle} /> : null}
          <div>
            <div style={reviewTitleStyle}>{metadata.title}</div>
            <div style={reviewFactsStyle}>
              {facts.map(([label, value]) => (
                <div key={label} style={reviewFactRowStyle}>
                  <div style={reviewFactLabelStyle}>{label}</div>
                  <div>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {description ? <div style={reviewDescriptionStyle}>{description}</div> : null}
        {screenshots.length > 0 ? (
          <div style={reviewScreenshotsStyle}>
            {screenshots.map((shot) => (
              <img key={shot.url} src={shot.url} alt="" style={reviewScreenshotStyle} />
            ))}
          </div>
        ) : null}
      </Focusable>
    </ScrollPanelGroup>
  );
  return new Promise<boolean>((resolve) => {
    showModal(
      <ConfirmModal
        strTitle={t("editor.review.title")}
        strOKButtonText={t("editor.review.apply")}
        strCancelButtonText={t("editor.review.cancel")}
        onOK={() => resolve(true)}
        onCancel={() => resolve(false)}
      >
        {content}
      </ConfirmModal>,
      undefined,
      {
        strTitle: t("editor.review.title"),
        bHideMainWindowForPopouts: false,
        fnOnClose: () => resolve(false),
      },
    );
  });
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
