import { describe, expect, it } from "vitest";
import { DEFAULT_HLTB_SETTINGS, normalizeHltbSettings } from "./settings";

describe("normalizeHltbSettings", () => {
  it("uses defaults for missing and invalid values", () => {
    expect(normalizeHltbSettings(null)).toEqual(DEFAULT_HLTB_SETTINGS);
    expect(normalizeHltbSettings({ style: "other", showMain: 0, appearance: { linkColor: "red", textScale: NaN } })).toEqual(DEFAULT_HLTB_SETTINGS);
  });
  it("clamps and rounds appearance values to five", () => {
    expect(normalizeHltbSettings({ appearance: { barAlpha: 27, textScale: 147 } }).appearance).toMatchObject({ barAlpha: 25, textScale: 145 });
    expect(normalizeHltbSettings({ appearance: { barAlpha: -10, textScale: 999 } }).appearance).toMatchObject({ barAlpha: 0, textScale: 150 });
  });
  it("deduplicates, validates and caps hidden app IDs", () => {
    const hiddenAppIds = [0, -1, 1.5, "2", 0x100000000, 1, 1, ...Array.from({ length: 6000 }, (_, i) => i + 2)];
    const ids = normalizeHltbSettings({ hiddenAppIds }).hiddenAppIds;
    expect(ids).toHaveLength(5000);
    expect(ids[0]).toBe(1);
    expect(ids[4999]).toBe(5000);
    expect(normalizeHltbSettings({ hiddenAppIds: [0xffffffff] }).hiddenAppIds).toEqual([0xffffffff]);
  });
});
