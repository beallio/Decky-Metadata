// Controls adapted from HLTB for Deck (MIT).
import { ButtonItem, DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { FaClock } from "react-icons/fa";
import { DEFAULT_HLTB_SETTINGS } from "../../hltb/settings";
import type { HltbAppearance, HltbSettings } from "../../hltb/settings";
import { t } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { featureConflictNotice } from "../../pluginConflicts";
import type { FeatureConflict } from "../../pluginConflicts";
import { ButtonLabel, compactTextStyle, inlineStatusStyle } from "../../styles";
import type { HltbSnapshot } from "../../hltb/controller";
import { CollapsibleSection } from "./CollapsibleSection";

type HltbSectionProps = {
  initiallyExpanded?: boolean;
  settings: HltbSettings;
  settingsLoaded: boolean;
  busy: boolean;
  conflict: FeatureConflict;
  settingsError?: string;
  cacheStatus?: HltbSnapshot["cacheStatus"];
  onSettingsChange: (settings: HltbSettings) => void | Promise<unknown>;
  onClearCache: () => void | Promise<unknown>;
  /** Native dropdowns remount QAM; these let the panel return focus to them. */
  onStyleChange?: (style: HltbSettings["style"]) => void | Promise<unknown>;
  onStyleMenuWillOpen?: () => void;
  onStyleControlRef?: (element: HTMLDivElement | null) => void;
};

const styles: Array<{ data: HltbSettings["style"]; labelKey: MessageKey }> = [
  { data: "default", labelKey: "qam.hltb.style.default" },
  { data: "clean", labelKey: "qam.hltb.style.clean" },
  { data: "clean-left", labelKey: "qam.hltb.style.cleanLeft" },
  { data: "clean-default", labelKey: "qam.hltb.style.cleanDefault" },
];
const statControls = [
  ["showMain", "qam.hltb.stat.main", "qam.hltb.stat.mainDesc"],
  ["showMainPlus", "qam.hltb.stat.mainPlus", "qam.hltb.stat.mainPlusDesc"],
  ["showComplete", "qam.hltb.stat.complete", "qam.hltb.stat.completeDesc"],
  ["showAllStyles", "qam.hltb.stat.allStyles", "qam.hltb.stat.allStylesDesc"],
] as const satisfies ReadonlyArray<readonly [keyof HltbSettings, MessageKey, MessageKey]>;
const cacheStatusText = {
  clearing: ["active", "qam.hltb.cacheClearing"],
  cleared: ["success", "qam.hltb.cacheCleared"],
  failed: ["error", "qam.hltb.cacheFailed"],
} as const;

export function HltbSection({
  initiallyExpanded = false, settings, settingsLoaded, busy, conflict, settingsError, cacheStatus = "idle", onSettingsChange, onClearCache,
  onStyleChange, onStyleMenuWillOpen, onStyleControlRef,
}: HltbSectionProps) {
  const controlsDisabled = !settingsLoaded || busy;
  const disabled = controlsDisabled || !settings.enabled;
  const appearance = settings.appearance;
  const notice = featureConflictNotice(conflict, t("qam.hltb.feature"), settings.enabled);
  const update = <K extends keyof HltbSettings>(key: K, value: HltbSettings[K]) => { void onSettingsChange({ ...settings, [key]: value }); };
  const updateAppearance = <K extends keyof HltbAppearance>(key: K, value: HltbAppearance[K]) => update("appearance", { ...appearance, [key]: value });
  return <CollapsibleSection title={t("qam.hltb.title")} icon={<FaClock size={16} />} defaultExpanded={initiallyExpanded}>
    <PanelSectionRow><ToggleField label={t("qam.hltb.enable")} description={t("qam.hltb.enableDesc")} checked={settings.enabled} disabled={controlsDisabled || (Boolean(conflict.pluginName) && !settings.enabled)} onChange={value => update("enabled", value)} /></PanelSectionRow>
    <PanelSectionRow><div ref={onStyleControlRef}><DropdownItem label={t("qam.hltb.style")} description={t("qam.hltb.styleDesc")} rgOptions={styles.map(style => ({ data: style.data, label: t(style.labelKey) }))} selectedOption={settings.style} disabled={disabled} onMenuWillOpen={onStyleMenuWillOpen} onChange={option => { void (onStyleChange ? onStyleChange(option.data) : update("style", option.data)); }} /></div></PanelSectionRow>
    <PanelSectionRow><ToggleField label={t("qam.hltb.hideViewDetails")} description={t("qam.hltb.hideViewDetailsDesc")} checked={settings.hideViewDetails} disabled={disabled} onChange={value => update("hideViewDetails", value)} /></PanelSectionRow>
    {statControls.map(([key, labelKey, descriptionKey]) => <PanelSectionRow key={key}><ToggleField label={t(labelKey)} description={t(descriptionKey)} checked={settings[key]} disabled={disabled} onChange={value => update(key, value)} /></PanelSectionRow>)}
    <PanelSectionRow>
      <ButtonItem layout="below" bottomSeparator="none" disabled={controlsDisabled || cacheStatus === "clearing"} onClick={() => { void onClearCache(); }}>
        {cacheStatus === "clearing" ? <ButtonLabel busy={true}>{t("common.clearing")}</ButtonLabel> : t("qam.hltb.clearCache")}
      </ButtonItem>
      {cacheStatus !== "idle" ? <div style={inlineStatusStyle(cacheStatusText[cacheStatus][0])}>{t(cacheStatusText[cacheStatus][1])}</div> : null}
    </PanelSectionRow>
    <PanelSectionRow><ToggleField label={t("qam.hltb.appearance")} description={t("qam.hltb.appearanceDesc")} checked={appearance.custom} disabled={disabled} onChange={value => updateAppearance("custom", value)} /></PanelSectionRow>
    {appearance.custom ? <>
      <PanelSectionRow><SliderField label={t("qam.hltb.opacity")} description={t("qam.hltb.opacityDesc")} value={appearance.barAlpha} min={0} max={100} step={5} showValue valueSuffix="%" resetValue={25} disabled={disabled} onChange={value => updateAppearance("barAlpha", value)} /></PanelSectionRow>
      <PanelSectionRow><ToggleField label={t("qam.hltb.textShadow")} description={t("qam.hltb.textShadowDesc")} checked={appearance.textShadow} disabled={disabled} onChange={value => updateAppearance("textShadow", value)} /></PanelSectionRow>
      <PanelSectionRow><SliderField label={t("qam.hltb.textSize")} description={t("qam.hltb.textSizeDesc")} value={appearance.textScale} min={75} max={150} step={5} showValue valueSuffix="%" resetValue={100} disabled={disabled} onChange={value => updateAppearance("textScale", value)} /></PanelSectionRow>
      {settings.style === "default" ? <PanelSectionRow><ToggleField label={t("qam.hltb.border")} description={t("qam.hltb.borderDesc")} checked={appearance.border} disabled={disabled} onChange={value => updateAppearance("border", value)} /></PanelSectionRow> : null}
      <PanelSectionRow><ButtonItem layout="below" disabled={disabled} onClick={() => update("appearance", { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true })}>{t("qam.hltb.resetAppearance")}</ButtonItem></PanelSectionRow>
    </> : null}
    <PanelSectionRow><Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
      {!settingsLoaded ? <div style={compactTextStyle}>{t("qam.hltb.loading")}</div> : null}
      {notice ? <div style={inlineStatusStyle("warning")}>{notice}</div> : null}
      {settingsError ? <div style={inlineStatusStyle("error")}>{settingsError}</div> : null}
    </Field></PanelSectionRow>
  </CollapsibleSection>;
}
