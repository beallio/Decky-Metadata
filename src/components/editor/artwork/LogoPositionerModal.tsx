import {
  DialogButton,
  Field,
  Focusable,
  ModalRoot,
  SliderField,
} from "@decky/ui";
import { useState, type CSSProperties } from "react";
import { translateBackendError, useT } from "../../../i18n";
import {
  clearCustomLogoPosition,
  getCustomLogoPosition,
  saveCustomLogoPosition,
  STEAM_LOGO_ANCHORS,
} from "../../../steam/customArtwork";
import { toastError, toastSuccess } from "../../../toast";
import type { SteamLogoAnchor, SteamLogoPosition } from "../../../types";
import { artworkBrowserClass } from "./artworkStyles";

export type LogoPositionerModalProps = {
  appId: number;
  heroPreviewUrl: string | null;
  logoPreviewUrl: string | null;
  onSaved?: () => void;
  closeModal?: () => void;
};

const ANCHOR_LABELS: Record<SteamLogoAnchor, string> = {
  UpperLeft: "UL",
  UpperCenter: "UC",
  UpperRight: "UR",
  CenterLeft: "CL",
  CenterCenter: "CC",
  CenterRight: "CR",
  BottomLeft: "BL",
  BottomCenter: "BC",
  BottomRight: "BR",
};

export function logoPreviewBoxStyle(position: SteamLogoPosition): CSSProperties {
  const style: CSSProperties = {
    position: "absolute",
    width: `${position.nWidthPct}%`,
    height: `${position.nHeightPct}%`,
    display: "flex",
    pointerEvents: "none",
    padding: 8,
    boxSizing: "border-box",
  };
  if (position.pinnedPosition.startsWith("Upper")) {
    style.top = 0;
    style.alignItems = "flex-start";
  } else if (position.pinnedPosition.startsWith("Center")) {
    style.top = "50%";
    style.transform = "translateY(-50%)";
    style.alignItems = "center";
  } else {
    style.bottom = 0;
    style.alignItems = "flex-end";
  }

  if (position.pinnedPosition.endsWith("Left")) {
    style.left = 0;
    style.justifyContent = "flex-start";
  } else if (position.pinnedPosition.endsWith("Center")) {
    style.left = "50%";
    style.transform = style.transform ? "translate(-50%, -50%)" : "translateX(-50%)";
    style.justifyContent = "center";
  } else {
    style.right = 0;
    style.justifyContent = "flex-end";
  }
  return style;
}

export function LogoPositionerModal({
  appId,
  heroPreviewUrl,
  logoPreviewUrl,
  onSaved,
  closeModal,
}: LogoPositionerModalProps) {
  const t = useT();
  const [position, setPosition] = useState<SteamLogoPosition>(() => getCustomLogoPosition(appId));
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveCustomLogoPosition(appId, position);
      toastSuccess(t("artwork.toast.appliedTitle"), t("editor.artwork.logoPositionSaved"));
      onSaved?.();
      closeModal?.();
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await clearCustomLogoPosition(appId);
      toastSuccess(t("artwork.toast.clearedTitle"), t("editor.artwork.logoPositionReset"));
      onSaved?.();
      closeModal?.();
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot onCancel={closeModal} onEscKeypress={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
          {t("editor.artwork.logoPositionTitle")}
        </div>

        <div className={`${artworkBrowserClass}__logo-stage`}>
          {heroPreviewUrl ? (
            <img
              src={heroPreviewUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
          <div style={logoPreviewBoxStyle(position)}>
            {logoPreviewUrl ? (
              <img
                src={logoPreviewUrl}
                alt=""
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  border: "2px dashed rgba(143, 210, 255, 0.85)",
                  background: "rgba(26, 159, 255, 0.16)",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {t("qam.artwork.slot.logo.label")}
              </div>
            )}
          </div>
        </div>

        <Field label={t("editor.artwork.logoAnchorLabel")} childrenLayout="below" childrenContainerWidth="max">
          <Focusable className={`${artworkBrowserClass}__anchor-grid`}>
            {STEAM_LOGO_ANCHORS.map((anchor) => {
              const selected = position.pinnedPosition === anchor;
              return (
                <DialogButton
                  key={anchor}
                  className={`${artworkBrowserClass}__action-btn`}
                  style={
                    selected
                      ? { background: "rgba(26, 159, 255, 0.35)", border: "1px solid #66c0f4" }
                      : undefined
                  }
                  onClick={() => setPosition((prev) => ({ ...prev, pinnedPosition: anchor }))}
                >
                  {ANCHOR_LABELS[anchor]}
                </DialogButton>
              );
            })}
          </Focusable>
        </Field>

        <SliderField
          label={t("editor.artwork.logoWidthLabel")}
          value={position.nWidthPct}
          min={10}
          max={100}
          step={5}
          showValue={true}
          valueSuffix="%"
          onChange={(nWidthPct) => setPosition((prev) => ({ ...prev, nWidthPct }))}
        />

        <SliderField
          label={t("editor.artwork.logoHeightLabel")}
          value={position.nHeightPct}
          min={10}
          max={100}
          step={5}
          showValue={true}
          valueSuffix="%"
          onChange={(nHeightPct) => setPosition((prev) => ({ ...prev, nHeightPct }))}
        />

        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 4 }}
        >
          <DialogButton
            className={`${artworkBrowserClass}__action-btn`}
            disabled={busy}
            onClick={() => void handleReset()}
          >
            {t("editor.artwork.resetLogoPosition")}
          </DialogButton>
          <div style={{ display: "flex", gap: 8 }}>
            <DialogButton
              className={`${artworkBrowserClass}__action-btn`}
              disabled={busy}
              onClick={closeModal}
            >
              {t("editor.artwork.cancelAction")}
            </DialogButton>
            <DialogButton
              className={`${artworkBrowserClass}__action-btn`}
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {t("editor.artwork.saveLogoPosition")}
            </DialogButton>
          </div>
        </Focusable>
      </div>
    </ModalRoot>
  );
}
