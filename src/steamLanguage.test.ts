import { afterEach, describe, expect, it } from "vitest";

import { currentSteamLanguage, readSteamLanguage } from "./steamLanguage";

const installSteam = (value: unknown) => {
  (globalThis as any).SteamClient = {
    Settings: {
      GetCurrentLanguage: typeof value === "function" ? value : () => value,
    },
  };
};

afterEach(() => {
  delete (globalThis as any).SteamClient;
});

describe("steam language", () => {
  it("reads the Steam language name unchanged", () => {
    installSteam("french");
    expect(readSteamLanguage()).toBe("french");
    expect(currentSteamLanguage()).toBe("french");
  });

  it("falls back to a host language when Steam is unavailable", () => {
    expect(readSteamLanguage()).toBeNull();
    expect(currentSteamLanguage().length).toBeGreaterThan(0);
  });

  it("ignores a throwing or malformed Steam client", () => {
    installSteam(() => {
      throw new Error("no Steam");
    });
    expect(readSteamLanguage()).toBeNull();
    installSteam(42);
    expect(readSteamLanguage()).toBeNull();
  });
});
