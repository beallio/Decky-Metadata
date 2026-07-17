import { frontendLog } from "../backend";

declare global {
  interface Window {
    DeckyBackend?: {
      callable: (method: string) => (...args: any[]) => Promise<any>;
      call?: (method: string, ...args: any[]) => Promise<any>;
    };
  }
}

// Must equal plugin.json "name" (Decky's find_plugin_folder identity). Space,
// not hyphen — asset filenames stay hyphenated, this is the plugin identity.
const EXPECTED_PLUGIN_NAME = "Decky Metadata";
export const INSTALL_TYPE_UPDATE = 2;
export const INSTALL_TYPE_DOWNGRADE = 3;

export function isDeckyInstallerAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.DeckyBackend === "object" &&
    window.DeckyBackend !== null &&
    (typeof window.DeckyBackend.callable === "function" ||
      typeof window.DeckyBackend.call === "function")
  );
}

export async function invokeDeckyInstaller(
  url: string,
  version: string,
  sha256: string,
  installType: typeof INSTALL_TYPE_UPDATE | typeof INSTALL_TYPE_DOWNGRADE,
  traceId?: string
): Promise<any> {
  const start = performance.now();
  const backend = window.DeckyBackend;
  if (!backend) {
    throw new Error("Decky Loader backend is not available in this environment.");
  }

  const shaPrefix = sha256.slice(0, 8);
  const logHandoff = (api: "callable" | "call") => {
    const elapsed = Math.round(performance.now() - start);
    const message =
      `handoff_start: trace_id=${traceId || "none"}, version=${version}, ` +
      `sha256_prefix=${shaPrefix}, installer_api=${api}, elapsed_ms=${elapsed}`;
    void frontendLog("update", message, null, "info").catch(() => {});
  };

  if (typeof backend.callable === "function") {
    logHandoff("callable");
    const install = backend.callable("utilities/install_plugin");
    return await install(url, EXPECTED_PLUGIN_NAME, version, sha256, installType);
  }
  if (typeof backend.call === "function") {
    logHandoff("call");
    return await backend.call(
      "utilities/install_plugin",
      url,
      EXPECTED_PLUGIN_NAME,
      version,
      sha256,
      installType
    );
  }
  throw new Error("Decky Loader backend has no compatible RPC interface.");
}
