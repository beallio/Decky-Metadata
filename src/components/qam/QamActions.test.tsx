import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUpdateCandidate } from "../../types";

const controller = vi.hoisted(() => ({
  snapshot: {
    pluginVersion: "0.3.1",
    candidate: null as PluginUpdateCandidate | null,
    isChecking: false,
    isInstalling: false,
    isHandoffPending: false,
    install: vi.fn(),
  },
}));

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
  showModal: vi.fn(),
}));
vi.mock("../../updater/deckyInstaller", () => ({ isDeckyInstallerAvailable: vi.fn(() => true) }));
vi.mock("../../updater/pluginUpdateController", () => ({
  usePluginUpdateController: () => controller.snapshot,
}));
vi.mock("../../i18n", () => ({ useT: () => (key: string) => key }));

import { PluginInstallAction } from "../../updater/installAction";
import { QamInstallRow } from "./QamActions";

const candidate = (channel: "stable" | "development" = "stable"): PluginUpdateCandidate => ({
  version: "0.4.0",
  tag: "v0.4.0",
  channel,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action: "update",
});

type TestNode = { type?: unknown; props?: { children?: unknown; [key: string]: unknown } };
const children = (node: unknown): TestNode[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  const element = node as TestNode;
  return [element, ...children(element.props?.children)];
};

beforeEach(() => {
  vi.clearAllMocks();
  controller.snapshot = {
    ...controller.snapshot,
    pluginVersion: "0.3.1",
    candidate: null,
    isChecking: false,
    isInstalling: false,
    isHandoffPending: false,
  };
});

describe("QAM actions", () => {
  it("hides the install row when there is no candidate", () => {
    expect(QamInstallRow()).toBeNull();
  });

  it("hides the install row for a local build with a development candidate", () => {
    controller.snapshot = {
      ...controller.snapshot,
      pluginVersion: "0.3.1+build",
      candidate: candidate("development"),
    };

    expect(QamInstallRow()).toBeNull();
  });

  it("shows the shared install action for an installable candidate", () => {
    const update = candidate();
    controller.snapshot = { ...controller.snapshot, candidate: update };

    const row = QamInstallRow();
    if (!row) throw new Error("Installable candidate did not render");
    expect(row.type).toBe(PluginInstallAction);
    expect(row.props).toMatchObject({
      candidate: update,
      currentVersion: "0.3.1",
      isChecking: false,
      isInstalling: false,
      isHandoffPending: false,
      onInstall: controller.snapshot.install,
    });
  });
});
