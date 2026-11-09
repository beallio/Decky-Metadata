/**
 * Steam interface language, as reported by the Steam client.
 *
 * Provider requests take Steam's own language names (`l=french`), so the raw
 * language name is what the backend needs; the plugin's UI catalogs use a
 * smaller locale set and resolve separately.
 */

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

/**
 * Steam language for provider requests, falling back to the host language and
 * then English. The backend normalizes Steam names and BCP-47 tags.
 */
export const currentSteamLanguage = (): string =>
  readSteamLanguage() ?? readBrowserLanguage() ?? "english";
