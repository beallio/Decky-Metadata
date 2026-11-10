// Layout and appearance adapted from HLTB for Deck (MIT).
import { findClassModule, Focusable, Navigation } from "@decky/ui";
import type { CSSProperties } from "react";
import type { HltbSettings } from "./settings";

type HltbStatsProps = {
  stats: { main: number; plus: number; complete: number; all: number } | null;
  hltbId: number | null;
  settings: HltbSettings;
  launching: boolean;
};

// Steam's own Deck Compatibility "Details" button classes, and the game page's
// menu button classes (as on the ProtonDB button) for the "Clean" styles.
const detailsClasses: Record<string, string> = findClassModule((module) => module.DeckVerifiedInfo && module.Details) || {};
const menuButtonClasses: Record<string, string> = findClassModule((module) => module.MenuButton && module.ControllerConfigButton) || {};

const css = `
#decky-metadata-hltb { position: relative; }
.decky-metadata-hltb-info {
  background: rgb(14 20 27 / var(--hltb-bar-alpha, 0.25)); position: relative;
  border-bottom: var(--hltb-border-width, 2px) solid rgba(61,68,80,.54);
  padding: 5px 0; color: inherit; text-shadow: var(--hltb-text-shadow, none);
}
/* Sit on the bottom of the header instead of pushing the Play section down. */
.decky-metadata-hltb-default, .decky-metadata-hltb-clean-default { position: absolute; bottom: 0; left: 0; right: 0; z-index: 3; }
.decky-metadata-hltb-clean-default, .decky-metadata-hltb-clean { --hltb-bar-alpha: 0.5; position: absolute; z-index: 3; border: 0; }
.decky-metadata-hltb-clean-default { padding: 0; }
.decky-metadata-hltb-clean { top: -55vh; right: 2.8vw; width: fit-content; height: fit-content; }
.decky-metadata-hltb-clean-left { right: 0; left: 2.8vw; }
.decky-metadata-hltb-info ul { list-style: none; padding: 5px 35px; margin: 0; display: flex; justify-content: space-evenly; flex: 0 1 auto; }
.decky-metadata-hltb-clean ul { display: block; flex-direction: column; }
.decky-metadata-hltb-info li { text-align: center; }
.decky-metadata-hltb-info p { margin: 0; }
.decky-metadata-hltb-gametime { font-size: calc(16px * var(--hltb-text-scale, 1)); font-weight: bold; }
.decky-metadata-hltb-clean .decky-metadata-hltb-gametime { font-size: calc(20px * var(--hltb-text-scale, 1)); }
.decky-metadata-hltb-label { text-transform: uppercase; font-size: calc(10px * var(--hltb-text-scale, 1)); }
.decky-metadata-hltb-info li.decky-metadata-hltb-details-item { align-self: center; }
.decky-metadata-hltb-info .decky-metadata-hltb-details { background: transparent; padding: 0; margin: 0; gap: 0; justify-content: center; }
.decky-metadata-hltb-info .decky-metadata-hltb-menu-button { display: inline-flex; width: auto; height: 32px; margin: 0; padding: 0 12px; border-radius: var(--round-radius-size, 2px); font-size: 12px; font-weight: bold; text-transform: uppercase; text-shadow: none; }
.decky-metadata-hltb-clean li.decky-metadata-hltb-details-item { margin-top: 6px; }
`;

export function HltbStats({ stats, hltbId, settings, launching }: HltbStatsProps) {
  if (!stats || launching || Object.values(stats).every(value => value <= 0)) return null;
  const { appearance, style } = settings;
  const vars: Record<string, string> = {};
  if (appearance.custom) {
    vars["--hltb-bar-alpha"] = String(appearance.barAlpha / 100);
    if (appearance.textShadow) vars["--hltb-text-shadow"] = "0 1px 3px rgba(0, 0, 0, 0.9)";
    if (appearance.textScale !== 100) vars["--hltb-text-scale"] = String(appearance.textScale / 100);
    if (!appearance.border) vars["--hltb-border-width"] = "0";
  }
  const items = [
    [settings.showMain, stats.main, "Main Story"],
    [settings.showMainPlus, stats.plus, "Main + Extras"],
    [settings.showComplete, stats.complete, "Completionist"],
    [settings.showAllStyles, stats.all, "All Styles"],
  ] as const;
  const classes = ["decky-metadata-hltb-info", style === "default" ? "decky-metadata-hltb-default" : "", style === "clean-default" ? "decky-metadata-hltb-clean-default" : "", style === "clean" || style === "clean-left" ? "decky-metadata-hltb-clean" : "", style === "clean-left" ? "decky-metadata-hltb-clean-left" : ""].filter(Boolean).join(" ");
  const openDetails = () => Navigation.NavigateToExternalWeb(`https://howlongtobeat.com/game/${hltbId}`);
  return <div id="decky-metadata-hltb">
    <style>{css}</style>
    <div className={classes} style={vars as CSSProperties}>
      <ul>
        {items.map(([show, seconds, label]) => show && <li key={label}>
          <p className="decky-metadata-hltb-gametime">{seconds > 0 ? (seconds / 3600).toFixed(1) : "--"} hours</p>
          <p className="decky-metadata-hltb-label">{label}</p>
        </li>)}
        {hltbId && !settings.hideViewDetails ? <li className="decky-metadata-hltb-details-item">
          {style === "default"
            ? <Focusable className={`${detailsClasses.DeckVerifiedInfo ?? ""} decky-metadata-hltb-details`} focusClassName={detailsClasses.Focused}>
              <Focusable className={detailsClasses.Details} noFocusRing={false} onActivate={openDetails}>Details</Focusable>
            </Focusable>
            : <Focusable className={`${menuButtonClasses.MenuButton ?? ""} decky-metadata-hltb-menu-button`} onActivate={openDetails}>Details</Focusable>}
        </li> : null}
      </ul>
    </div>
  </div>;
}
