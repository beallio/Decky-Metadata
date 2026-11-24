import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUpdateCandidate } from "../../types";
import type { PluginUpdateController } from "../../updater/pluginUpdateController";

const ui = vi.hoisted(() => ({
  showModal: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogControlsSection: "DialogControlsSection",
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

import { PluginUpdateBody } from "./PluginUpdateSection";

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
  return text((node as TestNode).props?.children);
}

function render(currentVersion = "0.3.1") {
  controller.effectiveCurrentVersion = currentVersion;
  return PluginUpdateBody();
}

describe("PluginUpdateBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controller = {
      pluginVersion: "0.3.1",
      effectiveCurrentVersion: "0.3.1",
      updateChannel: "stable",
      automaticUpdateChecks: true,
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
    };
  });

  it("disables both update-setting toggles until settings load", () => {
    controller.settingsLoaded = false;
    const unloaded = children(render()).filter((node) => node.type === "ToggleField");
    expect(unloaded).toHaveLength(2);
    expect(unloaded.every((toggle) => toggle.props?.disabled)).toBe(true);

    controller.settingsLoaded = true;
    const loaded = children(render()).filter((node) => node.type === "ToggleField");
    expect(loaded.every((toggle) => toggle.props?.disabled === false)).toBe(true);

  });

  it("disables update controls while installation or handoff is active", () => {
    controller.isHandoffPending = true;
    const nodes = children(render());
    expect(nodes.filter((node) => node.type === "ToggleField").every((toggle) => toggle.props?.disabled)).toBe(true);
    const check = nodes.find((node) => node.type === "ButtonItem" && node.props?.label === "Check now");
    expect(check?.props?.disabled).toBe(true);

    controller.isHandoffPending = false;
    controller.isInstalling = true;
    const installingNodes = children(render());
    expect(installingNodes.filter((node) => node.type === "ToggleField").every((toggle) => toggle.props?.disabled)).toBe(true);
    expect(installingNodes.find((node) => node.type === "ButtonItem" && node.props?.label === "Check now")?.props?.disabled).toBe(true);
  });

  it("shows installation failure status for non-check errors", () => {
    controller.errorMessage = "Install failed";
    controller.checkResult = null;
    expect(text(render())).toContain("Installation Failed");
  });


  it("shows rate-limit retry time and offline failure detail", () => {
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

  it("confirms enabling development releases", () => {
    const toggle = children(render()).find(
      (node) => node.type === "ToggleField" && node.props?.label === "Receive development releases"
    );
    const onChange = toggle?.props?.onChange;
    expect(onChange).toBeTypeOf("function");
    (onChange as (enabled: boolean) => void)(true);
    const modal = ui.showModal.mock.calls[0][0] as TestNode;
    expect(modal.props?.strTitle).toBe("Enable Development Releases?");
    const onOK = modal.props?.onOK;
    expect(onOK).toBeTypeOf("function");
    (onOK as () => void)();
    expect(controller.setUpdateChannel).toHaveBeenCalledWith(true);
  });
});
