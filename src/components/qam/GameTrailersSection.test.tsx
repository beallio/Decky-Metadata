import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
  SliderField: "SliderField",
  ToggleField: "ToggleField",
}));
vi.mock("../../styles", () => ({ inlineStatusStyle: () => ({}), sectionHeadingStyle: {} }));
vi.mock("../../pluginConflicts", () => ({ featureConflictNotice: () => null }));
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...actual, useT: () => actual.t };
});

import type { TrailerControllerSnapshot } from "../../trailers/controller";
import { GameTrailersBody } from "./GameTrailersSection";

type ControlProps = { children?: ReactNode; disabled?: boolean };

const nodes = (node: ReactNode): ReactElement<ControlProps>[] => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<ControlProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
};

const snapshot = (
  enabled: boolean,
  busy = false,
  settingsLoaded = true,
): TrailerControllerSnapshot => ({
  settings: {
    enabled,
    detailEnabled: true,
    homeEnabled: true,
    audioEnabled: true,
    hideLogoDuringTrailer: true,
    quality: "auto",
    detailFadeInDelaySeconds: 3,
    homeFadeInDelaySeconds: 4,
  },
  status: "Disabled",
  displayWidth: 1280,
  displayHeight: 720,
  targetHeight: 720,
  settingsLoaded,
  busy,
  settingsError: "",
  matchRevision: 0,
  conflict: { pluginName: null, detectionAvailable: true },
  effectiveEnabled: enabled,
});

const render = (state: TrailerControllerSnapshot) => GameTrailersBody({
  state,
  onEnabledChange: vi.fn(),
  onDetailEnabledChange: vi.fn(),
  onHomeEnabledChange: vi.fn(),
  onAudioChange: vi.fn(),
  onHideLogoChange: vi.fn(),
  onDetailFadeInDelayChange: vi.fn(),
  onHomeFadeInDelayChange: vi.fn(),
  onQualityChange: vi.fn(),
});

const dependentControls = (tree: ReactNode) => {
  const all = nodes(tree);
  const toggles = all.filter((node) => node.type === "ToggleField");
  return [
    ...toggles.slice(1),
    ...all.filter((node) => node.type === "SliderField" || node.type === "DropdownItem"),
  ];
};

describe("GameTrailersBody dependent controls", () => {
  it("disables every dependent control while trailers are off", () => {
    const tree = nodes(render(snapshot(false)));
    const toggles = tree.filter((node) => node.type === "ToggleField");
    expect(toggles[0].props.disabled).toBe(false);
    expect(dependentControls(render(snapshot(false))).map((node) => node.props.disabled))
      .toEqual([true, true, true, true, true, true, true]);
  });

  it("enables dependent controls only when settings are loaded and idle", () => {
    expect(dependentControls(render(snapshot(true))).every((node) => !node.props.disabled)).toBe(true);
    expect(dependentControls(render(snapshot(true, true))).every((node) => node.props.disabled)).toBe(true);
    expect(dependentControls(render(snapshot(true, false, false))).every((node) => node.props.disabled)).toBe(true);
  });
});
