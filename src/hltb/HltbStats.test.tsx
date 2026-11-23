import React from "react";
import { describe, expect, it, vi } from "vitest";
import type * as I18nModule from "../i18n";
const { findClassModuleMock } = vi.hoisted(() => ({ findClassModuleMock: vi.fn() }));
vi.mock("@decky/ui", () => ({ findClassModule: findClassModuleMock, Focusable: "div", Navigation: { NavigateToExternalWeb: vi.fn() } }));
// The component is called directly here, so its hook must not need a React renderer.
vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return { ...actual, useT: () => actual.t };
});
import { Navigation } from "@decky/ui";
import { HltbStats } from "./HltbStats";
import { DEFAULT_HLTB_SETTINGS } from "./settings";

const stats = { main: 3600, plus: 5400, complete: 0, all: 7200 };
const render = (props: Partial<React.ComponentProps<typeof HltbStats>> = {}) => HltbStats({ stats, hltbId: 7231, settings: DEFAULT_HLTB_SETTINGS, launching: false, ...props });
function nodes(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<any>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return React.isValidElement<any>(node) ? text(node.props.children) : "";
}

describe("HLTB stats", () => {
  it("formats hours and opens the details page", () => {
    const tree = render();
    expect(text(tree)).toContain("1.0 hour");
    expect(text(tree)).toContain("1.5 hours");
    expect(text(tree)).toContain("-- hours");
    const button = nodes(tree).find(node => node.props.onActivate)!;
    expect(text(button)).toBe("Details");
    button.props.onActivate();
    expect(Navigation.NavigateToExternalWeb).toHaveBeenCalledWith("https://howlongtobeat.com/game/7231");
  });
  it("hides absent, empty, or launching rows", () => {
    expect(render({ stats: null })).toBeNull();
    expect(render({ launching: true })).toBeNull();
    expect(render({ stats: { main: 0, plus: -1, complete: 0, all: 0 } })).toBeNull();
  });
  it("honors stat and details visibility", () => {
    const tree = render({ settings: { ...DEFAULT_HLTB_SETTINGS, showMain: false, showComplete: false, hideViewDetails: true } });
    expect(text(tree)).not.toContain("Main Story");
    expect(text(tree)).not.toContain("Completionist");
    expect(text(tree)).toContain("Main + Extras");
    expect(text(tree)).not.toContain("Details");
  });
  it("takes layout space below the header only for the bottom styles when asked", () => {
    const className = (style: (typeof DEFAULT_HLTB_SETTINGS)["style"], pushPlayDown: boolean) =>
      render({ settings: { ...DEFAULT_HLTB_SETTINGS, style, pushPlayDown } })!.props.className as string;
    for (const style of ["default", "clean-default"] as const) {
      expect(className(style, true)).toContain("decky-metadata-hltb-flow");
      expect(className(style, false)).not.toContain("decky-metadata-hltb-flow");
    }
    for (const style of ["clean", "clean-left"] as const) {
      expect(className(style, true)).not.toContain("decky-metadata-hltb-flow");
    }
  });
  it("applies translated Vite classes and zero-specificity fallback styles when JS class modules are absent", async () => {
    const { setNativeCssClasses } = await import("../steam/nativeCssClasses");
    setNativeCssClasses({
      deckVerifiedInfo: "-gmqfyWnoYk-",
      deckVerifiedDetails: "fhlkN4HzGQc-",
      deckVerifiedFocused: "G2IDwnwNvx8-",
      menuButton: "_9bDYflwE-1c-",
    });
    try {
      const defaultTree = render({ settings: { ...DEFAULT_HLTB_SETTINGS, style: "default" } });
      const defaultButton = nodes(defaultTree).find(node => node.props.onActivate)!;
      expect(defaultButton.props.className).toContain("fhlkN4HzGQc-");
      expect(defaultButton.props.className).toContain("decky-metadata-hltb-details-button");
      const styleNode = nodes(defaultTree).find(node => node.type === "style")!;
      expect(text(styleNode)).toContain(":where(.decky-metadata-hltb-details-button)");
      const cleanTree = render({ settings: { ...DEFAULT_HLTB_SETTINGS, style: "clean" } });
      const cleanButton = nodes(cleanTree).find(node => node.props.onActivate)!;
      expect(cleanButton.props.className).toContain("_9bDYflwE-1c-");
    } finally {
      setNativeCssClasses(null);
    }
  });
  it("retries Steam class lookup on later renders and caches successful results", () => {
    const detailsModule = { DeckVerifiedInfo: "native-details-info", Details: "native-details", Focused: "native-focused" };
    const menuModule = { MenuButton: "native-menu-button", ControllerConfigButton: "native-controller-button" };
    findClassModuleMock.mockReset().mockReturnValue(undefined);
    const first = render();
    expect(nodes(first).find(node => node.props.onActivate)!.props.className).not.toContain("native-details");

    findClassModuleMock.mockImplementation((predicate: (module: Record<string, string>) => boolean) =>
      [detailsModule, menuModule].find(predicate));
    const laterDefault = render();
    expect(nodes(laterDefault).find(node => node.props.onActivate)!.props.className).toContain("native-details");
    const laterClean = render({ settings: { ...DEFAULT_HLTB_SETTINGS, style: "clean" } });
    expect(nodes(laterClean).find(node => node.props.onActivate)!.props.className).toContain("native-menu-button");
    const lookups = findClassModuleMock.mock.calls.length;
    render();
    expect(findClassModuleMock).toHaveBeenCalledTimes(lookups);
  });
});
