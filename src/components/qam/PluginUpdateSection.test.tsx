import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUpdateCandidate } from "../../types";
import type { PluginUpdateController } from "../../updater/pluginUpdateController";

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
}));

const ui = vi.hoisted(() => ({
  showModal: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (index >= harness.slots.length) {
      harness.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    }
    return [harness.slots[index], (value: unknown) => { harness.slots[index] = value; }];
  },
  useEffect: (effect: () => void | (() => void)) => {
    harness.effects.push(effect);
  },
}));

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogButton: "DialogButton",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
  Spinner: "Spinner",
  ToggleField: "ToggleField",
  showModal: ui.showModal,
  Navigation: { NavigateToExternalWeb: ui.navigate },
}));

let controller: PluginUpdateController;
vi.mock("../../updater/pluginUpdateController", () => ({
  UPDATE_CHECK_UI_TIMEOUT_MS: 120000,
  usePluginUpdateController: () => controller,
}));
vi.mock("../../updater/deckyInstaller", () => ({
  isDeckyInstallerAvailable: vi.fn(() => true),
}));
// Components are invoked as plain functions here, so the i18n hook is replaced by non-React `t`.
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useT: () => actual.t };
});

import { PluginUpdateBody, UP_TO_DATE_COOLDOWN_MS } from "./PluginUpdateSection";

const candidate = (
  action: PluginUpdateCandidate["action"] = "update",
  channel: PluginUpdateCandidate["channel"] = "stable",
): PluginUpdateCandidate => ({
  version: "0.4.0",
  tag: "v0.4.0",
  channel,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action,
});

type TestNode = { type?: unknown; props?: Record<string, unknown> };
function children(node: unknown): TestNode[] {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  const element = node as TestNode;
  return [element, ...children(element.props?.children)];
}

function text(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node !== "object") return "";
  const element = node as TestNode;
  return [text(element.props?.description), text(element.props?.children)].filter(Boolean).join(" ");
}

function runEffects() {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (typeof cleanup === "function") harness.cleanups.push(cleanup);
  }
}

function render(currentVersion = "0.3.1") {
  controller.pluginVersion = currentVersion;
  harness.cursor = 0;
  harness.effects = [];
  return PluginUpdateBody();
}

function primaryField(root: unknown) {
  return children(root).find((node) => node.type === "Field" && node.props?.label === "Software Updates");
}

function primaryButton(root: unknown) {
  return children(primaryField(root)).find((node) => node.type === "DialogButton");
}

describe("PluginUpdateBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.slots = [];
    harness.effects = [];
    harness.cleanups = [];
    controller = {
      pluginVersion: "0.3.1",
      updateChannel: "stable",
      automaticUpdateChecks: true,
      testingTabEnabled: false,
      settingsLoaded: true,
      candidate: candidate(),
      checkResult: {
        status: "available",
        checked_at: "2026-07-17T12:00:00Z",
        channel: "stable",
        candidate: candidate(),
      },
      errorMessage: null,
      checkTimedOut: false,
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      installedReleasePublishedAt: null,
      checkNow: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      setUpdateChannel: vi.fn(async () => undefined),
      setAutomaticUpdateChecks: vi.fn(async () => undefined),
      setTestingTabEnabled: vi.fn(async () => undefined),
    };
  });

  afterEach(() => {
    for (const cleanup of harness.cleanups.splice(0)) cleanup();
    vi.useRealTimers();
  });

  it("embeds update state directly into the Software Updates button like SteamOS", () => {
    // Update available -> Apply + warning icon
    const availableTree = render();
    expect(primaryField(availableTree)?.props?.icon).toBeTruthy();
    const applyBtn = primaryButton(availableTree);
    expect(text(applyBtn)).toContain("Apply");
    expect(applyBtn?.props?.disabled).toBe(false);
    (applyBtn?.props?.onClick as () => void)();
    expect(controller.install).toHaveBeenCalledWith(controller.candidate);

    // Move to stable / Revert to stable labels
    controller.candidate = candidate("move_to_stable", "stable");
    expect(text(primaryButton(render()))).toContain("Move to Stable");

    controller.candidate = candidate("downgrade_to_stable", "stable");
    const revertBtn = primaryButton(render());
    expect(text(revertBtn)).toContain("Revert to Stable");
    (revertBtn?.props?.onClick as () => void)();
    expect(ui.showModal).toHaveBeenCalledOnce();

    // Idle with no candidate -> Check For Updates
    controller.candidate = null;
    controller.checkResult = null;
    const idleTree = render();
    expect(primaryField(idleTree)?.props?.icon).toBeUndefined();
    const checkBtn = primaryButton(idleTree);
    expect(text(checkBtn)).toContain("Check For Updates");
    expect(checkBtn?.props?.disabled).toBe(false);
    (checkBtn?.props?.onClick as () => void)();
    expect(controller.checkNow).toHaveBeenCalledOnce();

    // Checking -> Checking... (disabled)
    controller.isChecking = true;
    const checkingBtn = primaryButton(render());
    expect(text(checkingBtn)).toContain("Checking...");
    expect(checkingBtn?.props?.disabled).toBe(true);
  });

  it("shows Up-to-date briefly after a clean check, then returns to Check For Updates", () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-25T12:00:00Z");
    vi.setSystemTime(now);
    controller.candidate = null;
    controller.checkResult = {
      status: "current",
      checked_at: now.toISOString(),
      channel: "stable",
    };

    render();
    runEffects();
    const duringCooldown = primaryButton(render());
    expect(text(duringCooldown)).toContain("Up-to-date");
    expect(duringCooldown?.props?.disabled).toBe(true);

    vi.advanceTimersByTime(UP_TO_DATE_COOLDOWN_MS);
    const afterCooldown = primaryButton(render());
    expect(text(afterCooldown)).toContain("Check For Updates");
    expect(afterCooldown?.props?.disabled).toBe(false);
  });

  it("disables update channel dropdown and toggles until settings load", () => {
    controller.settingsLoaded = false;
    const unloaded = children(render());
    const unloadedDropdown = unloaded.find((node) => node.type === "DropdownItem");
    const unloadedToggles = unloaded.filter((node) => node.type === "ToggleField");
    expect(unloadedDropdown?.props?.disabled).toBe(true);
    expect(unloadedToggles).toHaveLength(2);
    expect(unloadedToggles.every((toggle) => toggle.props?.disabled)).toBe(true);

    controller.settingsLoaded = true;
    const loaded = children(render());
    expect(loaded.find((node) => node.type === "DropdownItem")?.props?.disabled).toBe(false);
    expect(loaded.filter((node) => node.type === "ToggleField").every((toggle) => toggle.props?.disabled === false)).toBe(true);
  });

  it("disables update controls while installation or handoff is active", () => {
    controller.isHandoffPending = true;
    const handoffTree = render();
    const handoffNodes = children(handoffTree);
    expect(handoffNodes.find((node) => node.type === "DropdownItem")?.props?.disabled).toBe(true);
    expect(handoffNodes.filter((node) => node.type === "ToggleField").every((toggle) => toggle.props?.disabled)).toBe(true);
    expect(primaryButton(handoffTree)?.props?.disabled).toBe(true);
    expect(text(primaryButton(handoffTree))).toContain("Waiting for Decky...");

    controller.isHandoffPending = false;
    controller.isInstalling = true;
    const installingTree = render();
    const installingNodes = children(installingTree);
    expect(installingNodes.find((node) => node.type === "DropdownItem")?.props?.disabled).toBe(true);
    expect(installingNodes.filter((node) => node.type === "ToggleField").every((toggle) => toggle.props?.disabled)).toBe(true);
    expect(primaryButton(installingTree)?.props?.disabled).toBe(true);
    expect(text(primaryButton(installingTree))).toContain("Applying...");
  });

  it("shows installation failure status for non-check errors", () => {
    controller.errorMessage = "Install failed";
    controller.checkResult = null;
    expect(text(render())).toContain("Installation Failed");
  });

  it("shows rate-limit retry time and offline failure detail", () => {
    controller.candidate = null;
    controller.errorMessage = "Offline";
    controller.checkResult = {
      status: "failed",
      checked_at: "2026-07-17T12:00:00Z",
      message: "Offline",
      retry_after: "2026-07-17T12:05:00Z",
    };
    const output = text(render());
    expect(output).toContain("Failed to check");
    expect(output).toContain("Offline");
    expect(output).toContain("Try again after");
  });

  it("confirms switching the Update Channel dropdown to Development", () => {
    const dropdown = children(render()).find(
      (node) => node.type === "DropdownItem" && node.props?.label === "Update Channel",
    );
    const onChange = dropdown?.props?.onChange;
    expect(onChange).toBeTypeOf("function");
    (onChange as (option: { data: "stable" | "development" }) => void)({ data: "development" });
    const modal = ui.showModal.mock.calls[0][0] as TestNode;
    expect(modal.props?.strTitle).toBe("Enable Development Releases?");
    const onOK = modal.props?.onOK;
    expect(onOK).toBeTypeOf("function");
    (onOK as () => void)();
    expect(controller.setUpdateChannel).toHaveBeenCalledWith(true);
  });

  it("renders the Developer subsection and toggles the Testing tab", () => {
    const rendered = render();
    const headers = children(rendered).filter((node) => node.type === "DialogControlsSectionHeader");
    expect(headers.map((header) => text(header))).toContain("Developer");
    const toggle = children(rendered).find(
      (node) => node.type === "ToggleField" && node.props?.label === "Enable Testing tab",
    );
    expect(toggle?.props?.checked).toBe(false);
    (toggle?.props?.onChange as (enabled: boolean) => void)(true);
    expect(controller.setTestingTabEnabled).toHaveBeenCalledWith(true);
  });
});
