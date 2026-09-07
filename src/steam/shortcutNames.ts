import type { ShortcutNameState } from "../types";
import { getNativeOverview, isNativeNonSteamShortcut, steamInternals } from "./core";

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 3_000;

export type ShortcutNameStatus = "unmanaged" | "managed" | "restored" | "diverged";

const positiveAppId = (value: unknown): number | null => {
  const appId = Number(value);
  return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : null;
};

/**
 * Read Steam's native shortcut name without going through the metadata alias
 * or the title cleaner. Only surrounding whitespace is presentation noise.
 */
export const nativeShortcutName = (appId: number): string | null => {
  if (!positiveAppId(appId)) return null;
  const overview = getNativeOverview(appId);
  if (!overview || !isNativeNonSteamShortcut(overview)) return null;
  return typeof overview.display_name === "string" ? overview.display_name.trim() : null;
};

/** True only when Steam exposes the native shortcut rename method. */
export const hasShortcutNameApi = (): boolean =>
  typeof steamInternals().SteamClient?.Apps?.SetShortcutName === "function";

export const classifyShortcutNameState = (
  currentName: string | null,
  state: ShortcutNameState | null | undefined,
): ShortcutNameStatus => {
  if (!state) return "unmanaged";
  if (currentName === state.applied_name) return "managed";
  if (currentName === state.original_name) return "restored";
  return "diverged";
};

/**
 * Request one native rename and wait for Steam's own overview to report it.
 * SetShortcutName returns undefined, so it is never proof of success.
 */
export const setShortcutNameAndWait = (
  appId: number,
  expectedCurrent: string,
  target: string,
): Promise<string> => {
  const normalizedAppId = positiveAppId(appId);
  const expected = typeof expectedCurrent === "string" ? expectedCurrent.trim() : "";
  const requested = typeof target === "string" ? target.trim() : "";
  if (!normalizedAppId) return Promise.reject(new Error("invalid shortcut app ID"));
  if (!requested) return Promise.reject(new Error("shortcut name target is empty"));
  const current = nativeShortcutName(normalizedAppId);
  if (current === null) return Promise.reject(new Error("native shortcut is unavailable"));
  if (current !== expected) return Promise.reject(new Error("shortcut name changed before rename"));
  const setName = steamInternals().SteamClient?.Apps?.SetShortcutName;
  if (!hasShortcutNameApi() || typeof setName !== "function") {
    return Promise.reject(new Error("Steam shortcut name API is unavailable"));
  }
  try {
    setName(normalizedAppId, requested);
  } catch (error) {
    return Promise.reject(new Error(`Steam shortcut name API failed: ${String(error)}`));
  }
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const finish = (callback: () => void) => {
      clearInterval(interval);
      callback();
    };
    const poll = () => {
      if (nativeShortcutName(normalizedAppId) === requested) {
        finish(() => resolve(requested));
        return;
      }
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        finish(() => reject(new Error("Steam shortcut name update timeout")));
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll();
  });
};
