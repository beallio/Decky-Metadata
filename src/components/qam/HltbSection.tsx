// Controls adapted from HLTB for Deck (MIT).
import { ButtonItem, DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { FaClock } from "react-icons/fa";
import { DEFAULT_HLTB_SETTINGS } from "../../hltb/settings";
import type { HltbAppearance, HltbSettings } from "../../hltb/settings";
import { featureConflictNotice } from "../../pluginConflicts";
import type { FeatureConflict } from "../../pluginConflicts";
import { compactTextStyle, inlineStatusStyle } from "../../styles";
import { CollapsibleSection } from "./CollapsibleSection";

type HltbSectionProps = {
  initiallyExpanded?: boolean;
  settings: HltbSettings;
  settingsLoaded: boolean;
  busy: boolean;
  conflict: FeatureConflict;
  onSettingsChange: (settings: HltbSettings) => void | Promise<unknown>;
  onClearCache: () => void | Promise<unknown>;
};

const styles: Array<{ data: HltbSettings["style"]; label: string }> = [
  { data: "default", label: "Default" }, { data: "clean", label: '"Clean"' },
  { data: "clean-left", label: '"Clean" Left' }, { data: "clean-default", label: '"Clean" Default' },
];
const statControls = [
  ["showMain", "Toggle main stat", "Shows/Hides just the main stat"],
  ["showMainPlus", "Toggle main+ stat", "Shows/Hides just the main+ stat"],
  ["showComplete", "Toggle completionist stat", "Shows/Hides just the completionist stat"],
  ["showAllStyles", 'Toggle "all play styles" stat', "Shows/Hides just the all play styles stat"],
] as const;

export function HltbSection({ initiallyExpanded = false, settings, settingsLoaded, busy, conflict, onSettingsChange, onClearCache }: HltbSectionProps) {
  const controlsDisabled = !settingsLoaded || busy;
  const disabled = controlsDisabled || !settings.enabled;
  const appearance = settings.appearance;
  const notice = featureConflictNotice(conflict, "HLTB times", settings.enabled);
  const update = <K extends keyof HltbSettings>(key: K, value: HltbSettings[K]) => { void onSettingsChange({ ...settings, [key]: value }); };
  const updateAppearance = <K extends keyof HltbAppearance>(key: K, value: HltbAppearance[K]) => update("appearance", { ...appearance, [key]: value });
  return <CollapsibleSection title="HLTB times" icon={<FaClock size={16} />} defaultExpanded={initiallyExpanded}>
    <PanelSectionRow><ToggleField label="Show HowLongToBeat times" description="Show HowLongToBeat times on game pages for Steam and non-Steam games." checked={settings.enabled} disabled={controlsDisabled || (Boolean(conflict.pluginName) && !settings.enabled)} onChange={value => update("enabled", value)} /></PanelSectionRow>
    <PanelSectionRow><DropdownItem label="HLTB Style" description={'The "Clean" styles are intended to work with the CSS Loader Theme "Clean Gameview"'} rgOptions={styles} selectedOption={settings.style} disabled={disabled} onChange={option => update("style", option.data)} /></PanelSectionRow>
    <PanelSectionRow><ToggleField label={'Hide "View Details"'} description={'Hides "View Details" button on HLTB Stats'} checked={settings.hideViewDetails} disabled={disabled} onChange={value => update("hideViewDetails", value)} /></PanelSectionRow>
    {statControls.map(([key, label, description]) => <PanelSectionRow key={key}><ToggleField label={label} description={description} checked={settings[key]} disabled={disabled} onChange={value => update(key, value)} /></PanelSectionRow>)}
    <PanelSectionRow><ButtonItem layout="below" disabled={controlsDisabled} onClick={() => { void onClearCache(); }}>Clear HLTB cache</ButtonItem></PanelSectionRow>
    <PanelSectionRow><ToggleField label="Customize appearance" description="Enable custom colors, opacity and text size for the HLTB bar" checked={appearance.custom} disabled={disabled} onChange={value => updateAppearance("custom", value)} /></PanelSectionRow>
    {appearance.custom ? <>
      <PanelSectionRow><SliderField label="Background opacity" description="Darkens the bar so stats stay readable over bright hero art" value={appearance.barAlpha} min={0} max={100} step={5} showValue valueSuffix="%" resetValue={25} disabled={disabled} onChange={value => updateAppearance("barAlpha", value)} /></PanelSectionRow>
      <PanelSectionRow><DropdownItem label={'"View Details" color'} description={'Color of the "View Details" link'} rgOptions={[{ data: "steam", label: "Steam blue" }, { data: "text", label: "Match stats text" }]} selectedOption={appearance.linkColor} disabled={disabled} onChange={option => updateAppearance("linkColor", option.data as HltbAppearance["linkColor"])} /></PanelSectionRow>
      <PanelSectionRow><ToggleField label="Text shadow" description="Adds a shadow behind the stats for extra contrast" checked={appearance.textShadow} disabled={disabled} onChange={value => updateAppearance("textShadow", value)} /></PanelSectionRow>
      <PanelSectionRow><SliderField label="Text size" description="Scales the stat numbers and labels" value={appearance.textScale} min={75} max={150} step={5} showValue valueSuffix="%" resetValue={100} disabled={disabled} onChange={value => updateAppearance("textScale", value)} /></PanelSectionRow>
      {settings.style === "default" ? <PanelSectionRow><ToggleField label="Bottom border" description="Shows a divider line under the HLTB bar" checked={appearance.border} disabled={disabled} onChange={value => updateAppearance("border", value)} /></PanelSectionRow> : null}
      <PanelSectionRow><ButtonItem layout="below" disabled={disabled} onClick={() => update("appearance", { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true })}>Reset appearance</ButtonItem></PanelSectionRow>
    </> : null}
    <PanelSectionRow><Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
      {!settingsLoaded ? <div style={compactTextStyle}>Loading HLTB preferences…</div> : null}
      {notice ? <div style={inlineStatusStyle("warning")}>{notice}</div> : null}
    </Field></PanelSectionRow>
  </CollapsibleSection>;
}
