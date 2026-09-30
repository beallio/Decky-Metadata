import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addPatch: vi.fn(),
  removePatch: vi.fn(),
  afterPatch: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@decky/api", () => ({
  routerHook: {
    addPatch: mocks.addPatch,
    removePatch: mocks.removePatch,
  },
}));

vi.mock("@decky/ui", () => ({ afterPatch: mocks.afterPatch }));

vi.mock("../log", () => ({
  debug: mocks.debug,
  info: mocks.info,
  warn: mocks.warn,
}));

import { installMiniAchievementsPatch } from "./miniAchievements";

type SteamObject = Record<string, unknown>;
type RouteCallback = (props: unknown) => unknown;
type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;
type NativeAfterPatch = (
  this: unknown,
  args: unknown[],
  result: unknown,
) => unknown;

interface PatchRecord {
  target: SteamObject;
  method: string;
  unpatch: () => void;
}

interface NativeFixture {
  instance: MiniAchievementsFixture;
  manager: SteamObject;
  nearestController: SteamObject;
  outerController: SteamObject;
}

interface InstalledPage {
  dispose: () => void;
}

let routeCallback: RouteCallback | undefined;
let patches: PatchRecord[] = [];

function isSteamObject(value: unknown): value is SteamObject {
  return typeof value === "object" && value !== null;
}

function installRealisticAfterPatch(
  targetValue: unknown,
  method: string,
  handlerValue: unknown,
): PatchRecord {
  if (!isSteamObject(targetValue) || typeof handlerValue !== "function") {
    throw new Error("afterPatch received an invalid target or handler");
  }

  const originalValue = targetValue[method];
  if (typeof originalValue !== "function") {
    throw new Error(`afterPatch target has no ${method} method`);
  }

  const target = targetValue;
  const original = originalValue as NativeMethod;
  const handler = handlerValue as NativeAfterPatch;
  const wrapped: NativeMethod = function (this: unknown, ...args: unknown[]) {
    const result: unknown = Reflect.apply(original, this, args);
    return Reflect.apply(handler, this, [args, result]);
  };

  target[method] = wrapped;
  const record: PatchRecord = {
    target,
    method,
    unpatch: () => {
      if (target[method] === wrapped) target[method] = original;
    },
  };
  patches.push(record);
  return record;
}

class MiniAchievementsFixture {
  props: unknown = { progress: "4 / 10" };
  _reactInternals: unknown;
  displayedProgress: string | null = null;

  forceUpdate(): void {
    this.displayedProgress = this.render()?.progress ?? null;
  }

  render() {
    const props = this.props as { progress?: string; onSeek?: (section: string) => void };
    return props.onSeek ? { progress: props.progress } : null;
  }

  activate() {
    const props = this.props as { onSeek?: (section: string) => void };
    if (typeof props.onSeek === "function") props.onSeek("achievements");
  }
}

function makeController(label: string): SteamObject {
  const calls: string[] = [];
  const contexts: unknown[] = [];
  const controller: SteamObject = {
    label,
    calls,
    contexts,
  };
  controller.SeekToSection = function (this: unknown, section: string): void {
    calls.push(section);
    contexts.push(this);
  };
  return controller;
}

function makeNativeFixture(): NativeFixture {
  const instance = new MiniAchievementsFixture();
  const nearestController = makeController("nearest");
  const outerController = makeController("outer");
  const outerFiber = { stateNode: outerController };
  const nearestFiber = { stateNode: nearestController, return: outerFiber };
  const miniFiber = {
    type: MiniAchievementsFixture,
    stateNode: instance,
    return: nearestFiber,
  };
  instance._reactInternals = miniFiber;
  const rootFiber = { child: miniFiber };
  const document = {
    title: "Steam Big Picture Mode",
    body: { "__reactFiber$fixture": rootFiber },
  };
  const manager: SteamObject = {
    m_rgPopups: [
      {
        m_strTitle: "Steam Big Picture Mode",
        m_popup: { document },
      },
    ],
  };

  return { instance, manager, nearestController, outerController };
}

function renderRoute(owner: SteamObject): void {
  const renderFunc = owner.renderFunc;
  if (typeof renderFunc !== "function") {
    throw new Error("app-details owner has no renderFunc");
  }
  Reflect.apply(renderFunc, owner, []);
}

function installAtAppRoute(manager: unknown): InstalledPage {
  vi.stubGlobal("window", { g_PopupManager: manager });
  const routeTree = { native: "app details tree" };
  const owner: SteamObject = {
    renderFunc: () => routeTree,
  };
  const routeProps = { children: { props: owner } };
  const dispose = installMiniAchievementsPatch();

  if (!routeCallback) throw new Error("router hook did not register its callback");
  routeCallback(routeProps);
  renderRoute(owner);
  return { dispose };
}

function readProps(instance: MiniAchievementsFixture): SteamObject {
  if (!isSteamObject(instance.props)) {
    throw new Error("fixture props are not an object");
  }
  return instance.props;
}

function replaceSeekController(
  instance: MiniAchievementsFixture,
  controller: SteamObject,
  outerController: SteamObject,
): void {
  instance._reactInternals = {
    stateNode: {},
    return: {
      stateNode: controller,
      return: { stateNode: outerController },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  routeCallback = undefined;
  patches = [];

  mocks.addPatch.mockReset();
  mocks.addPatch.mockImplementation(
    (_route: string, callback: RouteCallback) => {
      routeCallback = callback;
      return callback;
    },
  );
  mocks.removePatch.mockReset();
  mocks.removePatch.mockImplementation(() => {});
  mocks.afterPatch.mockReset();
  mocks.afterPatch.mockImplementation(
    (target: unknown, method: string, handler: unknown) =>
      installRealisticAfterPatch(target, method, handler),
  );
  mocks.debug.mockReset();
  mocks.info.mockReset();
  mocks.warn.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("installMiniAchievementsPatch", () => {
  it("coalesces route renders and captures later after an earlier page missed", () => {
    let popupReads = 0;
    const emptyManager = Object.defineProperty({}, "m_rgPopups", {
      get() {
        popupReads += 1;
        return [];
      },
    });
    const browserWindow = { g_PopupManager: emptyManager };
    vi.stubGlobal("window", browserWindow);

    const routeTree = { native: "home-to-game route tree" };
    const owner: SteamObject = { renderFunc: () => routeTree };
    const routeProps = { children: { props: owner } };
    const dispose = installMiniAchievementsPatch();
    if (!routeCallback) throw new Error("router hook did not register its callback");
    routeCallback(routeProps);

    for (let render = 0; render < 6; render += 1) {
      renderRoute(owner);
    }
    expect(popupReads).toBe(0);
    vi.advanceTimersByTime(10_000);
    const readsAfterBurst = popupReads;
    vi.advanceTimersByTime(10_000);
    expect(popupReads).toBe(readsAfterBurst);

    const fixture = makeNativeFixture();
    browserWindow.g_PopupManager = fixture.manager;
    renderRoute(owner);
    vi.runAllTimers();
    expect(fixture.instance.displayedProgress).toBe("4 / 10");
    expect(popupReads).toBe(readsAfterBurst);
    dispose();
  });

  it("captures an already mounted page immediately when enabled", () => {
    const fixture = makeNativeFixture();
    vi.stubGlobal("window", { g_PopupManager: fixture.manager });
    const owner: SteamObject = { renderFunc: () => ({ native: true }) };
    const routeProps = { children: { props: owner } };
    const dispose = installMiniAchievementsPatch();

    if (!routeCallback) throw new Error("router hook did not register its callback");
    routeCallback(routeProps);
    vi.runAllTimers();

    expect(fixture.instance.displayedProgress).toBe("4 / 10");
    dispose();
  });

  it("preserves durable props while resolving the nearest controller on each activation", () => {
    const fixture = makeNativeFixture();
    const page = installAtAppRoute(fixture.manager);
    vi.runAllTimers();

    const originalWrappedProps = readProps(fixture.instance);
    const handlerValue = originalWrappedProps.onSeek;
    if (typeof handlerValue !== "function") {
      throw new Error("native MiniAchievements props did not receive onSeek");
    }
    const onSeek = handlerValue as (section: string) => void;

    fixture.instance.activate();
    expect(fixture.nearestController.calls).toEqual(["achievements"]);
    expect(fixture.nearestController.contexts[0]).toBe(fixture.nearestController);
    expect(fixture.outerController.calls).toEqual([]);

    const updatedRawProps = { label: "replacement render props" };
    fixture.instance.props = updatedRawProps;
    const updatedWrappedProps = readProps(fixture.instance);
    expect(updatedWrappedProps.label).toBe("replacement render props");
    expect(updatedWrappedProps.onSeek).toBe(onSeek);

    const replacementController = makeController("replacement nearest");
    replaceSeekController(
      fixture.instance,
      replacementController,
      fixture.outerController,
    );
    fixture.instance.activate();
    expect(replacementController.calls).toEqual(["achievements"]);
    expect(replacementController.contexts[0]).toBe(replacementController);

    const nativeSections: string[] = [];
    const nativeHandler = (section: string): void => {
      nativeSections.push(section);
    };
    const nativeProps = { label: "native callback", onSeek: nativeHandler };
    fixture.instance.props = nativeProps;
    expect(readProps(fixture.instance)).toBe(nativeProps);
    expect(readProps(fixture.instance).onSeek).toBe(nativeHandler);
    fixture.instance.activate();
    expect(nativeSections).toEqual(["achievements"]);
    expect(replacementController.calls).toEqual(["achievements"]);
    page.dispose();
  });

  it("restores the newest raw props and continues cleanup after a route unpatch fails", () => {
    const fixture = makeNativeFixture();
    const originalNativeRender = MiniAchievementsFixture.prototype.render;
    const page = installAtAppRoute(fixture.manager);
    vi.runAllTimers();

    const routeRenderPatch = patches.find((patch) => patch.method === "renderFunc");
    if (!routeRenderPatch || typeof readProps(fixture.instance).onSeek !== "function") {
      throw new Error("expected route and native render patches");
    }

    const latestRawProps = { label: "latest props before disable" };
    fixture.instance.props = latestRawProps;
    let routeUnpatchAttempts = 0;
    routeRenderPatch.unpatch = () => {
      routeUnpatchAttempts += 1;
      throw new Error("route render owner was already detached");
    };
    mocks.removePatch.mockImplementation(() => {
      throw new Error("router is shutting down");
    });

    page.dispose();
    page.dispose();

    const restoredDescriptor = Object.getOwnPropertyDescriptor(
      fixture.instance,
      "props",
    );
    expect(restoredDescriptor).toMatchObject({
      value: latestRawProps,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    expect(fixture.instance.props).toBe(latestRawProps);
    expect(MiniAchievementsFixture.prototype.render).toBe(originalNativeRender);
    expect(routeUnpatchAttempts).toBe(1);
    expect(mocks.removePatch).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(fixture.instance.displayedProgress).toBeNull();
  });

  it("cancels an outstanding capture attempt when disabled", () => {
    let popupReads = 0;
    const manager = Object.defineProperty({}, "m_rgPopups", {
      get() {
        popupReads += 1;
        return [];
      },
    });
    const page = installAtAppRoute(manager);

    page.dispose();
    vi.runAllTimers();

    expect(popupReads).toBe(0);
    expect(mocks.removePatch).toHaveBeenCalledTimes(1);
  });
});
