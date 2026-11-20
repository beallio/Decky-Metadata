import { steamUiWindow } from "./steamUiHost";

export type NativeCssClassKey =
  | "appDetailsHeader"
  | "appDetailsInnerContainer"
  | "playSection"
  | "appDetailsRoot"
  | "appActionButton"
  | "appButtons"
  | "gameInfoQuickLinks"
  | "gameInfoContainer"
  | "appGameInfoContainer"
  | "topCapsule"
  | "headerBackgroundImage"
  | "fullscreenEnterStart"
  | "fullscreenEnterActive"
  | "fullscreenEnterDone"
  | "fullscreenExitStart"
  | "fullscreenExitActive"
  | "fullscreenExitDone"
  | "cloudStatusRow"
  | "menuButton"
  | "controllerConfigButton"
  | "gameStatsSection"
  | "playBar"
  | "deckVerifiedInfo"
  | "deckVerifiedDetails"
  | "deckVerifiedFocused"
  | "gameDescription"
  | "descriptionInnerContainer"
  | "libraryItemBox"
  | "libraryItemDraggable"
  | "libraryItemIcons"
  | "libraryItemOverlayInnerArea"
  | "recentGamesContainer"
  | "recentGamesBackgroundImages"
  | "recentGamesBackgroundImage"
  | "recentGamesBackgroundContainer"
  | "playButton";

const CSS_IDENTIFIER_RE = /^[A-Za-z_-][A-Za-z0-9_-]*$/;
const GLOBAL_MIRROR_KEY = "__DECKY_METADATA_NATIVE_CLASSES__";

let translatedClasses: Partial<Record<NativeCssClassKey, string>> = {};
const listeners = new Set<() => void>();

export function isValidCssIdentifier(value: unknown): value is string {
  return typeof value === "string" && CSS_IDENTIFIER_RE.test(value);
}

function mirrorToSteamWindow(next: Partial<Record<NativeCssClassKey, string>>): void {
  try {
    const host = steamUiWindow() as Record<string, unknown> | undefined;
    if (host && typeof host === "object") {
      host[GLOBAL_MIRROR_KEY] = { ...next };
    }
  } catch {
    // Steam UI window may not be attached yet in unit tests or early boot.
  }
  try {
    (globalThis as Record<string, unknown>)[GLOBAL_MIRROR_KEY] = { ...next };
  } catch {
    // Ignore read-only globals.
  }
}

export function setNativeCssClasses(
  raw: Record<string, unknown> | null | undefined,
): void {
  const next: Partial<Record<NativeCssClassKey, string>> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      if (isValidCssIdentifier(value)) {
        next[key as NativeCssClassKey] = value;
      }
    }
  }
  translatedClasses = next;
  mirrorToSteamWindow(next);
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // Listener errors must never block class hydration.
    }
  }
}

export function getNativeCssClass(key: NativeCssClassKey): string | undefined {
  const value = translatedClasses[key];
  return isValidCssIdentifier(value) ? value : undefined;
}

export function resolveSteamCssClass(
  primary: unknown,
  key: NativeCssClassKey,
): string | undefined {
  if (isValidCssIdentifier(primary)) return primary;
  return getNativeCssClass(key);
}

export function subscribeNativeCssClasses(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
