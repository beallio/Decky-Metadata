import { openFilePicker } from "@decky/api";
import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Focusable,
  showModal,
  ToggleField,
} from "@decky/ui";
import { artworkController } from "../../../artwork/controller";
import { translateBackendError, useT } from "../../../i18n";
import {
  ARTWORK_SLOT_ORDER,
  clearCustomLogoPosition,
  hasLogoPositionApi,
} from "../../../steam/customArtwork";
import { toastError, toastSuccess } from "../../../toast";
import { colors } from "../../../tokens";
import type { ArtworkSlot, GameArtworkState } from "../../../types";
import { artworkBrowserClass } from "./artworkStyles";
import { LogoPositionerModal } from "./LogoPositionerModal";

export type ArtworkManageTabProps = {
  appId: number;
  gameName: string;
  isSteamGame: boolean;
  savedSteamAppId: number | null;
  unsavedSteamAppId: number | null;
  state: GameArtworkState | null;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onRefreshState: () => Promise<void>;
  onSelectSlotTab: (slot: ArtworkSlot) => void;
  onGoToSteamMatch: () => void;
  onSaveMatch: () => void;
};

const slotLabelKey = (slot: ArtworkSlot): string => `qam.artwork.slot.${slot}.label`;

export function ArtworkManageTab({
  appId,
  gameName,
  isSteamGame,
  savedSteamAppId,
  unsavedSteamAppId,
  state,
  busy,
  onBusyChange,
  onRefreshState,
  onSelectSlotTab,
  onGoToSteamMatch,
  onSaveMatch,
}: ArtworkManageTabProps) {
  const t = useT();
  const hasUnsavedSteamMatch = !isSteamGame && unsavedSteamAppId !== savedSteamAppId;

  // Controller actions bump the snapshot revision, and the editor reloads slot state on that.
  const runAction = async (work: () => Promise<void>, successTitle?: string, successBody?: string) => {
    onBusyChange(true);
    try {
      await work();
      if (successTitle && successBody) toastSuccess(successTitle, successBody);
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      onBusyChange(false);
    }
  };

  const handleToggleLock = (locked: boolean) =>
    void runAction(async () => {
      await artworkController.setGameLocked(appId, locked);
    });

  const handleApplyOfficialSlot = (slot: ArtworkSlot) => {
    if (!savedSteamAppId) return;
    void runAction(
      () => artworkController.applySingleSlot(appId, savedSteamAppId, slot),
      t("artwork.toast.appliedTitle"),
      t("editor.artwork.appliedSlotBody", { slot: t(slotLabelKey(slot)), game: gameName }),
    );
  };

  const handleClearSlot = (slot: ArtworkSlot) =>
    void runAction(
      () => artworkController.clearSingleSlot(appId, slot),
      t("artwork.toast.clearedTitle"),
      t("editor.artwork.clearedSlotBody", { slot: t(slotLabelKey(slot)), game: gameName }),
    );

  const handleTransparentSlot = (slot: ArtworkSlot) =>
    void runAction(
      () => artworkController.applyTransparentSlot(appId, slot),
      t("artwork.toast.appliedTitle"),
      t("editor.artwork.appliedSlotBody", { slot: t(slotLabelKey(slot)), game: gameName }),
    );

  const handleLocalFile = async (slot: ArtworkSlot) => {
    try {
      const picker =
        typeof openFilePicker === "function"
          ? openFilePicker
          : (globalThis as { DeckyPluginLoader?: { openFilePicker?: typeof openFilePicker } })
              .DeckyPluginLoader?.openFilePicker;
      if (typeof picker !== "function") {
        toastError(t("artwork.toast.failedTitle"), t("editor.artwork.filePickerUnavailable"));
        return;
      }
      // FileSelectionType.FILE = 0
      const selected = await picker(
        0 as never,
        "/home/deck",
        true,
        false,
        undefined,
        ["png", "jpg", "jpeg", "webp", "ico"],
      );
      const chosenPath = selected?.realpath || selected?.path;
      if (!chosenPath) return;
      await runAction(
        () => artworkController.applyLocalFile(appId, slot, chosenPath),
        t("artwork.toast.appliedTitle"),
        t("editor.artwork.appliedSlotBody", { slot: t(slotLabelKey(slot)), game: gameName }),
      );
    } catch (error) {
      // User cancelling the file picker may reject without a backend error code.
      const msg = error instanceof Error ? error.message : String(error ?? "");
      if (msg && !/cancel/i.test(msg)) {
        toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
      }
    }
  };

  const handleOfficialBulk = (mode: "fill-missing" | "replace-all") => {
    if (!savedSteamAppId) return;
    const execute = () =>
      void runAction(async () => {
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
      });

    if (mode === "replace-all") {
      const existingCount = ARTWORK_SLOT_ORDER.filter((slot) => state?.slots[slot]?.present).length;
      showModal(
        <ConfirmModal
          strTitle={t("editor.artwork.replaceConfirm.title", { game: gameName })}
          strOKButtonText={t("editor.artwork.replaceAllAction")}
          strDescription={t("editor.artwork.replaceConfirm.body", {
            game: gameName,
            count: existingCount,
          })}
          onOK={execute}
        />,
      );
    } else {
      execute();
    }
  };

  const openLogoPositioner = () => {
    const heroSlot = state?.slots.hero;
    const logoSlot = state?.slots.logo;
    showModal(
      <LogoPositionerModal
        appId={appId}
        heroPreviewUrl={heroSlot?.preview_data_url || heroSlot?.steam_url || null}
        logoPreviewUrl={logoSlot?.preview_data_url || logoSlot?.steam_url || null}
        onSaved={() => void onRefreshState()}
      />,
    );
  };

  const handleResetLogoPosition = () =>
    void runAction(
      async () => {
        await clearCustomLogoPosition(appId);
        await onRefreshState();
      },
      t("artwork.toast.clearedTitle"),
      t("editor.artwork.logoPositionReset"),
    );

  return (
    <>
      {hasUnsavedSteamMatch ? (
        <DialogControlsSection>
          <ButtonItem
            layout="inline"
            label={t("editor.artwork.pendingMatchLabel")}
            description={t("editor.artwork.pendingMatchDescription")}
            disabled={busy}
            onClick={onSaveMatch}
          >
            {t("editor.artwork.saveMatchAction")}
          </ButtonItem>
        </DialogControlsSection>
      ) : null}

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("editor.artwork.manageControlsHeading")}</DialogControlsSectionHeader>
        <ToggleField
          label={t("editor.artwork.lockLabel")}
          description={t("editor.artwork.lockDescription")}
          checked={state?.locked ?? false}
          disabled={busy || !state}
          onChange={handleToggleLock}
        />
        {savedSteamAppId !== null ? (
          <>
            <ButtonItem
              layout="inline"
              label={t("editor.artwork.fillMissingLabel")}
              description={t("editor.artwork.fillMissingDescription", {
                missing: ARTWORK_SLOT_ORDER.filter(
                  (slot) => state?.slots[slot]?.available && !state?.slots[slot]?.present,
                ).length,
              })}
              disabled={busy}
              onClick={() => handleOfficialBulk("fill-missing")}
            >
              {t("editor.artwork.fillMissingAction")}
            </ButtonItem>
            <ButtonItem
              layout="inline"
              label={t("editor.artwork.replaceAllLabel")}
              description={t("editor.artwork.replaceAllDescription")}
              disabled={busy}
              onClick={() => handleOfficialBulk("replace-all")}
            >
              {t("editor.artwork.replaceAllAction")}
            </ButtonItem>
          </>
        ) : !isSteamGame ? (
          <ButtonItem
            layout="inline"
            label={t("editor.artwork.noMatchLabel")}
            description={t("editor.artwork.noMatchManageDescription")}
            disabled={busy}
            onClick={onGoToSteamMatch}
          >
            {t("editor.artwork.goToSteamMatchAction")}
          </ButtonItem>
        ) : null}
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("editor.artwork.slotsHeading")}</DialogControlsSectionHeader>
        <div className={`${artworkBrowserClass}__manage-grid`}>
          {ARTWORK_SLOT_ORDER.map((slot) => {
            const slotState = state?.slots[slot];
            // A Steam game with no custom file shows Steam's official art, so preview that.
            // A custom file without a preview (too large or unknown format) must not fall back to official art.
            const previewUrl =
              slotState?.preview_data_url ?? (isSteamGame && !slotState?.present ? slotState?.steam_url ?? null : null);
            const statusText = slotState?.present
              ? t("editor.artwork.statusPresent")
              : slotState?.available
                ? t("editor.artwork.statusAvailable")
                : t("editor.artwork.statusUnavailable");
            return (
              <div key={slot} className={`${artworkBrowserClass}__manage-row`}>
                <div className={`${artworkBrowserClass}__manage-thumb`}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="" />
                  ) : (
                    <span style={{ fontSize: 11, color: colors.textSecondary }}>
                      {t("editor.artwork.noCustomArt")}
                    </span>
                  )}
                </div>
                <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
                      {t(slotLabelKey(slot))}
                    </span>
                    <span style={{ fontSize: 12, color: colors.textSecondary }}>{statusText}</span>
                  </div>
                  <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__manage-actions`}>
                    <DialogButton
                      className={`${artworkBrowserClass}__action-btn`}
                      disabled={busy}
                      onClick={() => onSelectSlotTab(slot)}
                    >
                      {t("editor.artwork.browseAction")}
                    </DialogButton>
                    {savedSteamAppId !== null && slotState?.available ? (
                      <DialogButton
                        className={`${artworkBrowserClass}__action-btn`}
                        disabled={busy}
                        onClick={() => handleApplyOfficialSlot(slot)}
                      >
                        {t("editor.artwork.applyOfficialAction")}
                      </DialogButton>
                    ) : null}
                    <DialogButton
                      className={`${artworkBrowserClass}__action-btn`}
                      disabled={busy}
                      onClick={() => void handleLocalFile(slot)}
                    >
                      {t("editor.artwork.localFileAction")}
                    </DialogButton>
                    <DialogButton
                      className={`${artworkBrowserClass}__action-btn`}
                      disabled={busy}
                      onClick={() => handleTransparentSlot(slot)}
                    >
                      {t("editor.artwork.transparentAction")}
                    </DialogButton>
                    {slotState?.present ? (
                      <DialogButton
                        className={`${artworkBrowserClass}__action-btn`}
                        disabled={busy}
                        onClick={() => handleClearSlot(slot)}
                      >
                        {t("editor.artwork.clearAction")}
                      </DialogButton>
                    ) : null}
                  </Focusable>
                </div>
              </div>
            );
          })}
        </div>
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("editor.artwork.logoPositionHeading")}</DialogControlsSectionHeader>
        {hasLogoPositionApi() ? (
          <>
            <ButtonItem
              layout="inline"
              label={t("editor.artwork.adjustLogoPositionLabel")}
              description={t("editor.artwork.adjustLogoPositionDescription")}
              disabled={busy}
              onClick={openLogoPositioner}
            >
              {t("editor.artwork.adjustLogoPositionAction")}
            </ButtonItem>
            <ButtonItem
              layout="inline"
              label={t("editor.artwork.resetLogoPosition")}
              description={t("editor.artwork.resetLogoPositionDescription")}
              disabled={busy}
              onClick={handleResetLogoPosition}
            >
              {t("editor.artwork.resetLogoPositionAction")}
            </ButtonItem>
          </>
        ) : (
          <Field
            focusable={false}
            description={t("editor.artwork.logoPositionUnavailable")}
            bottomSeparator="none"
          />
        )}
      </DialogControlsSection>
    </>
  );
}
