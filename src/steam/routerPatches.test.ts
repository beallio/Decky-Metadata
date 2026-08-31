import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeHandlers: [] as Array<(tree: unknown) => unknown>,
  addPatch: vi.fn((_route: string, handler: (tree: unknown) => unknown) => {
    mocks.routeHandlers.push(handler);
    return handler;
  }),
  removePatch: vi.fn(),
  afterPatch: vi.fn((target: Record<string, unknown>, method: string, handler: Function) => {
    const original = target[method] as (...args: unknown[]) => unknown;
    target[method] = function (this: unknown, ...args: unknown[]) {
      return handler.call(this, args, original.apply(this, args));
    };
    return { unpatch: () => { target[method] = original; } };
  }),
}));

vi.mock("@decky/api", () => ({
  routerHook: {
    addPatch: mocks.addPatch,
    removePatch: mocks.removePatch,
  },
}));
vi.mock("@decky/ui", () => ({
  afterPatch: mocks.afterPatch,
  findInReactTree: vi.fn((tree: unknown) => tree),
  findModuleChild: vi.fn(),
}));
vi.mock("../backend", () => ({ frontendLog: vi.fn(() => Promise.resolve()) }));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  compatibilityRevisionSnapshot,
  metadataState,
} from "./core";
import { installRouterRenderPatches } from "./routerPatches";

afterEach(() => {
  mocks.routeHandlers.length = 0;
  mocks.addPatch.mockClear();
  mocks.removePatch.mockClear();
  mocks.afterPatch.mockClear();
  metadataState.compatibilityRevision = 0;
  metadataState.lastObservedGameDetailAppId = 0;
});

describe("router compatibility publication", () => {
  it.each([
    [false, 0],
    [true, 1],
  ])("publishes only when route metadata changes: changed=%s", async (changed, expectedRevision) => {
    const appId = changed ? 9701 : 9702;
    const overview = {
      appid: appId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
    };
    const output = { props: { children: { props: { overview } } } };
    const renderTree = { renderFunc: () => output };
    const ensureMetadataCache = vi.fn(async () => undefined);
    const applyMetadata = vi.fn(() => changed);
    const unpatchers: Array<() => void> = [];

    installRouterRenderPatches(unpatchers, {
      ensureMetadataCache,
      applyMetadata,
      tryEnrichScreenshotsForApp: vi.fn(async () => undefined),
      tryFetchMetadataForApp: vi.fn(async () => undefined),
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });
    expect(mocks.routeHandlers.length).toBeGreaterThan(0);

    mocks.routeHandlers[0](renderTree);
    renderTree.renderFunc();
    await vi.waitFor(() => expect(applyMetadata).toHaveBeenCalledWith(appId));

    expect(compatibilityRevisionSnapshot()).toBe(expectedRevision);
    unpatchers.reverse().forEach((unpatch) => unpatch());
  });
});
