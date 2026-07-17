import { describe, expect, it } from "vitest";

import {
  DEFAULT_UPDATE_SETTINGS,
  resolveLoadedUpdateSettings,
  resolveSavedUpdateSettings,
} from "./updater/updateSettings";

describe("update settings fallbacks", () => {
  it.each(["failed", "skipped"] as const)(
    "falls back to defaults when loading returns %s",
    (status) => {
      expect(resolveLoadedUpdateSettings({ status })).toEqual(DEFAULT_UPDATE_SETTINGS);
    }
  );

  it.each(["failed", "skipped"] as const)(
    "rolls optimistic settings back when saving returns %s",
    (status) => {
      const previous = {
        update_channel: "stable" as const,
        automatic_update_checks: true,
      };
      expect(resolveSavedUpdateSettings(previous, { status })).toEqual(previous);
    }
  );

  it("accepts authoritative loaded and saved settings", () => {
    const settings = {
      update_channel: "development" as const,
      automatic_update_checks: false,
    };
    expect(resolveLoadedUpdateSettings(settings)).toEqual(settings);
    expect(resolveSavedUpdateSettings(DEFAULT_UPDATE_SETTINGS, settings)).toEqual(settings);
  });
});
