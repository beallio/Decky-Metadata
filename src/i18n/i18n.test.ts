import { afterEach, describe, expect, it, vi } from "vitest";

import { en } from "./catalog/en";
import { fr } from "./catalog/fr";
import {
  getLocale,
  refreshLocale,
  resolveLocale,
  setLocale,
  subscribeLocale,
  t,
  translate,
} from "./index";

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
const placeholders = (value: string): string[] =>
  Array.from(value.matchAll(PLACEHOLDER), (match) => match[1]).sort();

afterEach(() => {
  setLocale("en");
  delete (globalThis as any).SteamClient;
  vi.restoreAllMocks();
});

describe("catalog parity", () => {
  it("defines the same keys in every catalog", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty translation", () => {
    for (const [key, value] of Object.entries({ ...en, ...fr })) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("keeps the same placeholders in both languages", () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe("locale resolution", () => {
  it("maps Steam language names", () => {
    expect(resolveLocale("english")).toBe("en");
    expect(resolveLocale("french")).toBe("fr");
    expect(resolveLocale("FRENCH")).toBe("fr");
  });

  it("accepts BCP-47 tags", () => {
    expect(resolveLocale("fr-FR")).toBe("fr");
    expect(resolveLocale("fr_CA")).toBe("fr");
    expect(resolveLocale("en-GB")).toBe("en");
  });

  it("falls back to English for languages without a catalog", () => {
    expect(resolveLocale("german")).toBe("en");
    expect(resolveLocale("schinese")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });

  it("reads the Steam language when Steam is available", () => {
    (globalThis as any).SteamClient = { Settings: { GetCurrentLanguage: () => "french" } };
    expect(refreshLocale()).toBe("fr");
    expect(getLocale()).toBe("fr");
  });

  it("survives a missing or throwing Steam client", () => {
    (globalThis as any).SteamClient = {
      Settings: { GetCurrentLanguage: () => { throw new Error("no Steam"); } },
    };
    expect(() => refreshLocale()).not.toThrow();
    // Falls back to the browser language, which is whatever the host uses.
    expect(["en", "fr"]).toContain(getLocale());
  });
});

describe("translation", () => {
  it("returns the English source by default", () => {
    expect(t("qam.metadata.title")).toBe("Metadata");
  });

  it("switches to French", () => {
    setLocale("fr");
    expect(t("qam.metadata.title")).toBe("Métadonnées");
  });

  it("interpolates named parameters", () => {
    setLocale("fr");
    expect(t("qam.delisted.count", { count: 42 })).toBe("Jeux retirés : 42");
  });

  it("keeps unknown placeholders untouched", () => {
    setLocale("fr");
    expect(t("qam.delisted.count", {})).toContain("{{count}}");
  });

  it("is the same function as translate", () => {
    expect(translate("common.ok")).toBe(t("common.ok"));
  });

  it("notifies subscribers only on a real change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocale(listener);
    expect(setLocale("en")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(setLocale("fr")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setLocale("en");
  });

  it("stringifies numeric parameters", () => {
    setLocale("fr");
    expect(t("qam.trailers.display", { width: 1920, height: 1080 })).toBe(
      "1920 × 1080 pixels",
    );
  });
});
