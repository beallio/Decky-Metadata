import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DropdownItem: "DropdownItem",
  Field: "Field",
  ToggleField: "ToggleField",
}));
// The component is called as a plain function here, so the hook is stubbed with the same translator.
vi.mock("../../i18n", async (importOriginal) => {
  const i18n = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...i18n, useT: () => i18n.t };
});
import type { ProtonDbBadgeSettings } from "../../types";
import { ProtonDbBadgesBody } from "./ProtonDbBadgesSection";

function nodes(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<any>(node)) return [];
  return [node, ...nodes(node.props.children)];
}

const render = (overrides: Partial<ProtonDbBadgeSettings> = {}, settingsLoaded = true) => {
  const settings: ProtonDbBadgeSettings = {
    enabled: true,
    home: true,
    library: true,
    gameView: true,
    store: true,
    focusOnly: false,
    coverPosition: "bottom-left",
    ...overrides,
  };
  return nodes(ProtonDbBadgesBody({
    snapshot: {
      settings,
      settingsLoaded,
      busy: false,
      settingsError: "",
      conflict: { pluginName: null, detectionAvailable: true },
      effectiveEnabled: settings.enabled,
    },
    onSettingsChange: vi.fn(),
    onCoverPositionChange: vi.fn(),
  }));
};

describe("ProtonDB badge controls", () => {
  it("keeps two changes made in the same task", () => {
    let latest: ProtonDbBadgeSettings = {
      enabled: true, home: true, library: true, gameView: true, store: true, focusOnly: false, coverPosition: "bottom-left",
    };
    const save = (update: (current: ProtonDbBadgeSettings) => ProtonDbBadgeSettings) => { latest = update(latest); };
    const tree = nodes(ProtonDbBadgesBody({
      snapshot: {
        settings: latest, settingsLoaded: true, busy: false, settingsError: "",
        conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: true,
      },
      onSettingsChange: save,
      onCoverPositionChange: vi.fn(),
    }));
    tree.find(node => node.props.label === "Home game covers")!.props.onChange(false);
    tree.find(node => node.props.label === "Game view")!.props.onChange(false);
    expect(latest.home).toBe(false);
    expect(latest.gameView).toBe(false);
  });

  it("places Game view and Store below Enable and groups cover controls under a Game covers subsection", () => {
    const tree = render();
    const sections = tree.filter(node => node.type === "DialogControlsSection");
    expect(sections).toHaveLength(2);

    const topLabels = nodes(sections[0]).filter(n => n.type === "ToggleField" || n.type === "DropdownItem").map(n => n.props.label);
    expect(topLabels).toEqual(["Enable ProtonDB badges", "Game view", "Store"]);

    const header = nodes(sections[1]).find(n => n.type === "DialogControlsSectionHeader");
    expect(header?.props.children).toBe("Game covers");
    const coverLabels = nodes(sections[1]).filter(n => n.type === "ToggleField" || n.type === "DropdownItem").map(n => n.props.label);
    expect(coverLabels).toEqual([
      "Home game covers",
      "Library game covers",
      "Covers only on focus or hover",
      "Cover badge position",
    ]);
  });

  it("enables Covers only on focus or hover and Cover badge position only when Home and/or Library game covers is on", () => {
    const coverControlsDisabled = (overrides: Partial<ProtonDbBadgeSettings>) => {
      const tree = render(overrides);
      return [
        tree.find(n => n.props.label === "Covers only on focus or hover")!.props.disabled,
        tree.find(n => n.props.label === "Cover badge position")!.props.disabled,
      ];
    };

    expect(coverControlsDisabled({ enabled: true, home: false, library: false })).toEqual([true, true]);
    expect(coverControlsDisabled({ enabled: true, home: true, library: false })).toEqual([false, false]);
    expect(coverControlsDisabled({ enabled: true, home: false, library: true })).toEqual([false, false]);
    expect(coverControlsDisabled({ enabled: true, home: true, library: true })).toEqual([false, false]);
    expect(coverControlsDisabled({ enabled: false, home: true, library: true })).toEqual([true, true]);
  });
});
