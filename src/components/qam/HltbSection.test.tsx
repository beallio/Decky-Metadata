import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/ui", () => ({ ButtonItem: "ButtonItem", DropdownItem: "DropdownItem", Field: "Field", PanelSectionRow: "PanelSectionRow", SliderField: "SliderField", ToggleField: "ToggleField" }));
vi.mock("./CollapsibleSection", () => ({ CollapsibleSection: "CollapsibleSection" }));
// The component is called as a plain function here, so the hook is stubbed with the same translator.
vi.mock("../../i18n", async (importOriginal) => {
  const i18n = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...i18n, useT: () => i18n.t };
});
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
  it("wires the Store info row toggle to the setting", () => {
    const change = vi.fn();
    const settings = { ...DEFAULT_HLTB_SETTINGS, enabled: true, store: false };
    const tree = nodes(HltbSection({ settings, settingsLoaded: true, busy: false, conflict: { pluginName: null, detectionAvailable: true }, onSettingsChange: change, onClearCache: vi.fn() }));
    const toggle = tree.find(node => node.props.label === "Store")!;
    expect(toggle.props.checked).toBe(false);
    toggle.props.onChange(true);
    expect(change).toHaveBeenCalledWith({ ...settings, store: true });
  });
  it("offers blur, and no opacity, for clean styles", () => {
    const change = vi.fn();
    const settings = { ...DEFAULT_HLTB_SETTINGS, enabled: true, style: "clean-default" as const, appearance: { ...DEFAULT_HLTB_SETTINGS.appearance, custom: true } };
    const tree = nodes(HltbSection({ settings, settingsLoaded: true, busy: false, conflict: { pluginName: null, detectionAvailable: true }, onSettingsChange: change, onClearCache: vi.fn() }));
    tree.find(node => node.props.label === "Background blur")!.props.onChange({ data: "blur" });
    expect(change).toHaveBeenCalledWith({ ...settings, appearance: { ...settings.appearance, blur: "blur" } });
    expect(tree.some(node => node.props.label === "Background opacity")).toBe(false);
  });
  it("offers pushing Play down only for the bottom styles", () => {
    const change = vi.fn();
    const tree = (style: (typeof DEFAULT_HLTB_SETTINGS)["style"]) => nodes(HltbSection({
      settings: { ...DEFAULT_HLTB_SETTINGS, enabled: true, style }, settingsLoaded: true, busy: false,
      conflict: { pluginName: null, detectionAvailable: true }, onSettingsChange: change, onClearCache: vi.fn(),
    }));
    for (const style of ["clean", "clean-left"] as const) {
      expect(tree(style).some(node => node.props.label === "Push Play button down")).toBe(false);
    }
    for (const style of ["default", "clean-default"] as const) {
      const toggle = tree(style).find(node => node.props.label === "Push Play button down")!;
      expect(toggle.props.checked).toBe(false);
      toggle.props.onChange(true);
      expect(change).toHaveBeenLastCalledWith({ ...DEFAULT_HLTB_SETTINGS, enabled: true, style, pushPlayDown: true });
    }
  });
  it("offers keeping Play above the footer only while pushing Play down", () => {
    const change = vi.fn();
    const tree = (settings: Partial<typeof DEFAULT_HLTB_SETTINGS> = {}) => nodes(HltbSection({
      settings: { ...DEFAULT_HLTB_SETTINGS, enabled: true, ...settings }, settingsLoaded: true, busy: false,
      conflict: { pluginName: null, detectionAvailable: true }, onSettingsChange: change, onClearCache: vi.fn(),
    }));
    const label = "Keep Play above the footer";
    for (const style of ["clean", "clean-left"] as const) {
      expect(tree({ style }).some(node => node.props.label === label)).toBe(false);
    }
    for (const style of ["default", "clean-default"] as const) {
      expect(tree({ style }).find(node => node.props.label === label)!.props.disabled).toBe(true);
    }
    const settings = { ...DEFAULT_HLTB_SETTINGS, enabled: true, pushPlayDown: true, style: "default" as const };
    const toggle = nodes(HltbSection({
      settings, settingsLoaded: true, busy: false, conflict: { pluginName: null, detectionAvailable: true },
      onSettingsChange: change, onClearCache: vi.fn(),
    })).find(node => node.props.label === label)!;
    expect(toggle.props.checked).toBe(true);
    expect(toggle.props.disabled).toBe(false);
    toggle.props.onChange(false);
    expect(change).toHaveBeenLastCalledWith({ ...settings, respectMenuBar: false });
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
