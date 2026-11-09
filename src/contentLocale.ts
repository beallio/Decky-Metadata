/**
 * Keeps the backend's metadata language in sync with Steam.
 *
 * Provider requests use one content language at a time (Steam store requests
 * take `l=<language>`). Records are stamped with the language they were fetched
 * in, and a record from another language counts as missing, so switching the
 * Steam language makes the next refresh repopulate it.
 */
import { getContentLocale, setContentLocale } from "./backend";
import { currentSteamLanguage } from "./steamLanguage";
import * as log from "./log";

let syncedLanguage: string | null = null;

/** Test hook: forget the cached sync so the next call talks to the backend. */
export const resetContentLocaleSync = (): void => {
  syncedLanguage = null;
};

/**
 * Push Steam's language to the backend.
 *
 * @returns true when the backend content language actually changed, which means
 *          stored metadata belongs to the previous language.
 */
export const syncContentLocale = async (): Promise<boolean> => {
  const language = currentSteamLanguage();
  if (language === syncedLanguage) return false;
  try {
    const previous = (await getContentLocale()).content_locale;
    const saved = (await setContentLocale(language)).content_locale;
    syncedLanguage = saved;
    return previous !== saved;
  } catch (error) {
    log.warn("i18n", "content language sync failed", error);
    return false;
  }
};
