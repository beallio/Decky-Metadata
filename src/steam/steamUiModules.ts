import { findModuleChild } from "@decky/ui";
import { steamUiWindow } from "./steamUiHost";

type WebpackRequire = ((moduleId: string) => unknown) & {
  m: Record<string, unknown>;
};
type ModuleChildFinder = (predicate: (module: unknown) => unknown) => unknown;

const isWebpackRequire = (value: unknown): value is WebpackRequire =>
  typeof value === "function" && "m" in value &&
  typeof value.m === "object" && value.m !== null && !Array.isArray(value.m);

/** Inspect webpack factories, never observable Steam stores or render-time state. */
export const findSteamModulesBySource = (fragments: string[]): unknown[] => {
  const host = steamUiWindow();
  const chunks = "webpackChunksteamui" in host ? host.webpackChunksteamui : undefined;
  if (!Array.isArray(chunks)) return [];
  let webpackRequire: WebpackRequire | undefined;
  try {
    chunks.push([[Symbol("decky-metadata-native-module")], {}, (requireFn: unknown) => {
      if (isWebpackRequire(requireFn)) webpackRequire = requireFn;
    }]);
    const requireModule = webpackRequire;
    if (!requireModule) return [];
    const moduleIds = Object.keys(requireModule.m).filter((id) => {
      const factory = requireModule.m[id];
      const source = typeof factory === "function" ? factory.toString() : "";
      return fragments.every((fragment) => source.includes(fragment));
    });
    return moduleIds.flatMap((moduleId) => {
      try { return [requireModule(moduleId)]; } catch { return []; }
    });
  } catch { return []; }
};

export const findSteamModuleBySource = (fragments: string[]): unknown => {
  const candidates = findSteamModulesBySource(fragments);
  return candidates.length === 1 ? candidates[0] : undefined;
};

export const findLiveModuleChild = (predicate: (module: unknown) => unknown): unknown => {
  const host = steamUiWindow();
  const dfl = "DFL" in host ? host.DFL : undefined;
  if (dfl && typeof dfl === "object" && "findModuleChild" in dfl &&
      typeof dfl.findModuleChild === "function") {
    // DFL's runtime export shares Decky's module-finder callback contract.
    const liveFinder = dfl.findModuleChild as unknown as ModuleChildFinder;
    return liveFinder(predicate);
  }
  return findModuleChild(predicate);
};
