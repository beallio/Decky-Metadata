// Pure decision logic for the BIsModOrShortcut afterPatch. Extracted so the
// precedence rules are unit-testable: the 2026-07-11 launch regression was an
// ordering bug here (the render shield consumed before the in-call truth
// window), which only surfaced on-device.

export type SpoofReason =
  | "not-nonsteam"
  | "original-not-shortcut"
  | "in-call-truth"
  | "render-shield"
  | "home-special-case"
  | "truth-window"
  | "normal-shortcut";

export type SpoofDecision = {
  finalRet: any;
  reason: SpoofReason;
  shieldConsulted: boolean;
  shieldHit: boolean;
  nextBypassCounter: number;
};

export type SpoofInput = {
  isPatchedNonSteam: boolean;
  originalRet: any;
  bypassCounter: number;
  path: string;
  // Consuming a shield hit is a side effect (decrements the hit budget), so
  // the caller passes it lazily; the decision controls WHETHER it happens.
  consumeShield: () => boolean;
};

export const decideBIsModOrShortcut = (input: SpoofInput): SpoofDecision => {
  const { isPatchedNonSteam, originalRet, bypassCounter, path, consumeShield } = input;

  if (!isPatchedNonSteam) {
    return { finalRet: originalRet, reason: "not-nonsteam", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
  }
  if (originalRet !== true) {
    return { finalRet: originalRet, reason: "original-not-shortcut", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
  }

  // In-call truth must outrank the render shield and the home special case:
  // Steam's launch path derives the shortcut gameid via GetGameID /
  // GetPrimaryAppID, and spoofing inside those calls makes RunGame receive a
  // plain-appid gameid the client silently drops. The shield must not be
  // consulted here at all — its hit budget belongs to render checks.
  if (bypassCounter === -1) {
    return { finalRet: originalRet, reason: "in-call-truth", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
  }

  const shieldHit = consumeShield();
  if (shieldHit) {
    return { finalRet: false, reason: "render-shield", shieldConsulted: true, shieldHit: true, nextBypassCounter: bypassCounter };
  }
  if (path === "/library/home") {
    return { finalRet: false, reason: "home-special-case", shieldConsulted: true, shieldHit: false, nextBypassCounter: bypassCounter };
  }

  const nextBypassCounter = bypassCounter > 0 ? bypassCounter - 1 : bypassCounter;
  const shouldBypass = nextBypassCounter > 0;
  return {
    finalRet: shouldBypass,
    reason: shouldBypass ? "truth-window" : "normal-shortcut",
    shieldConsulted: true,
    shieldHit: false,
    nextBypassCounter,
  };
};
