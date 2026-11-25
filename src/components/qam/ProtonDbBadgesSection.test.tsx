import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/ui", () => ({ DialogControlsSection: "DialogControlsSection", DropdownItem: "DropdownItem", Field: "Field", ToggleField: "ToggleField" }));
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
});
