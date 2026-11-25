import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection",
  Field: "Field",
  ToggleField: "ToggleField",
}));
vi.mock("../../styles", () => ({ inlineStatusStyle: () => ({}) }));
vi.mock("../../pluginConflicts", () => ({ featureConflictNotice: () => null }));
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...actual, useT: () => actual.t };
});

import type { MiniAchievementsSnapshot } from "../../steam/miniAchievementsController";
import { MiniAchievementsBody } from "./MiniAchievementsSection";

const nodes = (node: ReactNode): ReactElement<any>[] => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<any>(node)) return [];
  return [node, ...nodes(node.props.children)];
};

const snapshot: MiniAchievementsSnapshot = {
  enabled: false,
  conflict: { pluginName: null, detectionAvailable: true },
  effectiveEnabled: false,
  settingsLoaded: true,
  busy: false,
  settingsError: "",
};

describe("MiniAchievementsBody", () => {
  it("passes the new enabled value to the callback", () => {
    const onEnabledChange = vi.fn();
    const toggle = nodes(MiniAchievementsBody({ state: snapshot, onEnabledChange }))
      .find((node) => node.type === "ToggleField");

    toggle?.props.onChange(true);

    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("disables the toggle while settings are unavailable or busy", () => {
    expect(nodes(MiniAchievementsBody({ state: { ...snapshot, settingsLoaded: false }, onEnabledChange: vi.fn() }))
      .find((node) => node.type === "ToggleField")?.props.disabled).toBe(true);
    expect(nodes(MiniAchievementsBody({ state: { ...snapshot, busy: true }, onEnabledChange: vi.fn() }))
      .find((node) => node.type === "ToggleField")?.props.disabled).toBe(true);
  });
});
