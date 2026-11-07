import { describe, expect, it } from "vitest";
import { DEFAULT_HLTB_SETTINGS, normalizeHltbSettings } from "./settings";

describe("normalizeHltbSettings", () => {
  it("uses defaults for missing and invalid values", () => {
    expect(normalizeHltbSettings(null)).toEqual(DEFAULT_HLTB_SETTINGS);
    expect(normalizeHltbSettings({ style: "other", showMain: 0, appearance: { textScale: NaN } })).toEqual(DEFAULT_HLTB_SETTINGS);
  });
  it("drops retired per-game hiding and link color", () => {
    const settings = normalizeHltbSettings({ hiddenAppIds: [620], appearance: { linkColor: "text" } });
    expect(settings).not.toHaveProperty("hiddenAppIds");
    expect(settings.appearance).not.toHaveProperty("linkColor");
  });
  it("clamps and rounds appearance values to five", () => {
    expect(normalizeHltbSettings({ appearance: { barAlpha: 27, textScale: 147 } }).appearance).toMatchObject({ barAlpha: 25, textScale: 145 });
    expect(normalizeHltbSettings({ appearance: { barAlpha: -10, textScale: 999 } }).appearance).toMatchObject({ barAlpha: 0, textScale: 150 });
  });
});
