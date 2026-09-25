import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ToggleField: "ToggleField",
}));
vi.mock("../../styles", () => ({ inlineStatusStyle: () => ({}) }));

import { GameTrailersSection } from "./GameTrailersSection";
import type { TrailerControllerSnapshot } from "../../trailers/controller";

const children = (node: unknown): any[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  const element = node as any;
  return [element, ...children(element.props?.children)];
};

const state = (overrides: Partial<TrailerControllerSnapshot> = {}): TrailerControllerSnapshot => ({
  settings: { enabled: false, audioEnabled: false, quality: "auto" },
  status: "Disabled",
  displayWidth: 1280,
  displayHeight: 800,
  targetHeight: 720,
  settingsLoaded: true,
  busy: false,
  settingsError: "",
  matchRevision: 0,
  ...overrides,
});

describe("GameTrailersSection", () => {
  it("shows exactly three controls and leaves audio editable while disabled", () => {
    const tree = GameTrailersSection({
      state: state(),
      onEnabledChange: vi.fn(),
      onAudioChange: vi.fn(),
      onQualityChange: vi.fn(),
      onQualityMenuWillOpen: vi.fn(),
      onQualityControlRef: vi.fn(),
    });
    const nodes = children(tree);
    const toggles = nodes.filter((node) => node.type === "ToggleField");
    const quality = nodes.find((node) => node.type === "DropdownItem");
    expect(toggles.map((node) => node.props.label)).toEqual(["Enabled", "Trailer audio"]);
    expect(toggles[1].props.disabled).toBe(false);
    expect(quality?.props.label).toBe("Video quality");
    expect(quality?.props.rgOptions).toEqual([
      { data: "auto", label: "Auto — match display" },
      { data: 720, label: "720p" },
      { data: 1080, label: "1080p" },
      { data: 1440, label: "1440p" },
      { data: 2160, label: "2160p" },
    ]);
  });

  it("shows the physical Big Picture size, target and original-art/offline guidance", () => {
    const onQualityMenuWillOpen = vi.fn();
    const onQualityControlRef = vi.fn();
    const tree = GameTrailersSection({
      state: state({ status: "Waiting for the matching Steam hero" }),
      onEnabledChange: vi.fn(),
      onAudioChange: vi.fn(),
      onQualityChange: vi.fn(),
      onQualityMenuWillOpen,
      onQualityControlRef,
    });
    const nodes = children(tree);
    expect(nodes.some((node) => node.type === "Field" && node.props.label === "Big Picture display"
      && node.props.description === "Waiting for the matching Steam hero")).toBe(true);
    expect(nodes.some((node) => Array.isArray(node.props.children)
      && node.props.children.join("") === "1280 × 800 pixels · target 720p")).toBe(true);
    expect(JSON.stringify(tree)).toContain("Steam artwork stays visible");
    expect(JSON.stringify(tree)).toContain("not saved for offline playback");
    const quality = nodes.find((node) => node.type === "DropdownItem");
    quality.props.onMenuWillOpen();
    expect(onQualityMenuWillOpen).toHaveBeenCalledOnce();
    expect(nodes.some((node) => node.type === "div" && node.props.ref === onQualityControlRef)).toBe(true);
  });
});
