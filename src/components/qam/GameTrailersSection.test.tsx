import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DropdownItem: "DropdownItem",
  Field: "Field",
  SliderField: "SliderField",
  ToggleField: "ToggleField",
}));
vi.mock("../../styles", () => ({ inlineStatusStyle: () => ({}) }));
vi.mock("../../pluginConflicts", () => ({ featureConflictNotice: () => null }));
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...actual, useT: () => actual.t };
});

import type { TrailerControllerSnapshot } from "../../trailers/controller";
import { GameTrailersBody } from "./GameTrailersSection";

type ControlProps = { children?: ReactNode; description?: ReactNode; disabled?: boolean; label?: string };

const nodes = (node: ReactNode): ReactElement<ControlProps>[] => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<ControlProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
};

const snapshot = (
  enabled: boolean,
  busy = false,
  settingsLoaded = true,
  overrides: Partial<TrailerControllerSnapshot["settings"]> = {},
  status = "Disabled",
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
    ...overrides,
  },
  status,
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

  it("places Video quality and Big Picture display below Enable trailers, followed by Detail view and Home view", () => {
    const sections = nodes(render(snapshot(true))).filter((node) => node.type === "DialogControlsSection");
    expect(sections).toHaveLength(3);
    const headerOf = (section: ReactElement<ControlProps>) =>
      nodes(section).find((node) => node.type === "DialogControlsSectionHeader")?.props.children ?? null;
    const labelsOf = (section: ReactElement<ControlProps>) =>
      nodes(section)
        .filter((node) => ["ToggleField", "DropdownItem", "SliderField", "Field"].includes(String(node.type)))
        .map((node) => node.props.label);

    expect(sections.map(headerOf)).toEqual([null, "Detail view", "Home view"]);
    expect(labelsOf(sections[0])).toEqual(["Enable trailers", "Video quality", "Big Picture display"]);
    expect(labelsOf(sections[1])).toEqual([
      "Detail view trailers",
      "Detail fade-in delay",
      "Detail trailer audio",
      "Hide game logo during Detail trailers",
    ]);
    expect(labelsOf(sections[2])).toEqual(["Home view trailers", "Home fade-in delay"]);
  });

  it("disables Detail and Home connected controls when their respective view toggle is off", () => {
    const controlByLabel = (tree: ReactNode, label: string) =>
      nodes(tree).find((node) => node.props.label === label)!;

    const detailOff = render(snapshot(true, false, true, { detailEnabled: false, homeEnabled: true }));
    expect(controlByLabel(detailOff, "Detail view trailers").props.disabled).toBe(false);
    expect(controlByLabel(detailOff, "Detail fade-in delay").props.disabled).toBe(true);
    expect(controlByLabel(detailOff, "Detail trailer audio").props.disabled).toBe(true);
    expect(controlByLabel(detailOff, "Hide game logo during Detail trailers").props.disabled).toBe(true);
    expect(controlByLabel(detailOff, "Home view trailers").props.disabled).toBe(false);
    expect(controlByLabel(detailOff, "Home fade-in delay").props.disabled).toBe(false);

    const homeOff = render(snapshot(true, false, true, { detailEnabled: true, homeEnabled: false }));
    expect(controlByLabel(homeOff, "Detail fade-in delay").props.disabled).toBe(false);
    expect(controlByLabel(homeOff, "Detail trailer audio").props.disabled).toBe(false);
    expect(controlByLabel(homeOff, "Hide game logo during Detail trailers").props.disabled).toBe(false);
    expect(controlByLabel(homeOff, "Home view trailers").props.disabled).toBe(false);
    expect(controlByLabel(homeOff, "Home fade-in delay").props.disabled).toBe(true);
  });

  it("shows Big Picture display description only for actionable warnings or errors", () => {
    const displayField = (status: string) =>
      nodes(render(snapshot(true, false, true, {}, status))).find((node) => node.props.label === "Big Picture display")!;

    expect(displayField("Waiting for a game page or Home selection").props.description).toBeUndefined();
    expect(displayField("Disabled").props.description).toBeUndefined();
    expect(displayField("Steam UI unavailable").props.description).toBe("Steam UI unavailable");
    expect(displayField("Another trailer plugin is still active. Disable it and reload Steam UI before using Metadata trailers.").props.description)
      .toBe("Another trailer plugin is still active. Disable it and reload Steam UI before using Metadata trailers.");
  });
});
