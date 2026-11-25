// Controls adapted from HLTB for Deck (MIT).
import { ButtonItem, DialogControlsSection, DropdownItem, Field, SliderField, ToggleField } from "@decky/ui";
import { DEFAULT_HLTB_SETTINGS } from "../../hltb/settings";
import type { HltbAppearance, HltbSettings } from "../../hltb/settings";
import { useT } from "../../i18n";
import { featureConflictNotice } from "../../pluginConflicts";
import type { FeatureConflict } from "../../pluginConflicts";
import { inlineStatusStyle } from "../../styles";
import type { HltbSnapshot } from "../../hltb/controller";

type HltbBodyProps = {
  settings: HltbSettings;
  settingsLoaded: boolean;
  conflict: FeatureConflict;
  settingsError?: string;
  cacheStatus?: HltbSnapshot["cacheStatus"];
  /** Applies to the latest published settings, so same-task changes do not overwrite each other. */
  onSettingsChange: (update: (current: HltbSettings) => HltbSettings) => void | Promise<unknown>;
  onClearCache: () => void | Promise<unknown>;
  onStyleChange?: (style: HltbSettings["style"]) => void | Promise<unknown>;
  onBlurChange?: (blur: HltbAppearance["blur"]) => void | Promise<unknown>;
};

export function HltbBody({
  settings, settingsLoaded, conflict, settingsError, cacheStatus = "idle", onSettingsChange, onClearCache,
  onStyleChange, onBlurChange,
}: HltbBodyProps) {
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

  const controlsDisabled = !settingsLoaded;
  const disabled = controlsDisabled || !settings.enabled;
  const appearance = settings.appearance;
  const notice = featureConflictNotice(conflict, t("qam.hltb.conflictFeature"), settings.enabled);
  const update = <K extends keyof HltbSettings>(key: K, value: HltbSettings[K]) => { void onSettingsChange(current => ({ ...current, [key]: value })); };
  const updateAppearance = <K extends keyof HltbAppearance>(key: K, value: HltbAppearance[K]) => {
    void onSettingsChange(current => ({ ...current, appearance: { ...current.appearance, [key]: value } }));
  };
  return <DialogControlsSection>
    <ToggleField label={t("qam.hltb.showTimesLabel")} description={t("qam.hltb.showTimesDescription")} checked={settings.enabled} disabled={controlsDisabled || (Boolean(conflict.pluginName) && !settings.enabled)} onChange={value => update("enabled", value)} />
    <ToggleField label={t("qam.hltb.storeLabel")} description={t("qam.hltb.storeDescription")} checked={settings.store} disabled={disabled} onChange={value => update("store", value)} />
    <DropdownItem label={t("qam.hltb.styleLabel")} description={t("qam.hltb.styleDescription")} rgOptions={styles} selectedOption={settings.style} disabled={disabled} onChange={option => { void (onStyleChange ? onStyleChange(option.data) : update("style", option.data)); }} />
    {settings.style === "default" || settings.style === "clean-default" ? <ToggleField label={t("qam.hltb.pushPlayLabel")} description={t("qam.hltb.pushPlayDescription")} checked={settings.pushPlayDown} disabled={disabled} onChange={value => update("pushPlayDown", value)} /> : null}
    {settings.style === "default" || settings.style === "clean-default" ? <ToggleField label={t("qam.hltb.respectMenuBarLabel")} description={t("qam.hltb.respectMenuBarDescription")} checked={settings.respectMenuBar} disabled={disabled || !settings.pushPlayDown} onChange={value => update("respectMenuBar", value)} /> : null}
    {settings.style === "default" ? null : <DropdownItem label={t("qam.hltb.blurLabel")} description={t("qam.hltb.blurDescription")} rgOptions={blurOptions} selectedOption={appearance.blur} disabled={disabled} onChange={option => { void (onBlurChange ? onBlurChange(option.data) : updateAppearance("blur", option.data)); }} />}
    <ToggleField label={t("qam.hltb.hideDetailsLabel")} description={t("qam.hltb.hideDetailsDescription")} checked={settings.hideViewDetails} disabled={disabled} onChange={value => update("hideViewDetails", value)} />
    <ToggleField label={t("qam.hltb.nativeCornersLabel")} description={t("qam.hltb.nativeCornersDescription")} checked={settings.nativeDetailsCorners} disabled={disabled} onChange={value => update("nativeDetailsCorners", value)} />
    {statControls.map(([key, label, description]) => <ToggleField key={key} label={label} description={description} checked={settings[key]} disabled={disabled} onChange={value => update(key, value)} />)}
    <ButtonItem layout="inline" label={t("qam.hltb.clearCacheButton")} disabled={controlsDisabled || cacheStatus === "clearing"} onClick={() => { void onClearCache(); }}>
      {t("settings.action.clear")}
    </ButtonItem>
    {cacheStatus !== "idle" ? <Field focusable={false} childrenLayout="below"><div style={inlineStatusStyle(cacheStatusText[cacheStatus][0])}>{cacheStatusText[cacheStatus][1]}</div></Field> : null}
    <ToggleField label={t("qam.hltb.customizeLabel")} description={t("qam.hltb.customizeDescription")} checked={appearance.custom} disabled={disabled} onChange={value => updateAppearance("custom", value)} />
    {appearance.custom ? <>
      {settings.style === "default" ? <SliderField label={t("qam.hltb.opacityLabel")} description={t("qam.hltb.opacityDescription")} value={appearance.barAlpha} min={0} max={100} step={5} showValue valueSuffix="%" resetValue={25} disabled={disabled} onChange={value => updateAppearance("barAlpha", value)} /> : null}
      <ToggleField label={t("qam.hltb.textShadowLabel")} description={t("qam.hltb.textShadowDescription")} checked={appearance.textShadow} disabled={disabled} onChange={value => updateAppearance("textShadow", value)} />
      <SliderField label={t("qam.hltb.textSizeLabel")} description={t("qam.hltb.textSizeDescription")} value={appearance.textScale} min={75} max={150} step={5} showValue valueSuffix="%" resetValue={100} disabled={disabled} onChange={value => updateAppearance("textScale", value)} />
      {settings.style === "default" ? <ToggleField label={t("qam.hltb.bottomBorderLabel")} description={t("qam.hltb.bottomBorderDescription")} checked={appearance.border} disabled={disabled} onChange={value => updateAppearance("border", value)} /> : null}
      <ButtonItem layout="inline" label={t("qam.hltb.customizeLabel")} description={t("qam.hltb.customizeDescription")} disabled={disabled} onClick={() => update("appearance", { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true })}>{t("qam.hltb.resetAppearance")}</ButtonItem>
    </> : null}
    {!settingsLoaded || notice || settingsError ? <Field focusable={false} childrenLayout="below">
      {!settingsLoaded ? <div>{t("qam.hltb.loadingPreferences")}</div> : null}
      {notice ? <div style={inlineStatusStyle("warning")}>{notice}</div> : null}
      {settingsError ? <div style={inlineStatusStyle("error")}>{settingsError}</div> : null}
    </Field> : null}
  </DialogControlsSection>;
}

