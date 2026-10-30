// Appearance adapted from HLTB for Deck (MIT).
export type HltbAppearance = {
  custom: boolean;
  barAlpha: number;
  linkColor: "steam" | "text";
  textShadow: boolean;
  textScale: number;
  border: boolean;
};

export type HltbSettings = {
  enabled: boolean;
  style: "default" | "clean" | "clean-left" | "clean-default";
  hideViewDetails: boolean;
  showMain: boolean;
  showMainPlus: boolean;
  showComplete: boolean;
  showAllStyles: boolean;
  appearance: HltbAppearance;
  hiddenAppIds: number[];
};

export const DEFAULT_HLTB_SETTINGS: HltbSettings = {
  enabled: false, style: "default", hideViewDetails: false,
  showMain: true, showMainPlus: true, showComplete: true, showAllStyles: true,
  appearance: { custom: false, barAlpha: 25, linkColor: "steam", textShadow: false, textScale: 100, border: true },
  hiddenAppIds: [],
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const stepped = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value)) / 5) * 5 : fallback;

export function normalizeHltbSettings(value: unknown): HltbSettings {
  const stored = object(value);
  const appearance = object(stored.appearance);
  const defaults = DEFAULT_HLTB_SETTINGS;
  const defaultAppearance = defaults.appearance;
  const style = stored.style === "default" || stored.style === "clean" || stored.style === "clean-left" || stored.style === "clean-default"
    ? stored.style : defaults.style;
  const ids = Array.isArray(stored.hiddenAppIds) ? stored.hiddenAppIds : [];
  return {
    enabled: bool(stored.enabled, defaults.enabled), style,
    hideViewDetails: bool(stored.hideViewDetails, defaults.hideViewDetails),
    showMain: bool(stored.showMain, defaults.showMain),
    showMainPlus: bool(stored.showMainPlus, defaults.showMainPlus),
    showComplete: bool(stored.showComplete, defaults.showComplete),
    showAllStyles: bool(stored.showAllStyles, defaults.showAllStyles),
    appearance: {
      custom: bool(appearance.custom, defaultAppearance.custom),
      barAlpha: stepped(appearance.barAlpha, 0, 100, defaultAppearance.barAlpha),
      linkColor: appearance.linkColor === "steam" || appearance.linkColor === "text" ? appearance.linkColor : defaultAppearance.linkColor,
      textShadow: bool(appearance.textShadow, defaultAppearance.textShadow),
      textScale: stepped(appearance.textScale, 75, 150, defaultAppearance.textScale),
      border: bool(appearance.border, defaultAppearance.border),
    },
    hiddenAppIds: [...new Set(ids.filter((id): id is number =>
      typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 0xffffffff))].slice(0, 5000),
  };
}
