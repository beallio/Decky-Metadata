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
/// Set when the backend switched language before a panel could react to it.
let pendingRefresh = false;

/** Test hook: forget the cached sync so the next call talks to the backend. */
export const resetContentLocaleSync = (): void => {
  syncedLanguage = null;
  pendingRefresh = false;
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
    if (previous !== saved) pendingRefresh = true;
    return previous !== saved;
  } catch (error) {
    log.warn("i18n", "content language sync failed", error);
    return false;
  }
};

/**
 * Consume a language switch that happened before the caller could react (the
 * plugin boot sync runs before any panel exists).
 */
export const consumeContentLocaleChange = (): boolean => {
  const changed = pendingRefresh;
  pendingRefresh = false;
  return changed;
};
