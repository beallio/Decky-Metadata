import { describe, expect, it, vi } from "vitest";
import {
  compatFieldForDisplay,
  findSteamCompatDisplayHook,
  makeOwnedCompatIndicator,
  type CompatDisplayHook,
} from "./compatDisplay";
const Native = () => null;
type OwnedIndicatorProps = { overview: unknown; forcedDisplay?: number; className?: string };
const render = (
  hook: CompatDisplayHook | null,
  fallbackDisplay: number | null,
  props: OwnedIndicatorProps = { overview: {} },
) => (makeOwnedCompatIndicator(Native, hook, fallbackDisplay) as (props: OwnedIndicatorProps) => unknown)(props);

const betaHook: CompatDisplayHook = function tp() {
  const fingerprint = "bForceShowCompatInfo FORCED_DISPLAY_MODE steammachine";
  return [fingerprint.length > 0, 3];
};
 

const matchingHook = () => "bForceShowCompatInfo FORCED_DISPLAY_MODE steammachine";

describe("compatFieldForDisplay", () => {
  it.each([
    [1, "steam_deck_compat_category"],
    [2, "steam_os_compat_category"],
    [3, "steam_machine_compat_category"],
    [4, "steam_frame_compat_category"],
    [5, "steam_os_compat_category"],
    [0, null],
    [6, null],
  ] as const)("maps display %i", (display, field) => {
    expect(compatFieldForDisplay(display)).toBe(field);
  });
});

describe("makeOwnedCompatIndicator", () => {
  it("renders the native Machine indicator using its per-device category", () => {
    const element = render(() => [true, 3], null, { overview: { steam_machine_compat_category: 3 } });
    expect(element).toMatchObject({ type: Native, props: { display: 3 } });
  });

  it("does not substitute the Deck rating when Machine has no rating", () => {
    expect(render(() => [true, 3], null, {
      overview: { steam_machine_compat_category: 0, steam_deck_compat_category: 3 },
    })).toBeNull();
  });

  it("returns null when the style hook says compatibility details are hidden", () => {
    expect(render(() => [false, 0], null, { overview: { steam_deck_compat_category: 3 } })).toBeNull();
  });

  it("lets a finite forced display override the hook display", () => {
    const element = render(() => [true, 1], null, {
      overview: { steam_deck_compat_category: 3, steam_os_compat_category: 2 },
      forcedDisplay: 2,
    });
    expect(element).toMatchObject({ type: Native, props: { display: 2 } });
  });

  it("uses the fallback only when there is no hook", () => {
    expect(render(null, 1, { overview: { steam_deck_compat_category: 3 } })).toMatchObject({
      type: Native,
      props: { display: 1 },
    });
    expect(render(null, null, { overview: { steam_deck_compat_category: 3 } })).toBeNull();
  });

  it("calls a provided hook and fails closed for malformed hook results", () => {
    const hook = vi.fn(() => [true, 1] as [boolean, number]);
    expect(render(hook, 3, { overview: { steam_deck_compat_category: 3 } })).toMatchObject({
      type: Native,
      props: { display: 1 },
    });
    expect(hook).toHaveBeenCalledOnce();
    expect(render(() => null as never, 1, { overview: { steam_deck_compat_category: 3 } })).toBeNull();
  });
});

describe("findSteamCompatDisplayHook", () => {
  it("finds the unique beta style hook in one module result", () => {
    expect(findSteamCompatDisplayHook(() => ({ tp: betaHook }))).toBe(betaHook);
  });

  it("returns null if the fingerprint is missing or ambiguous", () => {
    expect(findSteamCompatDisplayHook(() => ({ tp: () => "bForceShowCompatInfo FORCED_DISPLAY_MODE" }))).toBeNull();
    expect(findSteamCompatDisplayHook(() => [{ first: matchingHook }, { second: () => "bForceShowCompatInfo FORCED_DISPLAY_MODE steammachine" }])).toBeNull();
  });

  it("ignores exports whose getters throw", () => {
    const module = { matchingHook };
    Object.defineProperty(module, "broken", { enumerable: true, get: () => { throw new Error("broken export"); } });
    expect(findSteamCompatDisplayHook(() => [module])).toBe(matchingHook);
  });
});
