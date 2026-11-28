import { findModuleChild } from "@decky/ui";
import { steamUiWindow } from "./steamUiHost";

type CachedWebpackModule = { exports: unknown };
type WebpackRequire = ((moduleId: string) => unknown) & {
  m: Record<string, unknown>;
  c?: Record<string, CachedWebpackModule>;
};
const webpackRequires = new WeakMap<object, { chunks: unknown[]; require?: WebpackRequire }>();
type ModuleChildFinder = (predicate: (module: unknown) => unknown) => unknown;

const isWebpackRequire = (value: unknown): value is WebpackRequire =>
  typeof value === "function" && "m" in value &&
  typeof value.m === "object" && value.m !== null && !Array.isArray(value.m);

const collectSafeFunctionSources = (value: unknown): string => {
  if (typeof value === "function") {
    let out = value.toString();
    const proto = value.prototype as Record<string, unknown> | undefined;
    if (proto && typeof proto === "object") {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === "constructor") continue;
        const desc = Object.getOwnPropertyDescriptor(proto, key);
        if (!desc) continue;
        if (typeof desc.value === "function") out += `\n${desc.value.toString()}`;
        if (typeof desc.get === "function") out += `\n${desc.get.toString()}`;
        if (typeof desc.set === "function") out += `\n${desc.set.toString()}`;
      }
    }
    return out;
  }
  if (value && typeof value === "object") {
    let out = "";
    const renderDesc = Object.getOwnPropertyDescriptor(value, "render");
    if (typeof renderDesc?.value === "function") out += `${renderDesc.value.toString()}\n`;
    const typeDesc = Object.getOwnPropertyDescriptor(value, "type");
    if (typeof typeDesc?.value === "function") out += `${typeDesc.value.toString()}\n`;
    return out;
  }
  return "";
};

const findViteEsmModulesBySource = (host: unknown, fragments: string[]): unknown[] => {
  const esm = host && typeof host === "object" && "__DECKY_ESM__" in host
    ? (host as { __DECKY_ESM__?: unknown }).__DECKY_ESM__
    : undefined;
  if (!(esm instanceof Map)) return [];
  const matches: unknown[] = [];
  for (const mod of esm.values()) {
    if (!mod || typeof mod !== "object") continue;
    let combined = "";
    for (const key of Object.keys(mod)) {
      let exported: unknown;
      try {
        exported = (mod as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      const src = collectSafeFunctionSources(exported);
      if (src) combined += `${src}\n`;
    }
    if (combined && fragments.every((fragment) => combined.includes(fragment))) {
      matches.push(mod);
    }
  }
  return matches;
};

const webpackRequireFor = (host: object, chunks: unknown[]): WebpackRequire | undefined => {
  const cached = webpackRequires.get(host);
  if (cached?.chunks === chunks) return cached.require;
  const capture: { chunks: unknown[]; require?: WebpackRequire } = { chunks };
  webpackRequires.set(host, capture);
  try {
    chunks.push([[Symbol("decky-metadata-native-module")], {}, (requireFn: unknown) => {
      if (isWebpackRequire(requireFn)) capture.require = requireFn;
    }]);
  } catch {
    // Fall through to Vite ESM registry inspection.
  }
  return capture.require;
};

/** Inspect webpack factories (or Vite ESM export sources), never observable Steam stores or render-time state. */
export const findSteamModulesBySource = (fragments: string[]): unknown[] => {
  const host = steamUiWindow();
  const chunks = "webpackChunksteamui" in host ? host.webpackChunksteamui : undefined;
  if (Array.isArray(chunks)) {
    const requireModule = webpackRequireFor(host, chunks);
    if (fragments.length === 0) {
      if (requireModule) return Object.values(requireModule.c ?? {}).map((module) => module.exports);
      return findViteEsmModulesBySource(host, fragments);
    }
    if (requireModule) {
      const moduleIds = Object.keys(requireModule.m).filter((id) => {
        const factory = requireModule.m[id];
        const source = typeof factory === "function" ? factory.toString() : "";
        return fragments.every((fragment) => source.includes(fragment));
      });
      const found = moduleIds.flatMap((moduleId) => {
        try { return [requireModule(moduleId)]; } catch { return []; }
      });
      if (found.length > 0) return found;
    }
  }
  return findViteEsmModulesBySource(host, fragments);
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

/** ESM Steam (Decky UI 5) keeps many internals as unexported module variables; webpack Steam has no such finder. */
export const findSteamVar = (filter: (value: unknown) => boolean): unknown => {
  const host = steamUiWindow();
  const dfl = "DFL" in host ? host.DFL : undefined;
  if (dfl && typeof dfl === "object" && "findVar" in dfl && typeof dfl.findVar === "function") {
    return (dfl.findVar as (predicate: (value: unknown) => boolean) => unknown)(filter);
  }
  return undefined;
};
