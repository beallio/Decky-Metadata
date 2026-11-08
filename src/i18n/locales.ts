/**
 * Locale discovery for the plugin interface.
 *
 * Decky Loader's own i18next instance is not a supported plugin API, so the
 * plugin owns a small catalog bundle and follows the Steam language through the
 * documented `SteamClient.Settings.GetCurrentLanguage()` call.
 */

/** Locales with a bundled catalog. English is the canonical fallback. */
export type Locale = "en" | "fr";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "fr"];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * Steam language names mapped to a canonical locale. Steam reports languages
 * (not BCP-47 codes), so every advertised language must be listed explicitly.
 * Languages without a catalog resolve to English until one ships.
 */
const STEAM_LANGUAGES: Record<string, Locale> = {
  english: "en",
  french: "fr",
};

/** Resolve a Steam language name or BCP-47 tag to a bundled locale. */
export const resolveLocale = (language: string | null | undefined): Locale => {
  if (!language) return "en";
  const normalized = language.trim().toLowerCase();
  if (!normalized) return "en";
  const mapped = STEAM_LANGUAGES[normalized];
  if (mapped) return mapped;
  // Accept "fr", "fr-FR", "fr_CA" in case Steam or a test supplies a tag.
  const base = normalized.split(/[-_]/)[0];
  return isLocale(base) ? base : "en";
};

/** Read the active Steam language, if the Steam client exposes it. */
export const readSteamLanguage = (): string | null => {
  try {
    const steam = (globalThis as any)?.SteamClient;
    const value = steam?.Settings?.GetCurrentLanguage?.();
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
};

/** Read the browser language as a fallback before Steam answers. */
export const readBrowserLanguage = (): string | null => {
  try {
    const language = (globalThis as any)?.navigator?.language;
    return typeof language === "string" ? language : null;
  } catch {
    return null;
  }
};
