import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  showModal: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  Field: "Field",
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  Spinner: "Spinner",
  ToggleField: "ToggleField",
  showModal: ui.showModal,
  Navigation: { NavigateToExternalWeb: ui.navigate },
}));

let controller: any;
vi.mock("../../updater/pluginUpdateController", () => ({
  UPDATE_CHECK_UI_TIMEOUT_MS: 120000,
  usePluginUpdateController: () => controller,
}));
vi.mock("../../updater/deckyInstaller", () => ({
  isDeckyInstallerAvailable: vi.fn(() => true),
}));

import { isDeckyInstallerAvailable } from "../../updater/deckyInstaller";
import { PluginUpdateSection } from "./PluginUpdateSection";

const candidate = (action: "update" | "downgrade_to_stable" = "update") => ({
  version: "0.4.0",
  tag: "v0.4.0",
  channel: "stable" as const,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action,
});

const props = (currentVersion = "0.3.1") => ({
  currentVersion,
  updateChannel: "stable" as const,
  automaticUpdateChecks: true,
  settingsLoaded: true,
  onToggleUpdateChannel: vi.fn(),
  onToggleAutomaticUpdateChecks: vi.fn(),
});

function render(currentVersion = "0.3.1") {
  return PluginUpdateSection(props(currentVersion));
}

function children(node: any): any[] {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  return [node, ...children(node.props?.children)];
}

function text(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return text(node.props?.children);
}

describe("PluginUpdateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDeckyInstallerAvailable).mockReturnValue(true);
    controller = {
      effectiveCurrentVersion: "0.3.1",
      candidate: candidate(),
      checkResult: {
        status: "available",
        checked_at: "2026-07-17T12:00:00Z",
        channel: "stable",
        candidate: candidate(),
      },
      errorMessage: null,
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      installedReleasePublishedAt: null,
      checkNow: vi.fn(),
      install: vi.fn(),
    };
  });

  it("suppresses self-install for a local build", () => {
    controller.effectiveCurrentVersion = "0.3.1+local";
    const tree = render("0.3.1+local");
    expect(text(tree)).toContain("(Local Build)");
    expect(text(tree)).toContain("Local builds cannot self-update");
    expect(children(tree).filter((node) => node.type === "ButtonItem").map(text)).not.toContain(
      "Update to v0.4.0"
    );
  });

  it("shows manual-install messaging when Decky installer is unavailable", () => {
    vi.mocked(isDeckyInstallerAvailable).mockReturnValue(false);
    expect(text(render())).toContain("Automatic installation is unavailable");
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
    const componentProps = props();
    const tree = PluginUpdateSection(componentProps);
    const toggle = children(tree).find(
      (node) => node.type === "ToggleField" && node.props.label === "Receive development releases"
    );
    toggle.props.onChange(true);
    const modal = ui.showModal.mock.calls[0][0];
    expect(modal.props.strTitle).toBe("Enable Development Releases?");
    modal.props.onOK();
    expect(componentProps.onToggleUpdateChannel).toHaveBeenCalledWith(true);
  });

  it("confirms a downgrade to stable", () => {
    controller.candidate = candidate("downgrade_to_stable");
    const tree = render();
    const button = children(tree).find(
      (node) => node.type === "ButtonItem" && text(node).includes("Revert to Stable")
    );
    button.props.onClick();
    const modal = ui.showModal.mock.calls[0][0];
    expect(modal.props.strTitle).toBe("Revert to Stable?");
    modal.props.onOK();
    expect(controller.install).toHaveBeenCalledWith(controller.candidate);
  });
});
