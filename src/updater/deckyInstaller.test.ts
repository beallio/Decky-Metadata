import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../backend", () => ({ frontendLog: vi.fn(() => Promise.resolve(true)) }));

import { frontendLog } from "../backend";
import {
  INSTALL_TYPE_DOWNGRADE,
  INSTALL_TYPE_UPDATE,
  invokeDeckyInstaller,
  isDeckyInstallerAvailable,
} from "./deckyInstaller";

describe("Decky installer bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).window = {};
  });

  it("is unavailable without DeckyBackend", () => {
    expect(isDeckyInstallerAvailable()).toBe(false);
  });

  it("prefers the callable API shape", async () => {
    const install = vi.fn().mockResolvedValue("ok");
    (window as any).DeckyBackend = {
      callable: vi.fn(() => install),
      call: vi.fn(),
    };
    await expect(invokeDeckyInstaller("zip", "0.4.0", "a".repeat(64), INSTALL_TYPE_UPDATE)).resolves.toBe("ok");
    expect(install).toHaveBeenCalledWith("zip", "Decky Metadata", "0.4.0", "a".repeat(64), 2);
    expect(frontendLog).toHaveBeenCalledWith("update", expect.any(String), null, "info");
  });

  it("falls back to the call API shape", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    (window as any).DeckyBackend = { callable: undefined, call };
    await invokeDeckyInstaller("zip", "0.4.0", "b".repeat(64), INSTALL_TYPE_DOWNGRADE);
    expect(call).toHaveBeenCalledWith(
      "utilities/install_plugin",
      "zip",
      "Decky Metadata",
      "0.4.0",
      "b".repeat(64),
      3
    );
  });
});
