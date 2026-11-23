import { createElement, type ComponentType, type ElementType } from "react";

export type CompatDisplayHook = () => [boolean, number];

/** Overview field the native indicator reads for a display value; null for 0/unknown. */
export const compatFieldForDisplay = (display: number) => {
  switch (display) {
    case 1: return "steam_deck_compat_category";
    case 2:
    case 5: return "steam_os_compat_category";
    case 3: return "steam_machine_compat_category";
    case 4: return "steam_frame_compat_category";
    default: return null;
  }
};

/** Find Steam's style hook by source fingerprints; null when absent. */
export const findSteamCompatDisplayHook = (
  findModulesBySource: (fragments: string[]) => unknown[] | unknown,
): CompatDisplayHook | null => {
  let candidates: unknown;
  try {
    candidates = findModulesBySource(["bForceShowCompatInfo", "FORCED_DISPLAY_MODE"]);
  } catch {
    return null;
  }
  const modules = Array.isArray(candidates) ? candidates : [candidates];
  const matches = new Set<CompatDisplayHook>();
  for (const module of modules) {
    if (!module || typeof module !== "object") continue;
    let keys: string[];
    try {
      keys = Object.keys(module);
    } catch {
      continue;
    }
    for (const key of keys) {
      let exported: unknown;
      try {
        exported = (module as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (typeof exported !== "function") continue;
      let source: string;
      try {
        source = exported.toString();
      } catch {
        continue;
      }
      if (source.includes("bForceShowCompatInfo") && source.includes("FORCED_DISPLAY_MODE") && source.includes("steammachine")) {
        matches.add(exported as CompatDisplayHook);
      }
    }
  }
  return matches.size === 1 ? matches.values().next().value ?? null : null;
};

export const makeOwnedCompatIndicator = (
  native: ElementType,
  hook: CompatDisplayHook | null,
  fallbackDisplay: number | null,
): ComponentType<{ overview: any; forcedDisplay?: number; className?: string }> => {
  return function OwnedCompatIndicator({ overview, forcedDisplay, className }) {
    const hookResult: unknown = hook ? hook() : null;
    let show: boolean;
    let hookDisplay: number;
    if (hook) {
      if (!Array.isArray(hookResult) || hookResult.length !== 2 || typeof hookResult[0] !== "boolean" || typeof hookResult[1] !== "number" || !Number.isFinite(hookResult[1])) {
        return null;
      }
      [show, hookDisplay] = hookResult;
    } else {
      show = fallbackDisplay !== null;
      hookDisplay = fallbackDisplay ?? 0;
    }
    if (!show) return null;

    const override = typeof forcedDisplay === "number" && Number.isFinite(forcedDisplay) ? forcedDisplay : undefined;
    const display = override ?? hookDisplay;
    const field = compatFieldForDisplay(display);
    if (!field) return null;
    try {
      const category = Number(overview?.[field]);
      if (!Number.isFinite(category) || category <= 0) return null;
    } catch {
      return null;
    }
    return createElement(native, { display, overview, className });
  };
};
