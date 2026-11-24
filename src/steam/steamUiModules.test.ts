import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ findModuleChild: vi.fn() }));

import { findSteamModulesBySource, findSteamVar } from "./steamUiModules";

describe("findSteamModulesBySource", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__DECKY_ESM__;
    delete (globalThis as Record<string, unknown>).webpackChunksteamui;
  });

  it("falls back to Vite __DECKY_ESM__ exported function, prototype getter, and forwardRef sources", () => {
    // Simulate Decky's Vite shim where webpackChunksteamui factories are synthetic wrappers.
    const requireFn = Object.assign(() => ({}), { m: { "esm:chunk.js": () => ({}) } });
    (globalThis as Record<string, unknown>).webpackChunksteamui = {
      push: ([_id, _mods, cb]: [unknown, unknown, (r: unknown) => void]) => cb(requireFn),
    };
    Object.setPrototypeOf((globalThis as Record<string, unknown>).webpackChunksteamui, Array.prototype);

    function TooltipFn(props: { toolTipContent?: unknown; bNavStop?: boolean }) {
      return { className: "tool-tip-source", toolTipContent: props.toolTipContent, bNavStop: props.bNavStop };
    }
    class ArtworkComp {
      get GetCustomImageURLs() {
        return "LibraryAssetImage_UnknownName";
      }
    }
    const ForwardComp = React.forwardRef(function Row() {
      return React.createElement("div", { "data-vbc": "VBC_" });
    });

    const tooltipMod = { Un: TooltipFn };
    const artworkMod = { ArtworkComp };
    const forwardMod = { Xd: ForwardComp };
    (globalThis as Record<string, unknown>).__DECKY_ESM__ = new Map<string, unknown>([
      ["esm:tooltip.js", tooltipMod],
      ["esm:artwork.js", artworkMod],
      ["esm:forward.js", forwardMod],
    ]);

    expect(findSteamModulesBySource(["tool-tip-source", "bNavStop", "toolTipContent:"])).toEqual([tooltipMod]);
    expect(findSteamModulesBySource(["LibraryAssetImage_UnknownName", "GetCustomImageURLs"])).toEqual([artworkMod]);
    expect(findSteamModulesBySource(["VBC_"])).toEqual([forwardMod]);
  });
});

describe("findSteamVar", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).DFL;
  });

  it("searches unexported module variables through Decky UI 5 and is inert on webpack Steam", () => {
    const scope = { a: 1, AJ: class RegisterSection {} };
    (globalThis as Record<string, unknown>).DFL = {
      findModuleChild: vi.fn(),
      findVar: (filter: (value: unknown) => boolean) => Object.values(scope).find(filter),
    };
    expect(findSteamVar((value) => value === scope.AJ)).toBe(scope.AJ);

    (globalThis as Record<string, unknown>).DFL = { findModuleChild: vi.fn() };
    expect(findSteamVar(() => true)).toBeUndefined();
  });
});
