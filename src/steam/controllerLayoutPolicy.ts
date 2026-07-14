import type { MetadataData } from "../types";

export type ControllerConfigRecord = {
  URL?: unknown;
  bRecommended?: unknown;
  [key: string]: unknown;
};

export type ControllerLayoutSourceInput = {
  displayedAppid: number;
  isNonSteamShortcut: boolean;
  metadata?: Pick<MetadataData, "steam_appid" | "steam_store_state">;
};

export type ControllerConfigMergeResult =
  | { ok: true; value: unknown[] }
  | {
      ok: false;
      reason: "supplemental-not-array" | "malformed-supplemental-record";
      index?: number;
    };

export const resolveControllerLayoutSource = (
  input: ControllerLayoutSourceInput,
): number | null => {
  if (!input.isNonSteamShortcut) return null;
  const sourceAppid = input.metadata?.steam_appid;
  if (
    !Number.isFinite(input.displayedAppid) ||
    input.displayedAppid <= 0 ||
    typeof sourceAppid !== "number" ||
    !Number.isFinite(sourceAppid) ||
    sourceAppid <= 0 ||
    sourceAppid === input.displayedAppid
  ) {
    return null;
  }
  return sourceAppid;
};

const isRecord = (value: unknown): value is ControllerConfigRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStableUrl = (value: ControllerConfigRecord): value is ControllerConfigRecord & { URL: string } =>
  typeof value.URL === "string" && value.URL.trim().length > 0;

const mergeSupplemental = (
  nativeBase: readonly unknown[],
  supplemental: unknown,
  include: (record: ControllerConfigRecord) => boolean,
): ControllerConfigMergeResult => {
  if (!Array.isArray(supplemental)) {
    return { ok: false, reason: "supplemental-not-array" };
  }

  const merged: unknown[] = [...nativeBase];
  const seen = new Set<string>();
  for (const value of nativeBase) {
    if (isRecord(value) && hasStableUrl(value)) {
      seen.add(value.URL);
    }
  }

  for (let index = 0; index < supplemental.length; index += 1) {
    const value = supplemental[index];
    if (!isRecord(value)) {
      return { ok: false, reason: "malformed-supplemental-record", index };
    }
    if (!include(value)) continue;
    if (!hasStableUrl(value)) {
      return { ok: false, reason: "malformed-supplemental-record", index };
    }
    if (seen.has(value.URL)) continue;
    seen.add(value.URL);
    merged.push(value);
  }

  return { ok: true, value: merged };
};

export const mergeOfficialConfigs = (
  nativeBase: readonly unknown[],
  supplemental: unknown,
): ControllerConfigMergeResult =>
  mergeSupplemental(nativeBase, supplemental, () => true);

export const mergeRecommendedTemplates = (
  nativeBase: readonly unknown[],
  supplemental: unknown,
): ControllerConfigMergeResult =>
  mergeSupplemental(
    nativeBase,
    supplemental,
    (record) => record.bRecommended === true,
  );

export const mergeCommunityConfigs = (
  nativeBase: readonly unknown[],
  supplemental: unknown,
): ControllerConfigMergeResult =>
  mergeSupplemental(nativeBase, supplemental, () => true);
