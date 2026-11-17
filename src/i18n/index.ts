import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import arAA from "../locales/ar-AA.json";
import bgBG from "../locales/bg-BG.json";
import csCZ from "../locales/cs-CZ.json";
import deDE from "../locales/de-DE.json";
import elGR from "../locales/el-GR.json";
import enUS from "../locales/en-US.json";
import esES from "../locales/es-ES.json";
import fiFI from "../locales/fi-FI.json";
import frFR from "../locales/fr-FR.json";
import itIT from "../locales/it-IT.json";
import jaJP from "../locales/ja-JP.json";
import kaDZ from "../locales/ka-DZ.json";
import koKR from "../locales/ko-KR.json";
import nlNL from "../locales/nl-NL.json";
import plPL from "../locales/pl-PL.json";
import ptBR from "../locales/pt-BR.json";
import ptPT from "../locales/pt-PT.json";
import roRO from "../locales/ro-RO.json";
import ruRU from "../locales/ru-RU.json";
import sqAL from "../locales/sq-AL.json";
import svSE from "../locales/sv-SE.json";
import trTR from "../locales/tr-TR.json";
import ukUA from "../locales/uk-UA.json";
import zhCN from "../locales/zh-CN.json";
import zhTW from "../locales/zh-TW.json";
import { SUPPORTED_LOCALES, matchLocale, steamLanguageToLocale } from "./steamLanguage";

const FALLBACK_LOCALE = "en-US";

type ProgressMessage = {
  message?: string | null;
  message_code?: string | null;
  message_args?: Record<string, unknown> | null;
};

const resources = {
  "ar-AA": { translation: arAA },
  "bg-BG": { translation: bgBG },
  "cs-CZ": { translation: csCZ },
  "de-DE": { translation: deDE },
  "el-GR": { translation: elGR },
  "en-US": { translation: enUS },
  "es-ES": { translation: esES },
  "fi-FI": { translation: fiFI },
  "fr-FR": { translation: frFR },
  "it-IT": { translation: itIT },
  "ja-JP": { translation: jaJP },
  "ka-DZ": { translation: kaDZ },
  "ko-KR": { translation: koKR },
  "nl-NL": { translation: nlNL },
  "pl-PL": { translation: plPL },
  "pt-BR": { translation: ptBR },
  "pt-PT": { translation: ptPT },
  "ro-RO": { translation: roRO },
  "ru-RU": { translation: ruRU },
  "sq-AL": { translation: sqAL },
  "sv-SE": { translation: svSE },
  "tr-TR": { translation: trTR },
  "uk-UA": { translation: ukUA },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
};

export const i18n = i18next.createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: matchLocale(globalThis.navigator?.language) ?? FALLBACK_LOCALE,
  fallbackLng: FALLBACK_LOCALE,
  supportedLngs: SUPPORTED_LOCALES,
  load: "currentOnly",
  initAsync: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  react: { useSuspense: false },
});

// i18next's `t` overloads are key-aware; the plugin passes plain interpolation records.
const translate = i18n.t as unknown as (
  key: string,
  options?: Record<string, unknown>,
) => string;

/** Translation for non-React code; React components use `useT`. */
export const t = translate;

/** Subscribes the component to language changes; the bound `t` always reads the current language. */
export const useT = (): typeof t => {
  useTranslation();
  return t;
};

export const currentLocale = (): string => i18n.language || FALLBACK_LOCALE;

type SteamLanguageReader = () => unknown;

/** SteamClient only exists inside Gaming Mode, and its shape is not typed here. */
const steamLanguageReader = (): SteamLanguageReader | null => {
  const scope: unknown = globalThis;
  if (!scope || typeof scope !== "object" || !("SteamClient" in scope)) return null;
  const client = scope.SteamClient;
  if (!client || typeof client !== "object" || !("Settings" in client)) return null;
  const settings = client.Settings;
  if (!settings || typeof settings !== "object" || !("GetCurrentLanguage" in settings)) return null;
  const read = settings.GetCurrentLanguage;
  return typeof read === "function" ? () => read.call(settings) : null;
};

/** Exactly the values `SteamClient.Settings.GetCurrentLanguage()` returns; anything else means English. */
const STEAM_LANGUAGES: Record<string, true> = {
  english: true,
  german: true,
  french: true,
  italian: true,
  koreana: true,
  spanish: true,
  schinese: true,
  tchinese: true,
  russian: true,
  thai: true,
  japanese: true,
  portuguese: true,
  polish: true,
  danish: true,
  dutch: true,
  finnish: true,
  norwegian: true,
  swedish: true,
  hungarian: true,
  czech: true,
  romanian: true,
  turkish: true,
  brazilian: true,
  bulgarian: true,
  greek: true,
  ukrainian: true,
  latam: true,
  vietnamese: true,
  indonesian: true,
  malay: true,
};

/** The Steam client language for Steam-sourced text; never throws. */
export const currentSteamLanguage = async (): Promise<string> => {
  try {
    const readLanguage = steamLanguageReader();
    if (!readLanguage) return "english";
    const language = await readLanguage();
    return typeof language === "string" && STEAM_LANGUAGES[language] === true ? language : "english";
  } catch {
    return "english";
  }
};

/** Applies the language Steam is running in; never throws, keeps the current locale on failure. */
export const refreshLanguage = async (): Promise<string> => {
  const current = currentLocale();
  try {
    const readLanguage = steamLanguageReader();
    if (!readLanguage) return current;
    const language = await readLanguage();
    if (typeof language !== "string") return current;
    const locale = steamLanguageToLocale(language) ?? matchLocale(globalThis.navigator?.language) ?? FALLBACK_LOCALE;
    if (locale !== current) await i18n.changeLanguage(locale);
    return locale;
  } catch {
    return current;
  }
};

export const onLanguageChange = (listener: (locale: string) => void): (() => void) => {
  i18n.on("languageChanged", listener);
  return () => i18n.off("languageChanged", listener);
};

const ERROR_PREFIX = /^(?:\w*Error:\s*)+/;
const ERROR_CODE = /^[a-z][a-z0-9_]*$/;

export const translateBackendError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.replace(ERROR_PREFIX, "");
  return ERROR_CODE.test(text) && i18n.exists(`backend.${text}`) ? t(`backend.${text}`) : text;
};

export const translateProgress = (progress: ProgressMessage | null | undefined): string => {
  const code = progress?.message_code;
  if (code && i18n.exists(`backend.progress.${code}`)) {
    return t(`backend.progress.${code}`, progress?.message_args ?? undefined);
  }
  return progress?.message ?? "";
};

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(currentLocale(), options).format(value);

type DateFormatOptions = Intl.DateTimeFormatOptions & {
  dateStyle?: "full" | "long" | "medium" | "short";
  timeStyle?: "full" | "long" | "medium" | "short";
};

// dateStyle/timeStyle exist at runtime but not in this project's ES2020 Intl typings.
const DEFAULT_DATE_TIME: DateFormatOptions = { dateStyle: "short", timeStyle: "short" };
const DEFAULT_DATE: DateFormatOptions = { dateStyle: "medium" };

export const formatDateTime = (value: Date | number, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(currentLocale(), options ?? DEFAULT_DATE_TIME).format(value);

export const formatDate = (value: Date | number, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(currentLocale(), options ?? DEFAULT_DATE).format(value);

export const formatHours = (hours: number): string =>
  t("common.hours", {
    count: hours,
    value: formatNumber(hours, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  });

export const formatHoursShort = (hours: number): string =>
  t("common.hoursShort", {
    value: formatNumber(hours, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  });
