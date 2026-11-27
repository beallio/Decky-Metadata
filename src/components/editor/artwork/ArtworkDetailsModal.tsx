import { DialogButton, Focusable, ModalRoot } from "@decky/ui";
import { useT } from "../../../i18n";
import { colors } from "../../../tokens";
import type { ArtworkSlot, SgdbAsset } from "../../../types";
import { artworkBrowserClass, mimeLabel } from "./artworkStyles";

export type ArtworkDetailsModalProps = {
  slot: ArtworkSlot;
  asset: SgdbAsset;
  applying: boolean;
  onApply: () => void;
  closeModal?: () => void;
};

export function ArtworkDetailsModal({
  slot,
  asset,
  applying,
  onApply,
  closeModal,
}: ArtworkDetailsModalProps) {
  const t = useT();
  const transparentBg = slot === "logo" || slot === "icon";

  return (
    <ModalRoot onCancel={closeModal} onEscKeypress={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
          {t("editor.artwork.detailsTitle")}
        </div>

        <div
          className={`${artworkBrowserClass}__card-media${transparentBg ? " is-transparent-bg" : ""}`}
          style={{ maxHeight: 280, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <img
            src={asset.url}
            alt=""
            style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain", display: "block" }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {asset.animated ? (
            <span className={`${artworkBrowserClass}__badge ${artworkBrowserClass}__badge--animated`}>
              {t("editor.artwork.badgeAnimated")}
            </span>
          ) : null}
          {asset.width > 0 && asset.height > 0 ? (
            <span className={`${artworkBrowserClass}__badge`}>{`${asset.width}x${asset.height}`}</span>
          ) : null}
          {asset.style ? (
            <span className={`${artworkBrowserClass}__badge`}>{asset.style.replace("_", " ")}</span>
          ) : null}
          {asset.mime ? (
            <span className={`${artworkBrowserClass}__badge`}>{mimeLabel(asset.mime)}</span>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: colors.textSecondary }}>
          <div>
            <strong style={{ color: colors.text }}>{t("editor.artwork.detailsAuthor")}: </strong>
            {asset.author.name || t("editor.artwork.unknownAuthor")}
          </div>
          {asset.notes ? (
            <div>
              <strong style={{ color: colors.text }}>{t("editor.artwork.detailsNotes")}: </strong>
              {asset.notes}
            </div>
          ) : null}
        </div>

        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}
        >
          <DialogButton
            className={`${artworkBrowserClass}__action-btn`}
            disabled={applying}
            onClick={closeModal}
          >
            {t("editor.artwork.cancelAction")}
          </DialogButton>
          <DialogButton
            className={`${artworkBrowserClass}__action-btn`}
            disabled={applying}
            onClick={() => {
              onApply();
              closeModal?.();
            }}
          >
            {t("editor.artwork.applyAction")}
          </DialogButton>
        </Focusable>
      </div>
    </ModalRoot>
  );
}
