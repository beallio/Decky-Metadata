import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/ui", () => ({ ButtonItem: "ButtonItem", DropdownItem: "DropdownItem", Field: "Field", PanelSectionRow: "PanelSectionRow", SliderField: "SliderField", ToggleField: "ToggleField" }));
vi.mock("./CollapsibleSection", () => ({ CollapsibleSection: "CollapsibleSection" }));
import { DEFAULT_HLTB_SETTINGS } from "../../hltb/settings";
import { HltbSection } from "./HltbSection";

function nodes(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<any>(node)) return [];
  return [node, ...nodes(node.props.children)];
}

describe("HLTB controls", () => {
  it("blocks enabling a conflicting plugin, but allows turning off a saved setting", () => {
    const base = { settings: DEFAULT_HLTB_SETTINGS, settingsLoaded: true, busy: false, conflict: { pluginName: "HLTB for Deck", detectionAvailable: true }, onSettingsChange: vi.fn(), onClearCache: vi.fn() };
    const toggle = (settings = base.settings) => nodes(HltbSection({ ...base, settings })).find(node => node.props.label === "Show HowLongToBeat times")!;
    expect(toggle().props.disabled).toBe(true);
    expect(toggle({ ...base.settings, enabled: true }).props.disabled).toBe(false);
  });
  it("updates appearance, resets it, and clears the cache", () => {
    const change = vi.fn(), clear = vi.fn();
    const settings = { ...DEFAULT_HLTB_SETTINGS, enabled: true, appearance: { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true } };
    const tree = nodes(HltbSection({ settings, settingsLoaded: true, busy: false, conflict: { pluginName: null, detectionAvailable: true }, onSettingsChange: change, onClearCache: clear }));
    tree.find(node => node.props.label === "Background opacity")!.props.onChange(40);
    expect(change).toHaveBeenCalledWith({ ...settings, appearance: { ...settings.appearance, barAlpha: 40 } });
    tree.find(node => node.type === "ButtonItem" && node.props.children === "Reset appearance")!.props.onClick();
    expect(change).toHaveBeenLastCalledWith({ ...settings, appearance: { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true } });
    tree.find(node => node.type === "ButtonItem" && node.props.children === "Clear HLTB cache")!.props.onClick();
    expect(clear).toHaveBeenCalledOnce();
  });
});
