import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUpdateCandidate } from "../types";

const ui = vi.hoisted(() => ({ showModal: vi.fn() }));
vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
  showModal: ui.showModal,
}));
vi.mock("./deckyInstaller", () => ({
  isDeckyInstallerAvailable: vi.fn(() => true),
}));
vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useT: () => actual.t };
});

import { isDeckyInstallerAvailable } from "./deckyInstaller";
import { canInstallCandidate, PluginInstallAction } from "./installAction";

const candidate = (
  channel: "stable" | "development" = "stable",
  action?: PluginUpdateCandidate["action"]
): PluginUpdateCandidate => ({
  version: "0.4.0",
  tag: "v0.4.0",
  channel,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action: action ?? (channel === "development" ? "update" : "downgrade_to_stable"),
});
type TestNode = { type?: unknown; props?: { children?: unknown; [key: string]: unknown } };
const children = (node: unknown): TestNode[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  const element = node as TestNode;
  return [element, ...children(element.props?.children)];
};
const text = (node: unknown): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node !== "object") return "";
  return text((node as TestNode).props?.children);
};

describe("PluginInstallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDeckyInstallerAvailable).mockReturnValue(true);
  });
  it("shares the installer and local-build rules with the QAM", () => {
    const stable = candidate("stable");
    const development = candidate("development");

    expect(canInstallCandidate(stable, "0.3.1+local")).toBe(true);
    expect(canInstallCandidate(development, "0.3.1+local")).toBe(false);
    vi.mocked(isDeckyInstallerAvailable).mockReturnValue(false);
    expect(canInstallCandidate(stable, "0.3.1")).toBe(false);
  });


  it("asks for confirmation before installing a downgrade", () => {
    const update = candidate();
    const onInstall = vi.fn();
    const tree = PluginInstallAction({
      candidate: update,
      currentVersion: "0.4.1",
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      onInstall,
    });
    const button = children(tree).find(
      (node) => node.type === "ButtonItem" && text(node).includes("Revert to Stable")
    );
    const onClick = button?.props?.onClick;
    expect(onClick).toBeTypeOf("function");
    (onClick as () => void)();
    const modal = ui.showModal.mock.calls[0][0] as TestNode;
    expect(modal.props?.strTitle).toBe("Revert to Stable?");
    const onOk = modal.props?.onOK;
    expect(onOk).toBeTypeOf("function");
    (onOk as () => void)();
    expect(onInstall).toHaveBeenCalledWith(update);
  });
  it("allows local builds to install stable releases", () => {
    const tree = PluginInstallAction({
      candidate: candidate("stable", "move_to_stable"),
      currentVersion: "0.3.1+local",
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      onInstall: vi.fn(),
    });
    expect(text(tree)).toContain("Move to Stable");
  });

  it("shows manual-install messaging when Decky installer is unavailable", () => {
    vi.mocked(isDeckyInstallerAvailable).mockReturnValue(false);
    const tree = PluginInstallAction({
      candidate: candidate(),
      currentVersion: "0.3.1",
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      onInstall: vi.fn(),
    });
    expect(text(tree)).toContain("Automatic installation is unavailable");
  });

  it("hides installation for a local build with a development candidate", () => {
    const tree = PluginInstallAction({
      candidate: candidate("development"),
      currentVersion: "0.3.1+local",
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      onInstall: vi.fn(),
    });
    expect(children(tree).some((node) => node.type === "ButtonItem")).toBe(false);
    expect(text(tree)).toContain("Local builds can only self-update to a stable release");
  });
});
