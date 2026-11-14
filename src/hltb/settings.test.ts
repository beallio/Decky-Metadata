import { describe, expect, it } from "vitest";
import { DEFAULT_HLTB_SETTINGS, normalizeHltbSettings } from "./settings";

describe("normalizeHltbSettings", () => {
  it("uses defaults for missing and invalid values", () => {
    expect(normalizeHltbSettings(null)).toEqual(DEFAULT_HLTB_SETTINGS);
    expect(normalizeHltbSettings({ style: "other", showMain: 0, appearance: { textScale: NaN } })).toEqual(DEFAULT_HLTB_SETTINGS);
    expect(normalizeHltbSettings({ store: false }).store).toBe(false);
    expect(normalizeHltbSettings({ store: "yes" }).store).toBe(true);
  });
  it("drops retired per-game hiding and link color", () => {
    const settings = normalizeHltbSettings({ hiddenAppIds: [620], appearance: { linkColor: "text" } });
    expect(settings).not.toHaveProperty("hiddenAppIds");
    expect(settings.appearance).not.toHaveProperty("linkColor");
  });
  it("keeps only known blur choices", () => {
    expect(normalizeHltbSettings({ appearance: { blur: "blur" } }).appearance.blur).toBe("blur");
    expect(normalizeHltbSettings({ appearance: { blur: "soft" } }).appearance.blur).toBe("match");
  });
  it("normalizes pushing the Play button down", () => {
    expect(normalizeHltbSettings({ pushPlayDown: true }).pushPlayDown).toBe(true);
    expect(normalizeHltbSettings({ pushPlayDown: "yes" }).pushPlayDown).toBe(false);
    expect(normalizeHltbSettings({}).pushPlayDown).toBe(false);
  });
  it("clamps and rounds appearance values to five", () => {
    expect(normalizeHltbSettings({ appearance: { barAlpha: 27, textScale: 147 } }).appearance).toMatchObject({ barAlpha: 25, textScale: 145 });
    expect(normalizeHltbSettings({ appearance: { barAlpha: -10, textScale: 999 } }).appearance).toMatchObject({ barAlpha: 0, textScale: 150 });
  });
});
