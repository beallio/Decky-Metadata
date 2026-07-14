import { describe, expect, it } from "vitest";
import {
  ControllerConfigRecord,
  mergeCommunityConfigs,
  mergeOfficialConfigs,
  mergeRecommendedTemplates,
  resolveControllerLayoutSource,
} from "./controllerLayoutPolicy";

const record = (
  URL: string,
  extra: Record<string, unknown> = {},
): ControllerConfigRecord => ({ URL, ...extra });

const source = (
  steamAppid: number | null | undefined,
  options: { displayedAppid?: number; isNonSteamShortcut?: boolean; state?: string } = {},
) => resolveControllerLayoutSource({
  displayedAppid: options.displayedAppid ?? 2312439508,
  isNonSteamShortcut: options.isNonSteamShortcut ?? true,
  metadata: steamAppid == null ? undefined : {
    steam_appid: steamAppid,
    steam_store_state: options.state as "available" | "delisted" | "unknown",
  },
});

describe("resolveControllerLayoutSource", () => {
  it.each(["available", "delisted", "unknown"])(
    "uses the positive matched appid for %s metadata",
    (state) => {
      expect(source(15100, { state })).toBe(15100);
    },
  );

  it("rejects native applications and never-on-Steam shortcuts", () => {
    expect(source(15100, { isNonSteamShortcut: false })).toBeNull();
    expect(source(null)).toBeNull();
    expect(source(0)).toBeNull();
    expect(source(-1)).toBeNull();
    expect(source(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("rejects a source equal to the displayed appid", () => {
    expect(source(15100, { displayedAppid: 15100 })).toBeNull();
    expect(source(15100, { displayedAppid: Number.NaN })).toBeNull();
  });
});

describe("controller layout merges", () => {
  it("merges official records base-first with stable URL deduplication", () => {
    const nativeOnly = Object.freeze(record("config://shortcut-personal"));
    const duplicate = Object.freeze(record("config://shared", { origin: "shortcut" }));
    const secondNativeDuplicate = Object.freeze(record("config://shared", {
      origin: "second shortcut",
    }));
    const supplementalDuplicate = Object.freeze(record("config://shared", {
      origin: "matched",
    }));
    const matchedOnly = Object.freeze(record("config://matched-official"));
    const native = Object.freeze([nativeOnly, duplicate, secondNativeDuplicate]);
    const supplemental = Object.freeze([supplementalDuplicate, matchedOnly]);

    const result = mergeOfficialConfigs(native, supplemental);

    expect(result).toEqual({
      ok: true,
      value: [nativeOnly, duplicate, secondNativeDuplicate, matchedOnly],
    });
    expect(result.ok && result.value).not.toBe(native);
    expect(native).toEqual([nativeOnly, duplicate, secondNativeDuplicate]);
    expect(supplemental).toEqual([supplementalDuplicate, matchedOnly]);
  });

  it("merges community records without mutating arrays or records", () => {
    const nativeRecord = Object.freeze(record("config://shortcut-workshop"));
    const supplementalRecord = Object.freeze(record("config://matched-workshop"));
    const native = Object.freeze([nativeRecord]);
    const supplemental = Object.freeze([supplementalRecord]);

    const result = mergeCommunityConfigs(native, supplemental);

    expect(result).toEqual({ ok: true, value: [nativeRecord, supplementalRecord] });
    expect(result.ok && result.value).not.toBe(native);
    expect(native).toEqual([nativeRecord]);
    expect(supplemental).toEqual([supplementalRecord]);
    expect(nativeRecord).toEqual({ URL: "config://shortcut-workshop" });
    expect(supplementalRecord).toEqual({ URL: "config://matched-workshop" });
  });

  it("supplements Recommended with only explicitly recommended templates", () => {
    const nativeGeneric = record("config://shortcut-generic", { bRecommended: false });
    const syntheticRecommended = record("config://matched-recommended", {
      bRecommended: true,
    });
    const matchedGeneric = record("config://matched-generic", { bRecommended: false });
    const matchedPersonal = record("config://matched-personal");

    expect(mergeRecommendedTemplates(
      [nativeGeneric],
      [matchedGeneric, syntheticRecommended, matchedPersonal],
    )).toEqual({ ok: true, value: [nativeGeneric, syntheticRecommended] });
  });

  it("preserves native records even when Steam does not provide a usable URL", () => {
    const nativeOpaque = { title: "native opaque record" };
    const matched = record("config://matched");

    expect(mergeCommunityConfigs([nativeOpaque], [matched])).toEqual({
      ok: true,
      value: [nativeOpaque, matched],
    });
  });

  it.each([
    ["Official", mergeOfficialConfigs],
    ["Community", mergeCommunityConfigs],
  ] as const)("rejects malformed %s supplemental arrays and records", (_name, merge) => {
    expect(merge([], null)).toEqual({
      ok: false,
      reason: "supplemental-not-array",
    });
    expect(merge([], [null])).toEqual({
      ok: false,
      reason: "malformed-supplemental-record",
      index: 0,
    });
    expect(merge([], [{}])).toEqual({
      ok: false,
      reason: "malformed-supplemental-record",
      index: 0,
    });
    expect(merge([], [{ URL: "   " }])).toEqual({
      ok: false,
      reason: "malformed-supplemental-record",
      index: 0,
    });
  });

  it("rejects malformed recommended records but ignores valid non-recommended templates", () => {
    expect(mergeRecommendedTemplates([], [null])).toEqual({
      ok: false,
      reason: "malformed-supplemental-record",
      index: 0,
    });
    expect(mergeRecommendedTemplates([], [{ bRecommended: true }])).toEqual({
      ok: false,
      reason: "malformed-supplemental-record",
      index: 0,
    });
    expect(mergeRecommendedTemplates([], [
      { bRecommended: false },
      { URL: "", bRecommended: false },
      record("config://recommended", { bRecommended: true }),
    ])).toEqual({
      ok: true,
      value: [record("config://recommended", { bRecommended: true })],
    });
  });
});
