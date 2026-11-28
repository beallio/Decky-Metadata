import { afterEach, describe, expect, it } from "vitest";
import {
  currentLocale,
  currentSteamLanguage,
  formatHours,
  i18n,
  refreshLanguage,
  translateBackendError,
  translateProgress,
} from "./index";
import { matchLocale, steamLanguageToLocale } from "./steamLanguage";

const stubSteamLanguage = (read: () => unknown): void => {
  Object.defineProperty(globalThis, "SteamClient", {
    configurable: true,
    value: { Settings: { GetCurrentLanguage: read } },
  });
};

afterEach(async () => {
  Reflect.deleteProperty(globalThis, "SteamClient");
  await i18n.changeLanguage("en-US");
});

describe("Steam language mapping", () => {
  it("maps Steam language names", () => {
    expect(steamLanguageToLocale("german")).toBe("de-DE");
    expect(steamLanguageToLocale("schinese")).toBe("zh-CN");
    expect(steamLanguageToLocale("tchinese")).toBe("zh-TW");
    expect(steamLanguageToLocale("latam")).toBe("es-ES");
    expect(steamLanguageToLocale("danish")).toBeNull();
  });

  it("matches BCP-47 tags", () => {
    expect(matchLocale("zh-Hant-TW")).toBe("zh-TW");
    expect(matchLocale("pt-BR")).toBe("pt-BR");
    expect(matchLocale("pt")).toBe("pt-PT");
    expect(matchLocale("ka")).toBe("ka-DZ");
    expect(matchLocale("sq-AL")).toBe("sq-AL");
    expect(matchLocale(undefined)).toBeNull();
  });
});

describe("refreshLanguage", () => {
  it("switches to the locale Steam reports", async () => {
    stubSteamLanguage(() => "german");
    await expect(refreshLanguage()).resolves.toBe("de-DE");
    expect(currentLocale()).toBe("de-DE");
  });

  it("keeps the current locale when Steam rejects", async () => {
    stubSteamLanguage(() => Promise.reject(new Error("Steam unavailable")));
    await expect(refreshLanguage()).resolves.toBe("en-US");
    expect(currentLocale()).toBe("en-US");
  });

  it("falls back to the navigator locale for an unknown language", async () => {
    stubSteamLanguage(() => "german");
    await refreshLanguage();
    stubSteamLanguage(() => "danish");
    await expect(refreshLanguage()).resolves.toBe("en-US");
    expect(currentLocale()).toBe("en-US");
  });
});

describe("currentSteamLanguage", () => {
  const STEAM_LANGUAGES = [
    "english",
    "german",
    "french",
    "italian",
    "koreana",
    "spanish",
    "schinese",
    "tchinese",
    "russian",
    "thai",
    "japanese",
    "portuguese",
    "polish",
    "danish",
    "dutch",
    "finnish",
    "norwegian",
    "swedish",
    "hungarian",
    "czech",
    "romanian",
    "turkish",
    "brazilian",
    "bulgarian",
    "greek",
    "ukrainian",
    "latam",
    "vietnamese",
    "indonesian",
    "malay",
  ];

  it.each(STEAM_LANGUAGES)("returns the valid Steam language %s raw", async (language) => {
    stubSteamLanguage(() => language);
    await expect(currentSteamLanguage()).resolves.toBe(language);
  });

  it("accepts the language as a plain value or a Promise", async () => {
    stubSteamLanguage(() => "french");
    await expect(currentSteamLanguage()).resolves.toBe("french");
    stubSteamLanguage(() => Promise.resolve("latam"));
    await expect(currentSteamLanguage()).resolves.toBe("latam");
  });

  it("returns English for unknown or non-string values", async () => {
    stubSteamLanguage(() => "arabic");
    await expect(currentSteamLanguage()).resolves.toBe("english");
    stubSteamLanguage(() => "English");
    await expect(currentSteamLanguage()).resolves.toBe("english");
    stubSteamLanguage(() => 42);
    await expect(currentSteamLanguage()).resolves.toBe("english");
    stubSteamLanguage(() => null);
    await expect(currentSteamLanguage()).resolves.toBe("english");
  });

  it("returns English when Steam is missing or throws", async () => {
    await expect(currentSteamLanguage()).resolves.toBe("english");
    stubSteamLanguage(() => {
      throw new Error("Steam unavailable");
    });
    await expect(currentSteamLanguage()).resolves.toBe("english");
    stubSteamLanguage(() => Promise.reject(new Error("Steam unavailable")));
    await expect(currentSteamLanguage()).resolves.toBe("english");
  });

  it("returns English when Steam exposes no language reader", async () => {
    Object.defineProperty(globalThis, "SteamClient", {
      configurable: true,
      value: { Settings: {} },
    });
    await expect(currentSteamLanguage()).resolves.toBe("english");
  });
});

describe("backend messages", () => {
  it("translates known error codes", () => {
    i18n.addResource("en-US", "translation", "backend.hltb_busy", "Steam is busy right now");
    expect(translateBackendError(new Error("Error: hltb_busy"))).toBe("Steam is busy right now");
  });

  it("translates the SteamGridDB invalid API key error", () => {
    expect(translateBackendError(new Error("sgdb_invalid_api_key"))).toBe(
      "SteamGridDB rejected the API key. Check it in Settings → Artwork.",
    );
  });

  it("keeps English prose unchanged", () => {
    expect(translateBackendError(new Error("Error: Steam is busy right now"))).toBe(
      "Steam is busy right now",
    );
  });

  it("interpolates translated progress messages", () => {
    i18n.addResource("en-US", "translation", "backend.progress.test_progress", "Scanning {{title}}");
    expect(
      translateProgress({
        message_code: "test_progress",
        message: "Scanning",
        message_args: { title: "Game" },
      }),
    ).toBe("Scanning Game");
  });

  it("falls back to the English progress message", () => {
    expect(translateProgress({ message: "Scanning 2 of 4" })).toBe("Scanning 2 of 4");
    expect(
      translateProgress({ message_code: "scan_missing", message: "Scanning", message_args: { title: "Game" } }),
    ).toBe("Scanning");
    expect(translateProgress(null)).toBe("");
  });
});

describe("formatting", () => {
  it("formats hours with English plural forms", () => {
    expect(formatHours(12.5)).toBe("12.5 hours");
    expect(formatHours(1)).toBe("1.0 hour");
  });
});
