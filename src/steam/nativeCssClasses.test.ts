import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNativeCssClass,
  isValidCssIdentifier,
  resolveSteamCssClass,
  setNativeCssClasses,
  subscribeNativeCssClasses,
} from "./nativeCssClasses";

describe("nativeCssClasses", () => {
  afterEach(() => {
    setNativeCssClasses(null);
  });

  it("validates CSS identifiers and resolves primary before translated fallback", () => {
    expect(isValidCssIdentifier("aqfOaplliDM-")).toBe(true);
    expect(isValidCssIdentifier("_705czaYU-Ik-")).toBe(true);
    expect(isValidCssIdentifier("bad class")).toBe(false);
    expect(isValidCssIdentifier("123bad")).toBe(false);
    expect(isValidCssIdentifier("")).toBe(false);

    const listener = vi.fn();
    const unsubscribe = subscribeNativeCssClasses(listener);
    setNativeCssClasses({
      playSection: "XzQVNZx-stM-",
      gameDescription: "bad;injection",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getNativeCssClass("playSection")).toBe("XzQVNZx-stM-");
    expect(getNativeCssClass("gameDescription")).toBeUndefined();
    expect(resolveSteamCssClass("webpack-play", "playSection")).toBe("webpack-play");
    expect(resolveSteamCssClass(undefined, "playSection")).toBe("XzQVNZx-stM-");
    expect((globalThis as Record<string, any>).__DECKY_METADATA_NATIVE_CLASSES__?.playSection).toBe("XzQVNZx-stM-");

    unsubscribe();
    setNativeCssClasses(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getNativeCssClass("playSection")).toBeUndefined();
  });
});
