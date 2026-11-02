import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/ui", () => ({ DialogButtonPrimary: "button", Navigation: { NavigateToExternalWeb: vi.fn() } }));
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
    expect(text(tree)).toContain("1.0 hours");
    expect(text(tree)).toContain("1.5 hours");
    expect(text(tree)).toContain("-- hours");
    const button = nodes(tree).find(node => node.type === "button")!;
    button.props.onClick();
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
    expect(nodes(tree).find(node => node.type === "button")).toBeUndefined();
  });
});
