/** UI locales this plugin ships, primary fallback first. */
export const SUPPORTED_LOCALES = [
  "en-US",
  "ar-AA",
  "bg-BG",
  "cs-CZ",
  "de-DE",
  "el-GR",
  "es-ES",
  "fi-FI",
  "fr-FR",
  "it-IT",
  "ja-JP",
  "ka-DZ",
  "ko-KR",
  "nl-NL",
  "pl-PL",
  "pt-BR",
  "pt-PT",
  "ro-RO",
  "ru-RU",
  "sq-AL",
  "sv-SE",
  "tr-TR",
  "uk-UA",
  "zh-CN",
  "zh-TW",
] as const;

/** Steam's language names (the values behind `SteamClient.Settings`). */
const STEAM_LANGUAGES: Record<string, string> = {
  arabic: "ar-AA",
  brazilian: "pt-BR",
  bulgarian: "bg-BG",
  czech: "cs-CZ",
  dutch: "nl-NL",
  english: "en-US",
  finnish: "fi-FI",
  french: "fr-FR",
  german: "de-DE",
  greek: "el-GR",
  italian: "it-IT",
  japanese: "ja-JP",
  koreana: "ko-KR",
  latam: "es-ES",
  polish: "pl-PL",
  portuguese: "pt-PT",
  romanian: "ro-RO",
  russian: "ru-RU",
  schinese: "zh-CN",
  spanish: "es-ES",
  swedish: "sv-SE",
  tchinese: "zh-TW",
  turkish: "tr-TR",
  ukrainian: "uk-UA",
};

/** BCP-47 primary language to the locale we ship for it. */
const LANGUAGE_LOCALES: Record<string, string> = {
  ar: "ar-AA",
  bg: "bg-BG",
  cs: "cs-CZ",
  de: "de-DE",
  el: "el-GR",
  en: "en-US",
  es: "es-ES",
  fi: "fi-FI",
  fr: "fr-FR",
  it: "it-IT",
  ja: "ja-JP",
  ka: "ka-DZ",
  ko: "ko-KR",
  nl: "nl-NL",
  pl: "pl-PL",
  pt: "pt-PT",
  ro: "ro-RO",
  ru: "ru-RU",
  sq: "sq-AL",
  sv: "sv-SE",
  tr: "tr-TR",
  uk: "uk-UA",
  zh: "zh-CN",
};

export const steamLanguageToLocale = (name: string): string | null =>
  STEAM_LANGUAGES[name.trim().toLowerCase()] ?? null;

export const matchLocale = (tag: string | undefined | null): string | null => {
  const normalized = (tag ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return null;
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;
  if (
    normalized === "zh-hant" ||
    normalized.startsWith("zh-hant-") ||
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo"
  ) {
    return "zh-TW";
  }
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized === "pt-br") return "pt-BR";
  if (normalized.startsWith("pt")) return "pt-PT";
  if (normalized.startsWith("es")) return "es-ES";
  return LANGUAGE_LOCALES[normalized.split("-")[0]] ?? null;
};
