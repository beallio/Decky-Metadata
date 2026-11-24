import { describe, expect, it } from "vitest";

import { DEFAULT_UPDATE_SETTINGS, resolveLoadedUpdateSettings } from "./updater/updateSettings";

describe("update settings fallbacks", () => {
  it.each(["failed", "skipped"] as const)(
    "falls back to defaults when loading returns %s",
    (status) => {
      expect(resolveLoadedUpdateSettings({ status })).toEqual(DEFAULT_UPDATE_SETTINGS);
    }
  );

  it("accepts authoritative loaded settings", () => {
    const settings = {
      update_channel: "development" as const,
      automatic_update_checks: false,
    };
    expect(resolveLoadedUpdateSettings(settings)).toEqual(settings);
  });
});
