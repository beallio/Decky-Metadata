import { ConfirmModal, ScrollPanelGroup, TextField, showModal } from "@decky/ui";
import { useState } from "react";
import type { CSSProperties, FC, ReactNode } from "react";

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

// Long details scroll inside the modal instead of pushing Apply/Cancel off screen.
// The bound sits on the scroll panel itself: Steam's ScrollPanelGroup is the
// focusable element that scrolls, and it forwards style to that element.
const reviewBodyStyle = {
  maxHeight: "60vh",
  overflowY: "auto",
} as const;

// @decky/ui types only children, but Steam's ScrollPanelGroup forwards style to its panel.
const ReviewScrollPanel = ScrollPanelGroup as FC<{ children?: ReactNode; style?: CSSProperties }>;

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
        // Steam sends category codes the plugin has no label for; list only the ones it can name.
        (metadata.store_categories ?? []).map((category) => categoryLabel(category, t)).filter(Boolean).join(", "),
      ],
    ] as [string, string][]
  ).filter(([, value]) => value !== "");
  const description = metadata.short_description?.trim()
    ? metadata.short_description
    : metadata.description || "";
  const screenshots = (metadata.screenshots ?? []).slice(0, 3);
  const content = (
    <ReviewScrollPanel style={reviewBodyStyle}>
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
    </ReviewScrollPanel>
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

type SteamAppIdModalProps = {
  initial: string;
  onApply: (text: string) => void;
  /** Injected by showModal; ConfirmModal closes through it after OK or Cancel. */
  closeModal?: () => void;
};

// showModal renders this as a component, so it may hold the typed text in state.
// OK drops onApply's promise so the dialog closes at once; the page shows its own busy state.
function SteamAppIdModal({ initial, onApply, closeModal }: SteamAppIdModalProps) {
  const [text, setText] = useState(initial);
  return (
    <ConfirmModal
      strTitle={t("editor.steamAppId")}
      strDescription={t("editor.steamAppIdHelp")}
      strOKButtonText={t("editor.review.apply")}
      strCancelButtonText={t("editor.review.cancel")}
      onOK={() => {
        onApply(text);
      }}
      closeModal={closeModal}
    >
      <TextField
        aria-label={t("editor.steamAppId")}
        value={text}
        focusOnMount
        bShowClearAction
        onChange={(event) => setText(event.target.value)}
      />
    </ConfirmModal>
  );
}

export function showSteamAppIdModal(opts: { initial: string; onApply: (text: string) => void }): void {
  showModal(<SteamAppIdModal initial={opts.initial} onApply={opts.onApply} />);
}

export function saveButtonLabel(t: TFunction, count: number): string {
  return count > 0 ? t("editor.saveCount", { count }) : t("editor.save");
}
