import type { ComponentProps, ComponentType } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  type ReorderableEntry,
  showModal,
  TextField,
  Toggle,
  ToggleField,
} from "@decky/ui";

import {
  ARTWORK_TAB_ORDER,
  defaultArtworkFilters,
  type ArtworkControllerSnapshot,
} from "../../artwork/controller";
import { currentLocale, useT } from "../../i18n";
import { ARTWORK_SLOT_ORDER } from "../../steam/customArtwork";
import { ButtonLabel, inlineStatusStyle } from "../../styles";
import type { ArtworkSettings, ArtworkSlot, ArtworkTabId } from "../../types";

// Visibility lives outside the list entries: Decky's list resets an unsaved order whenever
// `entries` changes, so toggling a tab mid-reorder must not touch them.
type TabVisibility = { hidden: ReadonlySet<ArtworkSlot>; disabled: boolean; toggle: (tab: ArtworkTabId) => void };
const TabVisibilityContext = createContext<TabVisibility>({ hidden: new Set(), disabled: true, toggle: () => undefined });

// Module-level so the list does not remount the toggles on every render. Decky's list toggles
// reorder mode on any click inside it, so the toggle's own clicks stop at this wrapper.
const TabVisibilityToggle = ({ entry }: { entry: ReorderableEntry<ArtworkTabId> }) => {
  const { hidden, disabled, toggle } = useContext(TabVisibilityContext);
  const tab = entry.data;
  if (!tab) return null;
  return (
    <div onClick={(evt) => evt.stopPropagation()}>
      <Toggle
        value={tab === "manage" || !hidden.has(tab)}
        disabled={disabled || tab === "manage"}
        onChange={() => toggle(tab)}
      />
    </div>
  );
};

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
  const visibleTabs = tabOrder.filter((tab) => tab === "manage" || !hiddenTabs.has(tab));
  const defaultTab = settings.defaultTab ?? "cover";

  const saveApiKey = () => {
    const next = apiKeyDraft.trim();
    if (controlsDisabled || next === (settings.sgdbApiKey ?? "").trim()) return;
    onSettingsChange((current) => ({ ...current, sgdbApiKey: next }));
  };
  // Leaving the page while the field still has focus unmounts it without a blur; save then too.
  const saveApiKeyRef = useRef(saveApiKey);
  saveApiKeyRef.current = saveApiKey;
  useEffect(() => () => saveApiKeyRef.current(), []);

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
        return { ...current, hiddenTabs: [...nextHidden] };
      }
      nextHidden.add(tab);
      // A hidden tab cannot stay the default; fall back to the first tab still shown.
      const order = current.tabOrder?.length ? current.tabOrder : [...ARTWORK_TAB_ORDER];
      const defaultTab = current.defaultTab === tab
        ? order.find((other) => other === "manage" || !nextHidden.has(other)) ?? "manage"
        : current.defaultTab;
      return { ...current, hiddenTabs: [...nextHidden], defaultTab };
    });
  };

  // ReorderableList resets its working order whenever `entries` changes identity, so the entries
  // depend on the saved order (plus language and enabled state), never on visibility.
  const tabEntries = useMemo<ReorderableEntry<ArtworkTabId>[]>(
    () => tabOrder.map((tab, position) => ({ label: t(tabLabelKey(tab)), position, data: tab })),
    [tabOrder.join(","), currentLocale(), controlsDisabled],
  );

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
          {/* Unmasked text field per user requirement; key is still redacted in logs/diagnostics. */}
          {/* Saves whatever the field holds when focus leaves it. */}
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}
          >
            <div style={{ flex: "1 1 auto" }}>
              <TextField
                value={apiKeyDraft}
                disabled={controlsDisabled}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                onBlur={saveApiKey}
              />
            </div>
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
        <DialogControlsSectionHeader>{t("qam.artwork.tabOrderLabel")}</DialogControlsSectionHeader>
        <DropdownItem
          label={t("qam.artwork.defaultTabLabel")}
          description={t("qam.artwork.defaultTabDescription")}
          disabled={controlsDisabled}
          selectedOption={visibleTabs.includes(defaultTab) ? defaultTab : visibleTabs[0]}
          rgOptions={visibleTabs.map((tab) => ({ data: tab, label: t(tabLabelKey(tab)) }))}
          onChange={(option) =>
            onSettingsChange((current) => ({
              ...current,
              defaultTab: option.data as ArtworkTabId,
            }))
          }
        />

        <Field
          description={t("qam.artwork.tabOrderDescription")}
          focusable={false}
          bottomSeparator="none"
        />
        <TabVisibilityContext.Provider value={{ hidden: hiddenTabs, disabled: controlsDisabled, toggle: toggleTabHidden }}>
          <ReorderableList<ArtworkTabId>
            entries={tabEntries}
            interactables={TabVisibilityToggle}
            onSave={(entries) => {
              const ordered = [...entries]
                .sort((a, b) => a.position - b.position)
                .map((entry) => entry.data)
                .filter((tab): tab is ArtworkTabId => Boolean(tab));
              // Before settings load, a save would write defaults over the stored settings.
              if (controlsDisabled || ordered.length === 0 || ordered.join(",") === tabOrder.join(",")) return;
              onSettingsChange((current) => ({ ...current, tabOrder: ordered }));
            }}
          />
        </TabVisibilityContext.Provider>
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
