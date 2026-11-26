import type { ComponentProps, ComponentType } from "react";
import {
  ButtonItem,
  ConfirmModal,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  ProgressBarWithInfo,
  showModal,
  ToggleField,
} from "@decky/ui";

import type { ArtworkControllerSnapshot } from "../../artwork/controller";
import { useT } from "../../i18n";
import { ARTWORK_SLOT_ORDER } from "../../steam/customArtwork";
import { ButtonLabel, inlineStatusStyle } from "../../styles";
import type { ArtworkSettings, ArtworkSlot } from "../../types";

type ProgressBarWithInfoFieldProps = ComponentProps<typeof ProgressBarWithInfo> & {
  childrenLayout?: "inline" | "below";
};

const ProgressBarField = ProgressBarWithInfo as ComponentType<ProgressBarWithInfoFieldProps>;

type ArtworkBodyProps = {
  snapshot: ArtworkControllerSnapshot;
  listReady: boolean;
  onSettingsChange: (update: (current: ArtworkSettings) => ArtworkSettings) => void;
  onFillMissing: () => void;
  onReplaceAll: () => void;
};

const slotLabelKey = (slot: ArtworkSlot): string => `qam.artwork.slot.${slot}.label`;
const slotDescKey = (slot: ArtworkSlot): string => `qam.artwork.slot.${slot}.description`;

export function ArtworkBody({
  snapshot,
  listReady,
  onSettingsChange,
  onFillMissing,
  onReplaceAll,
}: ArtworkBodyProps) {
  const t = useT();
  const { settings, settingsLoaded, settingsError, summary, busy, progress, sgdbInstalled } = snapshot;
  const controlsDisabled = !settingsLoaded || busy;
  const enabledSlots = ARTWORK_SLOT_ORDER.filter((slot) => settings.slots[slot]);
  const bulkDisabled = !listReady || controlsDisabled || enabledSlots.length === 0 || summary.matched === 0;

  const confirmReplaceAll = () => {
    const unlockedCount = Math.max(0, summary.matched - summary.locked_games);
    const slotList = enabledSlots.map((slot) => t(slotLabelKey(slot))).join(", ");
    showModal(
      <ConfirmModal
        strTitle={t("qam.artwork.replaceConfirm.title")}
        strOKButtonText={t("qam.artwork.replaceAllAction")}
        strDescription={t("qam.artwork.replaceConfirm.body", {
          unlocked: unlockedCount,
          locked: summary.locked_games,
          slots: slotList,
          missing: summary.missing_slots,
          existing: summary.existing_enabled_slots,
        })}
        onOK={onReplaceAll}
      />,
    );
  };

  return (
    <>
      <DialogControlsSection>
        <Field label={t("qam.artwork.matchedGames")} focusable highlightOnFocus>
          {String(summary.matched)}
        </Field>
        <Field label={t("qam.artwork.completeArtwork")} focusable highlightOnFocus>
          {String(summary.complete)}
        </Field>
        <Field label={t("qam.artwork.missingGames")} focusable highlightOnFocus>
          {String(summary.missing_games)}
        </Field>
        {sgdbInstalled ? (
          <Field focusable={false} childrenLayout="below" padding="none">
            <div style={inlineStatusStyle("active")}>{t("qam.artwork.sgdbNotice")}</div>
          </Field>
        ) : null}
        {settingsError ? (
          <Field focusable={false} childrenLayout="below" padding="none">
            <div style={inlineStatusStyle("error")}>{settingsError}</div>
          </Field>
        ) : null}
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.artwork.automaticHeading")}</DialogControlsSectionHeader>
        <ToggleField
          label={t("qam.artwork.autoApplyLabel")}
          description={t("qam.artwork.autoApplyDescription")}
          checked={settings.autoApply}
          disabled={controlsDisabled}
          onChange={(autoApply) => onSettingsChange((current) => ({ ...current, autoApply }))}
        />
        <ToggleField
          label={t("qam.artwork.preserveExistingLabel")}
          description={
            settings.preserveExisting
              ? t("qam.artwork.preserveExistingOnDescription")
              : t("qam.artwork.preserveExistingOffDescription")
          }
          checked={settings.preserveExisting}
          disabled={controlsDisabled || !settings.autoApply}
          onChange={(preserveExisting) =>
            onSettingsChange((current) => ({ ...current, preserveExisting }))
          }
        />
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.artwork.slotsHeading")}</DialogControlsSectionHeader>
        {ARTWORK_SLOT_ORDER.map((slot) => (
          <ToggleField
            key={slot}
            label={t(slotLabelKey(slot))}
            description={t(slotDescKey(slot))}
            checked={settings.slots[slot]}
            disabled={controlsDisabled}
            onChange={(enabled) =>
              onSettingsChange((current) => ({
                ...current,
                slots: { ...current.slots, [slot]: enabled },
              }))
            }
          />
        ))}
        <Field
          focusable={false}
          description={t("qam.artwork.slotsScopeNote")}
          bottomSeparator="none"
        />
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.artwork.bulkHeading")}</DialogControlsSectionHeader>
        {busy && progress ? (
          <ProgressBarField
            nProgress={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}
            sOperationText={t("qam.artwork.progressStatus", {
              completed: progress.completed,
              total: progress.total,
              game: progress.current,
            })}
            childrenContainerWidth="max"
            childrenLayout="below"
            focusable={false}
          />
        ) : null}
        <ButtonItem
          layout="inline"
          label={t("qam.artwork.fillMissingLabel")}
          description={t("qam.artwork.fillMissingDescription", {
            missing: summary.missing_slots,
          })}
          disabled={bulkDisabled}
          onClick={onFillMissing}
        >
          {busy ? (
            <ButtonLabel busy={true}>{t("qam.artwork.working")}</ButtonLabel>
          ) : (
            t("qam.artwork.fillMissingAction")
          )}
        </ButtonItem>
        <ButtonItem
          layout="inline"
          label={t("qam.artwork.replaceAllLabel")}
          description={t("qam.artwork.replaceAllDescription")}
          disabled={bulkDisabled}
          onClick={confirmReplaceAll}
        >
          {t("qam.artwork.replaceAllAction")}
        </ButtonItem>
      </DialogControlsSection>
    </>
  );
}
