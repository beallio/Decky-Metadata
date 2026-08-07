import { describe, expect, it } from "vitest";
import {
  ControllerConfigRecord,
  filterControllerSearchConfigs,
  type ControllerSearchContext,
  isSteamShortcutAppid,
  mergeCommunityConfigs,
  mergeOfficialConfigs,
  mergeRecommendedTemplates,
  resolveControllerLayoutContext,
} from "./controllerLayoutPolicy";

const record = (
  URL: string,
  extra: Record<string, unknown> = {},
): ControllerConfigRecord => ({ URL, ...extra });

const context = (
  steamAppid: number | null | undefined,
  options: { displayedAppid?: number; isNonSteamShortcut?: boolean; state?: string } = {},
) => resolveControllerLayoutContext({
  displayedAppid: options.displayedAppid ?? 2312439508,
  isNonSteamShortcut: options.isNonSteamShortcut ?? true,
  metadata: steamAppid == null ? undefined : {
    steam_appid: steamAppid,
    steam_store_state: options.state as "available" | "delisted" | "unknown",
  },
});

describe("resolveControllerLayoutContext", () => {
  it.each(["available", "delisted", "unknown"])(
    "uses the positive matched appid for %s metadata",
    (state) => {
      expect(context(15100, { state })).toEqual({
        isNonSteamShortcut: true,
        matchedSourceAppid: 15100,
      });
    },
  );

  it("distinguishes native applications from unmatched shortcuts", () => {
    expect(context(15100, { isNonSteamShortcut: false })).toEqual({
      isNonSteamShortcut: false,
      matchedSourceAppid: null,
    });
    expect(context(15100, { displayedAppid: 620, isNonSteamShortcut: true })).toEqual({
      isNonSteamShortcut: false,
      matchedSourceAppid: null,
    });
    expect(context(null)).toEqual({
      isNonSteamShortcut: true,
      matchedSourceAppid: null,
    });
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, "15100"])(
    "rejects malformed matched source %s without losing shortcut context",
    (steamAppid) => {
      expect(context(steamAppid as number)).toEqual({
        isNonSteamShortcut: true,
        matchedSourceAppid: null,
      });
    },
  );

  it.each([0x80000000, 3156562597, 0xffffffff, 0x100000000])(
    "rejects shortcut-domain or overflowing matched source %s",
    (steamAppid) => {
      expect(context(steamAppid)).toEqual({
        isNonSteamShortcut: true,
        matchedSourceAppid: null,
      });
    },
  );

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "fails closed for invalid displayed appid %s",
    (displayedAppid) => {
      expect(context(15100, { displayedAppid })).toEqual({
        isNonSteamShortcut: false,
        matchedSourceAppid: null,
      });
    },
  );

  it("rejects a source equal to the displayed appid without losing shortcut context", () => {
    expect(context(15100, { displayedAppid: 15100 })).toEqual({
      isNonSteamShortcut: false,
      matchedSourceAppid: null,
    });
  });
});

describe("isSteamShortcutAppid", () => {
  it.each([0x80000000, 0xffffffff])("accepts unsigned shortcut boundary %s", (appid) => {
    expect(isSteamShortcutAppid(appid)).toBe(true);
  });

  it.each([
    0x7fffffff,
    0,
    -1,
    0x80000000 + 0.5,
    Number.POSITIVE_INFINITY,
    Number.NaN,
    "2147483648",
    0x100000000,
  ])("rejects non-shortcut appid %s", (appid) => {
    expect(isSteamShortcutAppid(appid)).toBe(false);
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

describe("filterControllerSearchConfigs", () => {
  const makeContext = (
    displayedAppid: number | null,
    isNonSteamShortcut = true,
    matchedSourceAppid: number | null = null,
  ): ControllerSearchContext => ({
    displayedAppid,
    isNonSteamShortcut,
    matchedSourceAppid,
  });

  it("keeps the displayed shortcut and matched source", () => {
    const displayed = Object.freeze({ appID: 2312439508 });
    const native = Object.freeze({ appID: 620 });
    const matchedSource = Object.freeze({ appID: 15100 });
    const otherShortcut = Object.freeze({ appID: 2155012430 });
    expect(filterControllerSearchConfigs(
      [displayed, otherShortcut, matchedSource, native],
      makeContext(2312439508, true, 15100),
      new Set([55150, 15100]),
    )).toEqual({
      ok: true,
      value: [displayed, matchedSource],
    });
  });

  it("drops an unrelated native appid on a shortcut page", () => {
    const displayed = Object.freeze({ appID: 2312439508 });
    const native = Object.freeze({ appID: 620 });
    expect(filterControllerSearchConfigs(
      [displayed, native],
      makeContext(2312439508, true, 15100),
      new Set([55150, 15100]),
    )).toEqual({
      ok: true,
      value: [displayed],
    });
  });

  it("drops another shortcut and another app's injected source", () => {
    const displayed = Object.freeze({ appID: 2312439508 });
    const otherShortcut = Object.freeze({ appID: 2155012430 });
    const injectedSource = Object.freeze({ appID: 55150 });
    const otherInjected = Object.freeze({ appID: 15100 });
    expect(filterControllerSearchConfigs(
      [displayed, otherShortcut, injectedSource, otherInjected],
      makeContext(2312439508, true, null),
      new Set([55150, 15100]),
    )).toEqual({
      ok: true,
      value: [displayed],
    });
  });

  it("keeps unrelated native appids on a native page", () => {
    const nativeOne = Object.freeze({ appID: 620 });
    const nativeTwo = Object.freeze({ appID: 440 });
    const injectedSource = Object.freeze({ appID: 15100 });
    const shortcut = Object.freeze({ appID: 2312439508 });
    expect(filterControllerSearchConfigs(
      [nativeOne, nativeTwo, shortcut, injectedSource],
      makeContext(327030, false, null),
      new Set([55150, 15100]),
    )).toEqual({
      ok: true,
      value: [nativeOne, nativeTwo],
    });
  });

  it("drops every shortcut-namespace appid on a native page", () => {
    const native = Object.freeze({ appID: 620 });
    const spaceMarine = Object.freeze({ appID: 55150 });
    const assassinsCreed = Object.freeze({ appID: 15100 });
    expect(filterControllerSearchConfigs(
      [native, spaceMarine, assassinsCreed],
      makeContext(null, false, null),
      new Set([55150, 15100]),
    )).toEqual({
      ok: true,
      value: [native],
    });
  });

  it("drops injected sources except the displayed appid itself on native page", () => {
    const retainedNativeSource = Object.freeze({ appID: 620 });
    const removedSource = Object.freeze({ appID: 15100 });
    expect(filterControllerSearchConfigs(
      [retainedNativeSource, removedSource, { appID: 2155012430 }],
      makeContext(620, false, 620),
      new Set([620, 15100]),
    )).toEqual({
      ok: true,
      value: [retainedNativeSource],
    });
  });

  it("drops all injected sources and shortcut appids with unknown displayed context", () => {
    const native = Object.freeze({ appID: 620 });
    const unknownShortcut = Object.freeze({ appID: 2312439508 });
    const injectedSource = Object.freeze({ appID: 15100 });
    const nativeSource = Object.freeze({ appID: 440 });
    expect(filterControllerSearchConfigs(
      [native, unknownShortcut, injectedSource, nativeSource],
      makeContext(null, false, null),
      new Set([620, 2312439508, 15100, 440]),
    )).toEqual({
      ok: true,
      value: [],
    });
  });

  it("keeps records that are not objects or have unusable appIDs", () => {
    const throwingAppid = Object.defineProperty({}, "appID", {
      get() {
        throw new Error("opaque native getter");
      },
    });
    const records = [
      { appID: 1211020 },
      { title: "missing" },
      null,
      "opaque",
      { appID: "1211020" },
      { appID: 0 },
      { appID: -1 },
      { appID: Number.POSITIVE_INFINITY },
      { appID: Number.NaN },
      throwingAppid,
    ];
    const result = filterControllerSearchConfigs(
      records,
      makeContext(null, false, null),
      new Set([1211020, 15100]),
    );
    expect(result).toEqual({
      ok: true,
      value: expect.any(Array),
    });
    const kept = result.ok ? result.value : [];
    expect(kept).toHaveLength(records.length - 1);
    expect(kept).toContain(records[1]);
    expect(kept).toContain(records[2]);
    expect(kept).toContain(records[3]);
    expect(kept).toContain(records[4]);
    expect(kept).toContain(records[5]);
    expect(kept).toContain(records[6]);
    expect(kept).toContain(records[7]);
    expect(kept).toContain(records[8]);
    expect(kept.some((value) => value === records[9])).toBe(true);
    expect(kept).not.toContain(records[0]);
    expect(kept).not.toContain(records[0]);
  });

  it("returns a typed failure for a malformed native collection", () => {
    expect(filterControllerSearchConfigs(
      { appID: 1211020 } as const,
      makeContext(null, false, null),
      new Set([1211020]),
    )).toEqual({ ok: false, reason: "native-search-not-array" });
  });

  it("keeps every app when no supplemental source is tracked", () => {
    const records = [{ appID: 620 }];
    const result = filterControllerSearchConfigs(
      records,
      makeContext(null, false, null),
      new Set(),
    );
    expect(result).toEqual({ ok: true, value: records });
    expect(result.ok && result.value).toBe(records);
  });

  it("drops unmatched native records on a native context when no matched source exists", () => {
    const records = [{ appID: 2155012430 }, { appID: 2312439508 }, { appID: 620 }];
    expect(filterControllerSearchConfigs(
      records,
      makeContext(3156562597, true, null),
      new Set([55150]),
    )).toEqual({
      ok: true,
      value: [],
    });
  });

  it("keeps only the current unmatched shortcut while isolating every other shortcut", () => {
    const current = Object.freeze({ appID: 3156562597 });
    expect(filterControllerSearchConfigs(
      [{ appID: 2155012430 }, { appID: 2312439508 }, current, { appID: 620 }],
      makeContext(3156562597, true, null),
      new Set([55150, 15100]),
    )).toEqual({
      ok: true,
      value: [current],
    });
  });
});
