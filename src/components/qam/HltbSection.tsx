// Controls adapted from HLTB for Deck (MIT).
import { ButtonItem, DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { FaClock } from "react-icons/fa";
import { DEFAULT_HLTB_SETTINGS } from "../../hltb/settings";
import type { HltbAppearance, HltbSettings } from "../../hltb/settings";
import { useT } from "../../i18n";
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
  onBlurChange?: (blur: HltbAppearance["blur"]) => void | Promise<unknown>;
  onBlurMenuWillOpen?: () => void;
  onBlurControlRef?: (element: HTMLDivElement | null) => void;
};

export function HltbSection({
  initiallyExpanded = false, settings, settingsLoaded, busy, conflict, settingsError, cacheStatus = "idle", onSettingsChange, onClearCache,
  onStyleChange, onStyleMenuWillOpen, onStyleControlRef,
  onBlurChange, onBlurMenuWillOpen, onBlurControlRef,
}: HltbSectionProps) {
  const t = useT();
  const styles: Array<{ data: HltbSettings["style"]; label: string }> = [
    { data: "default", label: t("qam.hltb.styleDefault") }, { data: "clean", label: t("qam.hltb.styleClean") },
    { data: "clean-left", label: t("qam.hltb.styleCleanLeft") }, { data: "clean-default", label: t("qam.hltb.styleCleanDefault") },
  ];
  const blurOptions: Array<{ data: HltbAppearance["blur"]; label: string }> = [
    { data: "match", label: t("qam.hltb.blurMatchPlayBar") }, { data: "blur", label: t("qam.hltb.blurOn") }, { data: "none", label: t("qam.hltb.blurOff") },
  ];
  const statControls = [
    ["showMain", t("qam.hltb.mainStatLabel"), t("qam.hltb.mainStatDescription")],
    ["showMainPlus", t("qam.hltb.mainPlusStatLabel"), t("qam.hltb.mainPlusStatDescription")],
    ["showComplete", t("qam.hltb.completionistStatLabel"), t("qam.hltb.completionistStatDescription")],
    ["showAllStyles", t("qam.hltb.allStylesStatLabel"), t("qam.hltb.allStylesStatDescription")],
  ] as const;
  const cacheStatusText = {
    clearing: ["active", t("qam.hltb.cacheClearing")],
    cleared: ["success", t("qam.hltb.cacheCleared")],
    failed: ["error", t("qam.hltb.cacheFailed")],
  } as const;

  const controlsDisabled = !settingsLoaded || busy;
  const disabled = controlsDisabled || !settings.enabled;
  const appearance = settings.appearance;
  const notice = featureConflictNotice(conflict, t("qam.hltb.conflictFeature"), settings.enabled);
  const update = <K extends keyof HltbSettings>(key: K, value: HltbSettings[K]) => { void onSettingsChange({ ...settings, [key]: value }); };
  const updateAppearance = <K extends keyof HltbAppearance>(key: K, value: HltbAppearance[K]) => update("appearance", { ...appearance, [key]: value });
  return <CollapsibleSection title={t("qam.hltb.title")} icon={<FaClock size={16} />} defaultExpanded={initiallyExpanded}>
    <PanelSectionRow><ToggleField label={t("qam.hltb.showTimesLabel")} description={t("qam.hltb.showTimesDescription")} checked={settings.enabled} disabled={controlsDisabled || (Boolean(conflict.pluginName) && !settings.enabled)} onChange={value => update("enabled", value)} /></PanelSectionRow>
    <PanelSectionRow><ToggleField label={t("qam.hltb.storeLabel")} description={t("qam.hltb.storeDescription")} checked={settings.store} disabled={disabled} onChange={value => update("store", value)} /></PanelSectionRow>
    <PanelSectionRow><div ref={onStyleControlRef}><DropdownItem label={t("qam.hltb.styleLabel")} description={t("qam.hltb.styleDescription")} rgOptions={styles} selectedOption={settings.style} disabled={disabled} onMenuWillOpen={onStyleMenuWillOpen} onChange={option => { void (onStyleChange ? onStyleChange(option.data) : update("style", option.data)); }} /></div></PanelSectionRow>
    {settings.style === "default" || settings.style === "clean-default" ? <PanelSectionRow><ToggleField label={t("qam.hltb.pushPlayLabel")} description={t("qam.hltb.pushPlayDescription")} checked={settings.pushPlayDown} disabled={disabled} onChange={value => update("pushPlayDown", value)} /></PanelSectionRow> : null}
    {settings.style === "default" || settings.style === "clean-default" ? <PanelSectionRow><ToggleField label={t("qam.hltb.respectMenuBarLabel")} description={t("qam.hltb.respectMenuBarDescription")} checked={settings.respectMenuBar} disabled={disabled || !settings.pushPlayDown} onChange={value => update("respectMenuBar", value)} /></PanelSectionRow> : null}
    {settings.style === "default" ? null : <PanelSectionRow><div ref={onBlurControlRef}><DropdownItem label={t("qam.hltb.blurLabel")} description={t("qam.hltb.blurDescription")} rgOptions={blurOptions} selectedOption={appearance.blur} disabled={disabled} onMenuWillOpen={onBlurMenuWillOpen} onChange={option => { void (onBlurChange ? onBlurChange(option.data) : updateAppearance("blur", option.data)); }} /></div></PanelSectionRow>}
    <PanelSectionRow><ToggleField label={t("qam.hltb.hideDetailsLabel")} description={t("qam.hltb.hideDetailsDescription")} checked={settings.hideViewDetails} disabled={disabled} onChange={value => update("hideViewDetails", value)} /></PanelSectionRow>
    <PanelSectionRow><ToggleField label={t("qam.hltb.nativeCornersLabel")} description={t("qam.hltb.nativeCornersDescription")} checked={settings.nativeDetailsCorners} disabled={disabled} onChange={value => update("nativeDetailsCorners", value)} /></PanelSectionRow>
    {statControls.map(([key, label, description]) => <PanelSectionRow key={key}><ToggleField label={label} description={description} checked={settings[key]} disabled={disabled} onChange={value => update(key, value)} /></PanelSectionRow>)}
    <PanelSectionRow>
      <ButtonItem layout="below" bottomSeparator="none" disabled={controlsDisabled || cacheStatus === "clearing"} onClick={() => { void onClearCache(); }}>
        {cacheStatus === "clearing" ? <ButtonLabel busy={true}>{t("qam.hltb.clearingButton")}</ButtonLabel> : t("qam.hltb.clearCacheButton")}
      </ButtonItem>
      {cacheStatus !== "idle" ? <div style={inlineStatusStyle(cacheStatusText[cacheStatus][0])}>{cacheStatusText[cacheStatus][1]}</div> : null}
    </PanelSectionRow>
    <PanelSectionRow><ToggleField label={t("qam.hltb.customizeLabel")} description={t("qam.hltb.customizeDescription")} checked={appearance.custom} disabled={disabled} onChange={value => updateAppearance("custom", value)} /></PanelSectionRow>
    {appearance.custom ? <>
      {settings.style === "default" ? <PanelSectionRow><SliderField label={t("qam.hltb.opacityLabel")} description={t("qam.hltb.opacityDescription")} value={appearance.barAlpha} min={0} max={100} step={5} showValue valueSuffix="%" resetValue={25} disabled={disabled} onChange={value => updateAppearance("barAlpha", value)} /></PanelSectionRow> : null}
      <PanelSectionRow><ToggleField label={t("qam.hltb.textShadowLabel")} description={t("qam.hltb.textShadowDescription")} checked={appearance.textShadow} disabled={disabled} onChange={value => updateAppearance("textShadow", value)} /></PanelSectionRow>
      <PanelSectionRow><SliderField label={t("qam.hltb.textSizeLabel")} description={t("qam.hltb.textSizeDescription")} value={appearance.textScale} min={75} max={150} step={5} showValue valueSuffix="%" resetValue={100} disabled={disabled} onChange={value => updateAppearance("textScale", value)} /></PanelSectionRow>
      {settings.style === "default" ? <PanelSectionRow><ToggleField label={t("qam.hltb.bottomBorderLabel")} description={t("qam.hltb.bottomBorderDescription")} checked={appearance.border} disabled={disabled} onChange={value => updateAppearance("border", value)} /></PanelSectionRow> : null}
      <PanelSectionRow><ButtonItem layout="below" disabled={disabled} onClick={() => update("appearance", { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true })}>{t("qam.hltb.resetAppearance")}</ButtonItem></PanelSectionRow>
    </> : null}
    <PanelSectionRow><Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
      {!settingsLoaded ? <div style={compactTextStyle}>{t("qam.hltb.loadingPreferences")}</div> : null}
      {notice ? <div style={inlineStatusStyle("warning")}>{notice}</div> : null}
      {settingsError ? <div style={inlineStatusStyle("error")}>{settingsError}</div> : null}
    </Field></PanelSectionRow>
  </CollapsibleSection>;
}
