import {
  ButtonItem,
  ConfirmModal,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  ToggleField,
  showModal,
} from "@decky/ui";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

import { artworkController } from "../../artwork/controller";
import { getGameArtworkState } from "../../backend";
import { translateBackendError, useT } from "../../i18n";
import { editorFocusTargetClassName } from "../../metadataEditorStyles";
import { ARTWORK_SLOT_ORDER } from "../../steam/customArtwork";
import { FocusableButton } from "../../styles";
import { toastError, toastSuccess } from "../../toast";
import { colors } from "../../tokens";
import type { ArtworkSlot, GameArtworkState } from "../../types";

type ArtworkEditorPageProps = {
  appId: number;
  gameName: string;
  savedSteamAppId: number | null;
  savedSteamName: string;
  unsavedSteamAppId: number | null;
  entryBusy: boolean;
  onGoToSteamMatch: () => void;
  onSaveMatch: () => void;
};

const thumbPairStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const thumbWellStyle: CSSProperties = {
  width: 68,
  height: 46,
  borderRadius: 2,
  background: "rgba(0, 0, 0, 0.35)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const thumbImgStyle: CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
  display: "block",
};

const thumbPlaceholderStyle: CSSProperties = {
  fontSize: 11,
  color: colors.textSecondary,
};

const slotActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const slotButtonStyle: CSSProperties = {
  width: "auto",
  minWidth: 92,
  padding: "0 12px",
  whiteSpace: "nowrap",
};

const slotLabelKey = (slot: ArtworkSlot): string => `qam.artwork.slot.${slot}.label`;
const slotDimsKey = (slot: ArtworkSlot): string => `editor.artwork.dims.${slot}`;

export function ArtworkEditorPage({
  appId,
  gameName,
  savedSteamAppId,
  savedSteamName,
  unsavedSteamAppId,
  entryBusy,
  onGoToSteamMatch,
  onSaveMatch,
}: ArtworkEditorPageProps) {
  const t = useT();
  const [artworkState, setArtworkState] = useState<GameArtworkState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busySlot, setBusySlot] = useState<ArtworkSlot | "bulk" | "lock" | null>(null);
  const [settingsSnap, setSettingsSnap] = useState(() => artworkController.getSnapshot());

  useEffect(() => {
    const unsubscribe = artworkController.subscribe(() => {
      setSettingsSnap(artworkController.getSnapshot());
    });
    setSettingsSnap(artworkController.getSnapshot());
    return unsubscribe;
  }, []);

  const loadState = useCallback(async () => {
    if (savedSteamAppId === null) {
      setArtworkState(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const loaded = await getGameArtworkState(appId, savedSteamAppId);
      setArtworkState(loaded);
    } catch (loadError) {
      setError(translateBackendError(loadError));
    } finally {
      setLoading(false);
    }
  }, [appId, savedSteamAppId]);

  useEffect(() => {
    void loadState();
  }, [loadState, settingsSnap.revision]);

  const busy = entryBusy || busySlot !== null || settingsSnap.busy;
  const hasUnsavedMatch =
    unsavedSteamAppId !== null && unsavedSteamAppId !== savedSteamAppId;

  if (hasUnsavedMatch) {
    return (
      <DialogControlsSection>
        <Field
          focusable={false}
          description={t("editor.artwork.immediateNotice")}
          bottomSeparator="standard"
        />
        <Field
          focusable={false}
          description={
            <span style={{ color: colors.warning }}>
              {t("editor.artwork.unsavedMatchNotice", { appId: unsavedSteamAppId })}
            </span>
          }
          bottomSeparator="standard"
        />
        <ButtonItem
          layout="inline"
          label={t("editor.artwork.pendingMatchLabel")}
          description={t("editor.artwork.pendingMatchDescription")}
          disabled={entryBusy}
          onClick={onSaveMatch}
          bottomSeparator="none"
        >
          {t("editor.artwork.saveMatchAction")}
        </ButtonItem>
      </DialogControlsSection>
    );
  }

  if (savedSteamAppId === null) {
    return (
      <DialogControlsSection>
        <Field
          focusable={false}
          description={t("editor.artwork.immediateNotice")}
          bottomSeparator="standard"
        />
        <ButtonItem
          layout="inline"
          label={t("editor.artwork.noMatchLabel")}
          description={t("editor.artwork.noMatchDescription")}
          disabled={entryBusy}
          onClick={onGoToSteamMatch}
          bottomSeparator="none"
        >
          {t("editor.artwork.openSteamMatchAction")}
        </ButtonItem>
      </DialogControlsSection>
    );
  }

  const slots = artworkState?.slots;
  const enabledSlots = ARTWORK_SLOT_ORDER.filter((slot) => settingsSnap.settings.slots[slot]);
  const missingEnabledCount = slots
    ? enabledSlots.filter((slot) => slots[slot]?.available && !slots[slot]?.present).length
    : 0;
  const existingEnabledCount = slots
    ? enabledSlots.filter((slot) => slots[slot]?.available && slots[slot]?.present).length
    : 0;
  const availableEnabledCount = slots
    ? enabledSlots.filter((slot) => slots[slot]?.available).length
    : 0;

  const toggleLock = async (locked: boolean) => {
    setBusySlot("lock");
    try {
      const saved = await artworkController.setGameLocked(appId, locked);
      setArtworkState((current) => (current ? { ...current, locked: saved } : current));
      toastSuccess(
        t(saved ? "editor.artwork.toast.lockedTitle" : "editor.artwork.toast.unlockedTitle"),
        t(saved ? "editor.artwork.toast.lockedBody" : "editor.artwork.toast.unlockedBody", {
          game: gameName,
        }),
      );
    } catch (lockError) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(lockError));
    } finally {
      setBusySlot(null);
    }
  };

  const applyOne = async (slot: ArtworkSlot) => {
    setBusySlot(slot);
    try {
      await artworkController.applySingleSlot(appId, savedSteamAppId, slot);
      toastSuccess(
        t("artwork.toast.appliedTitle"),
        t("editor.artwork.toast.slotAppliedBody", { slot: t(slotLabelKey(slot)), game: gameName }),
      );
      await loadState();
    } catch (applyError) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(applyError));
    } finally {
      setBusySlot(null);
    }
  };

  const clearOne = async (slot: ArtworkSlot) => {
    setBusySlot(slot);
    try {
      await artworkController.clearSingleSlot(appId, slot);
      toastSuccess(
        t("editor.artwork.toast.clearedTitle"),
        t("editor.artwork.toast.slotClearedBody", { slot: t(slotLabelKey(slot)), game: gameName }),
      );
      await loadState();
    } catch (clearError) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(clearError));
    } finally {
      setBusySlot(null);
    }
  };

  const runGameBulk = async (mode: "fill-missing" | "replace-all") => {
    setBusySlot("bulk");
    try {
      const result = await artworkController.applyForGame(appId, savedSteamAppId, mode, {
        ignoreLock: true,
      });
      if (result.applied > 0) {
        toastSuccess(
          t("artwork.toast.appliedTitle"),
          t("artwork.toast.appliedGameBody", { count: result.applied, game: gameName }),
        );
      } else if (result.failed > 0) {
        toastError(
          t("artwork.toast.failedTitle"),
          t("artwork.toast.bulkFailedBody", { failed: result.failed }),
        );
      } else {
        toastSuccess(t("artwork.toast.upToDateTitle"), t("artwork.toast.upToDateBody"));
      }
      await loadState();
    } catch (bulkError) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(bulkError));
    } finally {
      setBusySlot(null);
    }
  };

  const handleReplaceAll = () => {
    if (existingEnabledCount === 0) {
      void runGameBulk("replace-all");
      return;
    }
    showModal(
      <ConfirmModal
        strTitle={t("editor.artwork.replaceConfirm.title", { game: gameName })}
        strOKButtonText={t("qam.artwork.replaceAllAction")}
        strDescription={t("editor.artwork.replaceConfirm.body", {
          count: existingEnabledCount,
          game: gameName,
        })}
        onOK={() => void runGameBulk("replace-all")}
      />,
    );
  };

  return (
    <>
      <DialogControlsSection>
        <Field
          focusable={false}
          description={t("editor.artwork.immediateNotice")}
          bottomSeparator="standard"
        />
        <Field
          label={t("editor.artwork.matchedLabel")}
          description={t("matchPicker.appId", { appId: savedSteamAppId })}
          focusable={false}
          bottomSeparator="standard"
        >
          {savedSteamName || t("matchPicker.appId", { appId: savedSteamAppId })}
        </Field>
        <ToggleField
          label={t("editor.artwork.lockLabel")}
          description={t("editor.artwork.lockDescription")}
          checked={artworkState?.locked ?? false}
          disabled={busy || loading || !artworkState}
          onChange={(locked) => void toggleLock(locked)}
        />
        {error ? (
          <Field
            focusable={false}
            description={<span style={{ color: colors.error }}>{error}</span>}
            bottomSeparator="none"
          />
        ) : null}
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("editor.artwork.quickActionsHeading")}</DialogControlsSectionHeader>
        <ButtonItem
          layout="inline"
          label={t("qam.artwork.fillMissingLabel")}
          description={t("editor.artwork.fillMissingDescription", { missing: missingEnabledCount })}
          disabled={busy || loading || missingEnabledCount === 0}
          onClick={() => void runGameBulk("fill-missing")}
        >
          {busySlot === "bulk" ? t("qam.artwork.working") : t("qam.artwork.fillMissingAction")}
        </ButtonItem>
        <ButtonItem
          layout="inline"
          label={t("qam.artwork.replaceAllLabel")}
          description={t("editor.artwork.replaceAllDescription")}
          disabled={busy || loading || availableEnabledCount === 0}
          onClick={handleReplaceAll}
        >
          {t("qam.artwork.replaceAllAction")}
        </ButtonItem>
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.artwork.slotsHeading")}</DialogControlsSectionHeader>
        {loading && !artworkState ? (
          <Field
            focusable={false}
            description={t("editor.artwork.loading")}
            bottomSeparator="none"
          />
        ) : null}
        {slots
          ? ARTWORK_SLOT_ORDER.map((slot) => {
              const info = slots[slot];
              const statusText = info.present
                ? t("editor.artwork.statusPresent")
                : info.available
                  ? t("editor.artwork.statusMissing")
                  : t("editor.artwork.statusUnavailable");
              const statusColor = info.present
                ? colors.info
                : info.available
                  ? colors.warning
                  : colors.error;
              return (
                <Field
                  key={slot}
                  icon={
                    <div style={thumbPairStyle}>
                      <div style={thumbWellStyle}>
                        {info.preview_data_url ? (
                          <img src={info.preview_data_url} alt="" style={thumbImgStyle} />
                        ) : (
                          <span style={thumbPlaceholderStyle}>{t("editor.artwork.emptyThumb")}</span>
                        )}
                      </div>
                      <span style={thumbPlaceholderStyle}>→</span>
                      <div style={thumbWellStyle}>
                        {info.steam_url ? (
                          <img src={info.steam_url} alt="" style={thumbImgStyle} />
                        ) : (
                          <span style={thumbPlaceholderStyle}>{t("editor.artwork.naThumb")}</span>
                        )}
                      </div>
                    </div>
                  }
                  label={
                    <span>
                      {t(slotLabelKey(slot))}{" "}
                      <span style={{ color: statusColor, fontSize: 13 }}>{statusText}</span>
                    </span>
                  }
                  description={t(slotDimsKey(slot))}
                  bottomSeparator="standard"
                >
                  <div style={slotActionsStyle}>
                    <FocusableButton
                      className={editorFocusTargetClassName}
                      style={slotButtonStyle}
                      disabled={busy || !info.available}
                      onClick={() => void applyOne(slot)}
                    >
                      {busySlot === slot
                        ? t("qam.artwork.working")
                        : info.present
                          ? t("editor.artwork.replaceAction")
                          : t("editor.artwork.applyAction")}
                    </FocusableButton>
                    <FocusableButton
                      className={editorFocusTargetClassName}
                      style={slotButtonStyle}
                      disabled={busy || !info.present}
                      onClick={() => void clearOne(slot)}
                    >
                      {t("settings.action.clear")}
                    </FocusableButton>
                  </div>
                </Field>
              );
            })
          : null}
      </DialogControlsSection>
    </>
  );
}
