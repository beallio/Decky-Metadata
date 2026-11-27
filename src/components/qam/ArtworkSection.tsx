import type { ComponentProps, ComponentType } from "react";
import { useEffect, useState } from "react";
import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  DropdownItem,
  Field,
  Focusable,
  ProgressBarWithInfo,
  ReorderableList,
  showModal,
  TextField,
  ToggleField,
} from "@decky/ui";

import {
  ARTWORK_TAB_ORDER,
  defaultArtworkFilters,
  type ArtworkControllerSnapshot,
} from "../../artwork/controller";
import { useT } from "../../i18n";
import { ARTWORK_SLOT_ORDER } from "../../steam/customArtwork";
import { ButtonLabel, inlineStatusStyle } from "../../styles";
import type { ArtworkSettings, ArtworkSlot, ArtworkTabId } from "../../types";

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
const tabLabelKey = (tab: ArtworkTabId): string =>
  tab === "manage" ? "editor.artwork.tab.manage" : slotLabelKey(tab);

export function ArtworkBody({
  snapshot,
  listReady,
  onSettingsChange,
  onFillMissing,
  onReplaceAll,
}: ArtworkBodyProps) {
  const t = useT();
  const {
    settings,
    settingsLoaded,
    settingsError,
    sgdbKeyStatus,
    summary,
    busy,
    progress,
    sgdbInstalled,
  } = snapshot;
  const controlsDisabled = !settingsLoaded || busy;
  const enabledSlots = ARTWORK_SLOT_ORDER.filter((slot) => settings.slots[slot]);
  const bulkDisabled = !listReady || controlsDisabled || enabledSlots.length === 0 || summary.matched === 0;
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.sgdbApiKey ?? "");

  useEffect(() => {
    setApiKeyDraft(settings.sgdbApiKey ?? "");
  }, [settings.sgdbApiKey]);

  const tabOrder = settings.tabOrder?.length ? settings.tabOrder : [...ARTWORK_TAB_ORDER];
  const hiddenTabs = new Set<ArtworkSlot>(settings.hiddenTabs ?? []);
  const keyDirty = apiKeyDraft.trim() !== (settings.sgdbApiKey ?? "").trim();

  const keyStatusMessage = sgdbKeyStatus?.hasUserKey
    ? t("qam.artwork.sgdbKeyStatusUser")
    : sgdbKeyStatus?.hasBuiltInKey
      ? t("qam.artwork.sgdbKeyStatusBuiltIn")
      : t("qam.artwork.sgdbKeyStatusMissing");

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

  const toggleTabHidden = (tab: ArtworkTabId) => {
    if (tab === "manage") return;
    onSettingsChange((current) => {
      const nextHidden = new Set(current.hiddenTabs ?? []);
      if (nextHidden.has(tab)) {
        nextHidden.delete(tab);
      } else {
        nextHidden.add(tab);
      }
      return { ...current, hiddenTabs: [...nextHidden] };
    });
  };

  const TabVisibilityControl = ({ entry }: { entry: { data?: ArtworkTabId } }) => {
    const tab = entry.data;
    if (!tab || tab === "manage") return null;
    const isHidden = hiddenTabs.has(tab);
    return (
      <DialogButton
        style={{ minWidth: 0, width: "auto", padding: "4px 10px", fontSize: 12 }}
        disabled={controlsDisabled}
        onClick={() => toggleTabHidden(tab)}
      >
        {isHidden ? t("qam.artwork.showTabAction") : t("qam.artwork.hideTabAction")}
      </DialogButton>
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
        <DialogControlsSectionHeader>{t("qam.artwork.browserHeading")}</DialogControlsSectionHeader>
        <Field
          label={t("qam.artwork.sgdbApiKeyLabel")}
          description={t("qam.artwork.sgdbApiKeyDescription")}
          childrenLayout="below"
          childrenContainerWidth="max"
        >
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}
          >
            <div style={{ flex: "1 1 auto" }}>
              {/* Unmasked text field per user requirement; key is still redacted in logs/diagnostics. */}
              <TextField
                value={apiKeyDraft}
                disabled={controlsDisabled}
                onChange={(e) => setApiKeyDraft(e.target.value)}
              />
            </div>
            <DialogButton
              style={{ minWidth: 0, width: "auto", padding: "6px 12px" }}
              disabled={controlsDisabled || !keyDirty}
              onClick={() =>
                onSettingsChange((current) => ({
                  ...current,
                  sgdbApiKey: apiKeyDraft.trim(),
                }))
              }
            >
              {t("qam.artwork.saveApiKeyAction")}
            </DialogButton>
            {settings.sgdbApiKey ? (
              <DialogButton
                style={{ minWidth: 0, width: "auto", padding: "6px 12px" }}
                disabled={controlsDisabled}
                onClick={() => {
                  setApiKeyDraft("");
                  onSettingsChange((current) => ({ ...current, sgdbApiKey: "" }));
                }}
              >
                {t("qam.artwork.clearApiKeyAction")}
              </DialogButton>
            ) : null}
          </Focusable>
        </Field>
        <Field
          focusable={false}
          description={keyStatusMessage}
          bottomSeparator="standard"
        />

        <DropdownItem
          label={t("qam.artwork.defaultTabLabel")}
          description={t("qam.artwork.defaultTabDescription")}
          disabled={controlsDisabled}
          selectedOption={settings.defaultTab ?? "cover"}
          rgOptions={tabOrder
            .filter((tab) => tab === "manage" || !hiddenTabs.has(tab))
            .map((tab) => ({ data: tab, label: t(tabLabelKey(tab)) }))}
          onChange={(option) =>
            onSettingsChange((current) => ({
              ...current,
              defaultTab: option.data as ArtworkTabId,
            }))
          }
        />

        <Field
          label={t("qam.artwork.tabOrderLabel")}
          description={t("qam.artwork.tabOrderDescription")}
          childrenLayout="below"
          childrenContainerWidth="max"
        >
          <ReorderableList<ArtworkTabId>
            entries={tabOrder.map((tab, index) => ({
              label:
                tab !== "manage" && hiddenTabs.has(tab)
                  ? `${t(tabLabelKey(tab))} (${t("qam.artwork.hiddenTag")})`
                  : t(tabLabelKey(tab)),
              data: tab,
              position: index,
            }))}
            interactables={TabVisibilityControl}
            onSave={(entries) => {
              const ordered = [...entries]
                .sort((a, b) => a.position - b.position)
                .map((entry) => entry.data)
                .filter((tab): tab is ArtworkTabId => Boolean(tab));
              if (ordered.length > 0) {
                onSettingsChange((current) => ({ ...current, tabOrder: ordered }));
              }
            }}
          />
        </Field>

        <ButtonItem
          layout="inline"
          label={t("qam.artwork.resetFiltersLabel")}
          description={t("qam.artwork.resetFiltersDescription")}
          disabled={controlsDisabled}
          onClick={() =>
            onSettingsChange((current) => ({
              ...current,
              filters: defaultArtworkFilters(),
            }))
          }
        >
          {t("qam.artwork.resetFiltersAction")}
        </ButtonItem>
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
