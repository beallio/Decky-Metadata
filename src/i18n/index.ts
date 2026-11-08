/**
 * Plugin interface translations.
 *
 * The English catalog is the canonical source. Every other catalog must define
 * exactly the same keys; `src/i18n/i18n.test.ts` enforces that parity.
 *
 * Conventions:
 * - dot.notation, feature-prefixed (`qam.metadata.title`, `editor.save.action`);
 * - `{{name}}` placeholders, interpolated from the params object.
 */
import { useEffect, useState } from "react";

import { en } from "./catalog/en";
import { fr } from "./catalog/fr";
import {
  readBrowserLanguage,
  readSteamLanguage,
  resolveLocale,
  type Locale,
} from "./locales";

export type { Locale } from "./locales";
export { resolveLocale } from "./locales";

export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;

type Catalog = Record<string, string>;

const CATALOGS: Record<Locale, Catalog> = { en, fr };

let activeLocale: Locale = "en";
let activeCatalog: Catalog = en;
const listeners = new Set<() => void>();

const warnMissingKey = (key: string) => {
  try {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] missing translation key: ${key}`);
  } catch {
    /* Console may be unavailable on the Deck. */
  }
};

const lookup = (catalog: Catalog, key: string): string | undefined => catalog[key];

const interpolate = (template: string, params: MessageParams | undefined): string => {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
};

/**
 * Translate one key for the active locale.
 *
 * Missing locale entries fall back to English, and a key missing everywhere is
 * returned verbatim (and reported once) so the interface never renders blank.
 */
export const translate = (key: MessageKey, params?: MessageParams): string => {
  const message = lookup(activeCatalog, key) ?? lookup(en, key);
  if (message === undefined) {
    warnMissingKey(String(key));
    return String(key);
  }
  return interpolate(message, params);
};

/** Shorthand used across the interface. */
export const t = translate;

export const getLocale = (): Locale => activeLocale;

/** Switch the active locale. Returns true when the locale actually changed. */
export const setLocale = (locale: Locale): boolean => {
  if (locale === activeLocale) return false;
  activeLocale = locale;
  activeCatalog = CATALOGS[locale] ?? en;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* One subscriber must not block the others. */
    }
  }
  return true;
};

/** Resolve the locale from Steam, then the browser, and apply it. */
export const refreshLocale = (): Locale => {
  const language = readSteamLanguage() ?? readBrowserLanguage();
  const locale = resolveLocale(language);
  setLocale(locale);
  return locale;
};

export const subscribeLocale = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Re-render a React component when the locale changes, and re-check the Steam
 * language on mount so a language switch is picked up without a plugin reload.
 * Only top-level surfaces need this; children re-render through their parent.
 */
export const useLocale = (): Locale => {
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  useEffect(() => {
    const unsubscribe = subscribeLocale(() => setLocaleState(getLocale()));
    refreshLocale();
    return unsubscribe;
  }, []);
  return locale;
};
