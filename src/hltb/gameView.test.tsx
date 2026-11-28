import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as I18nModule from "../i18n";
import type { HltbEntry } from "../backend";
import type { HltbStats } from "./HltbStats";
import type { HltbBlur, HltbSettings } from "./settings";

type EffectSlot = {
  effect: () => void | (() => void);
  deps?: unknown[];
  cleanup?: () => void;
};
type RowProps = { className?: string; style?: React.CSSProperties; children: React.ReactNode };
type InsertedRow = {
  props: { appId: number };
  type: (props: { appId: number }) => { ref: { current: unknown }; props: RowProps };
};
type HltbStatsElement = React.ReactElement<React.ComponentProps<typeof HltbStats>, typeof HltbStats>;
type SurfaceObserver = { connected: boolean; callback: () => void; targets?: unknown[] };
type Observation = { target: unknown; options?: MutationObserverInit };

const hooks = vi.hoisted(() => ({
  index: 0,
  values: [] as unknown[],
  effects: [] as EffectSlot[],
  pendingEffects: [] as number[],
}));
const backend = vi.hoisted(() => ({
  getAllSteamOverrides: vi.fn(async () => ({})),
  getHltbSettings: vi.fn(),
  setHltbSettings: vi.fn(),
  clearHltbCache: vi.fn(),
  getHltbStats: vi.fn(),
  getProviderCache: vi.fn(),
}));
const router = vi.hoisted(() => ({
  addPatch: vi.fn(),
  removePatch: vi.fn(),
  afterPatch: vi.fn((target: object, method: string,
    handler: (args: unknown[], result: unknown) => unknown) => {
    const original: unknown = Reflect.get(target, method);
    if (typeof original !== "function") throw new Error("missing render");
    const patched = function (this: unknown, ...args: unknown[]) {
      return handler(args, Reflect.apply(original, this, args));
    };
    Reflect.set(target, method, patched);
    const unpatch = vi.fn(() => {
      if (Reflect.get(target, method) === patched) Reflect.set(target, method, original);
    });
    return { unpatch };
  }),
}));
const classes = vi.hoisted(() => ({
  InnerContainer: "inner-container",
  Header: "details-header",
  HeaderBackgroundImage: "header-background",
  PlaySection: "play-section",
  PlayButton: "play-button",
  AppActionButton: "app-action-button",
  AppDetailsRoot: "details-root",
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (hooks.values.length <= index) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (hooks.values.length <= index) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.effects[index];
    if (deps && previous?.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    hooks.effects[index] = { effect, deps, cleanup: previous?.cleanup };
    hooks.pendingEffects.push(index);
  },
}));
vi.mock("@decky/ui", async () => {
  // Static imports run before this hoisted factory can provide Steam's dispatcher.
  vi.stubGlobal("window", { SP_REACT: {
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: {} } },
  } });
  const { createReactTreePatcher } = await import("@decky/ui/dist/utils/react/treepatcher");
  const { findInReactTree } = await import("@decky/ui/dist/utils/react/react");
  return {
    afterPatch: router.afterPatch, createReactTreePatcher, findInReactTree,
    appDetailsClasses: classes,
    appDetailsHeaderClasses: { TopCapsule: "top-capsule", HeaderBackgroundImage: classes.HeaderBackgroundImage },
    basicAppDetailsSectionStylerClasses: classes,
    appActionButtonClasses: { PlayButton: classes.PlayButton, PlayButtonContainer: "play-button-container" },
    playSectionClasses: { CloudStatusRow: "cloud-status-row" },
    findClassModule: () => undefined,
    Focusable: "div",
    Navigation: { NavigateToExternalWeb: vi.fn() },
  };
});
vi.mock("@decky/api", () => ({ routerHook: router }));
vi.mock("../backend", () => backend);
vi.mock("../log", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
// Rows render HltbStats by calling it, so its hook must not need a React renderer.
vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return { ...actual, useT: () => actual.t };
});
vi.mock("../steam/core", () => ({
  GAME_DETAIL_ROUTES: ["/library/app/:appid", "/library/details/:appid", "/library/:collection/app/:appid"],
  getNativeOverview: (appId: number) => appId === 620 ? { appid: 620, display_name: "Portal 2" } : null,
  isNativeNonSteamShortcut: () => false,
  metadataCache: {},
}));

import { releaseProviderCache } from "../providerCache";
import { hltbController, hltbInputs } from "./gameView";
import { clearSteamOverrideCache, setSteamOverrideCached } from "./steamOverrides";
import { DEFAULT_HLTB_SETTINGS } from "./settings";

function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return React.isValidElement<{ children?: React.ReactNode }>(node) && node.type !== "style" ? text(node.props.children) : "";
}
const childElements = (node: React.ReactNode) =>
  React.Children.toArray(node).filter((child) => React.isValidElement(child)) as React.ReactElement<any>[];
const statsOf = (row: { props: RowProps }) =>
  childElements(row.props.children).find((child) => child.type !== "style") as HltbStatsElement;
const ruleOf = (row: { props: RowProps }) =>
  childElements(row.props.children).find((child) => child.type === "style")?.props.children as string | undefined;
const statsClassOf = (row: { props: RowProps }) => {
  const stats = statsOf(row);
  return String(stats.type(stats.props)?.props.className ?? "");
};

afterEach(() => {
  try {
    for (const slot of hooks.effects) slot?.cleanup?.();
  } finally {
    try {
      hltbController.stop();
    } finally {
      releaseProviderCache();
      vi.unstubAllGlobals();
    }
  }
});

describe("HLTB game-page native surface", () => {
  const entry: HltbEntry = {
    status: "matched", hltb_id: 7231, game_name: "Portal 2",
    stats: { main: 3600, plus: 5400, complete: 7200, all: 10800 },
    steam_appid_used: 620, title_used: "Portal 2", pinned_id_used: null, fetched_at: Date.now(),
  };

  /** Renders the inserted row against a fake game page with one theme and one Play surface. */
  async function setup(options: {
    style?: HltbSettings["style"]; blur?: HltbBlur; backdrop?: string; pushPlayDown?: boolean; respectMenuBar?: boolean;
  } = {}) {
    vi.clearAllMocks();
    hooks.index = 0;
    hooks.values = [];
    hooks.effects = [];
    hooks.pendingEffects = [];
    backend.getProviderCache.mockResolvedValue({
      version: 1, protondb: { ratings: {}, name_ids: {} }, hltb: { entries: { "620": entry } },
    });
    backend.getHltbSettings.mockResolvedValue({
      ...DEFAULT_HLTB_SETTINGS, enabled: true, style: options.style ?? "clean-default",
      pushPlayDown: options.pushPlayDown ?? false,
      respectMenuBar: options.respectMenuBar ?? true,
      appearance: { ...DEFAULT_HLTB_SETTINGS.appearance, blur: options.blur ?? "match" },
    });
    backend.setHltbSettings.mockImplementation(async (settings: HltbSettings) => settings);
    router.addPatch.mockImplementation((route, callback) => ({ route, callback }));
    hltbController.mount();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    const overview = { appid: 620 };
    const play = { props: {
      childFocusDisabled: false, navRef: {},
      children: { props: { details: {}, overview, bFastRender: false } },
    } };
    const detail = {
      props: { overview },
      type: (_props: { overview: typeof overview }): { props: { className: string; children: unknown[] } } =>
        ({ props: { className: classes.InnerContainer, children: [play] } }),
    };
    const routeProps = { renderFunc: () => ({ props: { children: detail } }) };
    const routePatch = router.addPatch.mock.calls.find(([route]) => route === "/library/app/:appid")![1];
    routePatch({ props: routeProps });
    const patchedDetail = routeProps.renderFunc().props.children;
    // The real route patch inserts this function component into our mutable host fixture.
    const insertedRow = patchedDetail.type(patchedDetail.props).props.children[0] as InsertedRow;

    const nativeMutationAttempts: unknown[][] = [];
    const nativeStyle = (owner: string) => {
      const record = (...attempt: unknown[]): never => {
        nativeMutationAttempts.push([owner, ...attempt]);
        throw new Error(`HLTB attempted to mutate ${owner}'s native style`);
      };
      return new Proxy({
        background: "native inline background", opacity: "0.9", backdropFilter: "blur(2px)",
        setProperty: (...args: unknown[]) => record("setProperty", ...args),
        removeProperty: (...args: unknown[]) => record("removeProperty", ...args),
      }, {
        set: (_target, name, value) => record("assignment", name, value),
        defineProperty: (_target, name, descriptor) => record("defineProperty", name, descriptor),
        deleteProperty: (_target, name) => record("deleteProperty", name),
      });
    };
    const observers: ThemeObserver[] = [];
    class ThemeObserver {
      connected = false;
      observations: Observation[] = [];
      observe = vi.fn((target: unknown, options?: MutationObserverInit) => {
        this.connected = true;
        this.observations.push({ target, options });
      });
      disconnect = vi.fn(() => { this.connected = false; this.observations = []; });
      constructor(readonly callback: () => void) { observers.push(this); }
    }
    const resizers: SizeObserver[] = [];
    class SizeObserver {
      connected = false;
      targets: unknown[] = [];
      observe = vi.fn((target: unknown) => { this.connected = true; this.targets.push(target); });
      disconnect = vi.fn(() => { this.connected = false; this.targets = []; });
      constructor(readonly callback: () => void) { resizers.push(this); }
    }
    const notify = (list: SurfaceObserver[], target?: unknown) => {
      for (const observer of list) {
        if (observer.connected && (!target || observer.targets?.includes(target))) observer.callback();
      }
    };
    const playSurface = {
      background: "rgba(20, 30, 40, 0.4)", opacity: "0.7",
      backdropFilter: options.backdrop ?? "blur(3px)", paddingTop: "16px",
    };
    const rootSurface = { background: "rgba(10, 15, 20, 0.6)", opacity: "0.8" };
    let barHeight = 48;
    let containsRow = false;
    let hasPlay = true;
    let hasButton = true;
    let hasBar = true;
    // Fake InnerContainer: the header (with its art) plus any save status bars.
    // Bars sit after Play, so their rects move with the flow layout.
    // steamdeck-vm with Clean Gameview and Art Hero's Smaller Footer, in CSS px.
    const artRect = { top: 100, bottom: 414, width: 800 };
    const headerRect = { top: 100, bottom: 414 };
    let headerLayoutBottom = headerRect.bottom;
    let footerTop = 519;
    let footerHeight = 15;
    let footerChildTop = footerTop;
    let footerChildBottom = 534;
    let footerChildWidth = 1280;
    let footerChildOffsetTop = 0;
    const footerChild = {
      get offsetTop() { return footerChildOffsetTop; },
      getBoundingClientRect: () => ({
        top: footerChildTop, bottom: footerChildBottom, width: footerChildWidth,
        height: footerChildBottom - footerChildTop,
      }),
    };
    const footer = {
      get offsetHeight() { return footerHeight; },
      get offsetTop() { return footerTop; },
      offsetParent: null,
      getBoundingClientRect: () => ({ top: footerTop, bottom: footerTop + footerHeight, height: footerHeight, width: 1280 }),
    };
    let scrollerScale = 1;
    let scrollerTop = 0;
    const scroller = {
      clientHeight: 534,
      scrollHeight: 1600,
      scrollTop: 0,
      get offsetTop() { return scrollerTop; },
      offsetParent: null,
      // Scaled by Steam's page-entry transform in the away/back case; only rect reads see it.
      getBoundingClientRect: () => ({
        top: 0, bottom: 534 * scrollerScale, height: 534 * scrollerScale, width: 1280 * scrollerScale,
      }),
      parentElement: null,
    };
    const flowHeight = 45;
    const artImages: Array<{ getBoundingClientRect: () => { bottom: number; width: number } }> = [];
    const frames = new Map<number, () => void>();
    let nextFrame = 1;
    let flowShown = false;
    type StatusBar = {
      textContent: string;
      offsetHeight: number;
      parentElement: unknown;
      getAttribute: (name: string) => string | null;
      getBoundingClientRect: () => { top: number; bottom: number; width: number };
    };
    const bars: StatusBar[] = [];
    const computedStyles = new WeakMap<object, Record<string, string>>();
    const documentListeners = new Map<string, Array<() => void>>();
    const visibleStyle = { display: "block", visibility: "visible", opacity: "1", position: "static" };
    const art = {
      getBoundingClientRect: () => artRect,
      querySelectorAll: (selector: string) => selector === "img" ? artImages : [],
    };
    const header = {
      className: classes.Header,
      children: [],
      offsetTop: 0,
      get offsetHeight() { return headerLayoutBottom - headerRect.top; },
      get offsetParent() { return container; },
      getBoundingClientRect: () => ({ ...headerRect, height: headerRect.bottom - headerRect.top }),
      querySelector: (selector: string) => selector === `.${classes.HeaderBackgroundImage}` ? art : null,
    };
    const container = {
      children: [header],
      querySelectorAll: () => bars,
      parentElement: scroller,
      offsetTop: headerRect.top,
      offsetParent: scroller,
    };
    computedStyles.set(container, visibleStyle);
    computedStyles.set(scroller, { ...visibleStyle, overflowY: "auto" });
    const statusBar = (options: {
      top: number; height?: number; width?: number; text?: string;
      style?: Record<string, string>; attributes?: Record<string, string>;
    }) => {
      const height = options.height ?? 24;
      const status: StatusBar = {
        textContent: options.text ?? "Cloud saved",
        offsetHeight: height,
        parentElement: container,
        getAttribute: (name) => options.attributes?.[name] ?? null,
        getBoundingClientRect: () => {
          const top = options.top + (flowShown ? flowHeight : 0);
          return { top, bottom: top + height, width: options.width ?? artRect.width };
        },
      };
      computedStyles.set(status, { ...visibleStyle, ...options.style });
      bars.push(status);
      return status;
    };
    const dropBar = (status: StatusBar) => {
      const index = bars.indexOf(status);
      if (index >= 0) bars.splice(index, 1);
    };
    const flowBar = { getBoundingClientRect: () => ({ height: flowHeight }) };
    const root = {
      style: nativeStyle("AppDetails root"),
      contains: (candidate: unknown): boolean => containsRow && candidate === row,
    };
    const section = {
      style: nativeStyle("Play section"),
      closest: (selector: string) => selector === `.${classes.AppDetailsRoot}` ? root : null,
      offsetTop: 300,
      offsetParent: container,
      querySelector: (selector: string) => hasButton &&
        (selector === `.${classes.PlayButton}` || selector === `.${classes.AppActionButton}`) ? button : null,
      get offsetHeight() { return 80 + (rowClasses.has("decky-metadata-hltb-joined") ? barHeight : 0); },
    };
    // The button face, 16px into the section; the joined rule adds its height as section padding.
    const button = {
      get offsetTop() { return 16 + (rowClasses.has("decky-metadata-hltb-joined") ? barHeight : 0); },
      offsetHeight: 48,
      offsetParent: section,
    };
    const bar = { get offsetHeight() { return barHeight; } };
    // The row's own wrapper: the measured box that displaces Play in flow mode.
    let surfaceHeight: number | null = null;
    const surface = { get offsetHeight() { return surfaceHeight ?? barHeight; } };
    const surfaceStyle = { marginTop: "0px", marginBottom: "0px" };
    const properties = new Map([["--unrelated-sentinel", "keep"]]);
    const head = {};
    const documentElement = {};
    const rowClasses = new Set<string>();
    const row = {
      style: {
        setProperty: (name: string, value: string) => properties.set(name, value),
        removeProperty: (name: string) => properties.delete(name),
      },
      classList: { contains: (name: string) => rowClasses.has(name) },
      contains: () => false,
      querySelector: (selector: string) => {
        if (selector === ".decky-metadata-hltb-info") return hasBar ? bar : null;
        if (selector === "#decky-metadata-hltb") return surface;
        if (selector === "#decky-metadata-hltb.decky-metadata-hltb-flow") return flowShown ? flowBar : null;
        return null;
      },
      parentElement: container,
      nextElementSibling: {
        querySelector: (selector: string) => hasPlay && selector === `.${classes.PlaySection}` ? section : null,
      },
      ownerDocument: {
        head, documentElement, body: {},
        addEventListener: (type: string, listener: () => void) => {
          documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]);
        },
        removeEventListener: (type: string, listener: () => void) => {
          documentListeners.set(type, (documentListeners.get(type) ?? []).filter((candidate) => candidate !== listener));
        },
        querySelector: (selector: string) => selector === "#Footer" ? footer : selector === "#Footer > div" ? footerChild : null,
        defaultView: {
          MutationObserver: ThemeObserver,
          ResizeObserver: SizeObserver,
          requestAnimationFrame: (callback: () => void) => {
            frames.set(nextFrame, callback);
            return nextFrame++;
          },
          cancelAnimationFrame: (id: number) => { frames.delete(id); },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          getComputedStyle: (element: unknown) => {
            const style = computedStyles.get(element as object);
            if (style) return style;
            if (element === section) return playSurface;
            if (element === root) return rootSurface;
            if (element === bar) return { height: `${barHeight}px` };
            if (element === surface) return surfaceStyle;
            throw new Error("Unexpected computed-style target");
          },
        },
      },
    };
    /** A theme change repaints from the document head or the root element. */
    const notifyTheme = () => {
      for (const observer of observers) {
        if (observer.connected && observer.observations.some(({ target }) => target === head || target === documentElement)) {
          observer.callback();
        }
      }
    };
    /** A DOM change reaches observers watching the changed node or one of its ancestors. */
    const isContainer = (value: unknown): value is { contains: (candidate: object) => boolean } =>
      typeof value === "object" && value !== null && "contains" in value && typeof value.contains === "function";
    const notifyMutation = (node: object = container) => {
      for (const observer of observers) {
        const watching = observer.observations.some(({ target, options }) =>
          options?.subtree === true && (target === node || (isContainer(target) && target.contains(node))));
        if (observer.connected && watching) observer.callback();
      }
    };
    /** One render pass plus the effects React would commit for it. */
    const renderRow = () => {
      hooks.index = 0;
      const rendered = insertedRow.type(insertedRow.props);
      const stats = statsOf(rendered);
      flowShown = String(stats.type(stats.props)?.props.className ?? "").includes("decky-metadata-hltb-flow");
      rowClasses.clear();
      for (const name of String(rendered.props.className ?? "").split(/\s+/).filter(Boolean)) rowClasses.add(name);
      rendered.ref.current = row;
      for (const index of hooks.pendingEffects.splice(0)) {
        const slot = hooks.effects[index];
        slot.cleanup?.();
        const cleanup = slot.effect();
        slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
      return rendered;
    };
    /** Settles a state update made by an effect, which renders on the next pass. */
    const settle = () => { renderRow(); return renderRow(); };
    const setSettings = async (next: HltbSettings) => {
      expect(await hltbController.setSettings(next)).toBe(true);
      return settle();
    };
    const setBlur = async (blur: HltbBlur) => {
      const settings = hltbController.getSnapshot().settings;
      return setSettings({ ...settings, appearance: { ...settings.appearance, blur } });
    };
    const setStyle = async (style: HltbSettings["style"]) =>
      setSettings({ ...hltbController.getSnapshot().settings, style });
    const setPushPlayDown = async (pushPlayDown: boolean) =>
      setSettings({ ...hltbController.getSnapshot().settings, pushPlayDown });
    const expectSurface = (backdrop: string, underlay = rootSurface) => {
      expect(Object.fromEntries(properties)).toEqual({
        "--unrelated-sentinel": "keep",
        "--hltb-native-background": playSurface.background,
        "--hltb-native-opacity": playSurface.opacity,
        "--hltb-native-backdrop": backdrop,
        "--hltb-native-underlay": underlay.background,
        "--hltb-native-underlay-opacity": underlay.opacity,
      });
      expect(nativeMutationAttempts).toEqual([]);
    };
    const expectJoinedSurface = () => {
      expect(Object.fromEntries(properties)).toEqual({
        "--unrelated-sentinel": "keep",
        "--hltb-native-background": "transparent",
        "--hltb-native-opacity": "1",
        "--hltb-native-backdrop": "none",
        "--hltb-native-underlay": "transparent",
        "--hltb-native-underlay-opacity": "1",
      });
      expect(nativeMutationAttempts).toEqual([]);
    };
    const expectHours = (rendered: { props: RowProps }) => {
      const stats = statsOf(rendered);
      const content = text(stats.type(stats.props));
      for (const hours of ["1.0 hour", "1.5 hours", "2.0 hours", "3.0 hours"]) expect(content).toContain(hours);
    };
    const flushFrames = () => {
      const pending = Array.from(frames.values());
      frames.clear();
      for (const callback of pending) callback();
    };
    return {
      observers, resizers, properties, settle, setBlur, setStyle, setPushPlayDown,
      artRect, statusBar, dropBar, flushFrames,
      extendArt: (bottom: number, width = artRect.width) => { artImages.push({ getBoundingClientRect: () => ({ bottom, width }) }); },
      notifyTheme,
      notifyMutation: () => notifyMutation(),
      notifyResize: (target?: unknown) => notify(resizers, target),
      notifyEnd: (type: string) => { for (const listener of Array.from(documentListeners.get(type) ?? [])) listener(); },
      setBarHeight: (height: number) => { barHeight = height; },
      setSurfaceHeight: (height: number | null) => { surfaceHeight = height; },
      setHeaderBottom: (bottom: number) => { headerRect.bottom = bottom; headerLayoutBottom = bottom; },
      setHeaderRectBottom: (bottom: number) => { headerRect.bottom = bottom; },
      setScrollerScale: (scale: number) => { scrollerScale = scale; },
      setScrollerTop: (top: number) => { scrollerTop = top; },
      setFooterHeight: (height: number) => { footerHeight = height; },
      setFooterTop: (top: number) => { footerTop = top; },
      setFooterChildOffsetTop: (top: number) => { footerChildOffsetTop = top; },
      setFooterChildRect: (top: number, bottom: number, width: number) => {
        footerChildTop = top; footerChildBottom = bottom; footerChildWidth = width;
      },
      setBackdrop: (backdrop: string) => { playSurface.backdropFilter = backdrop; },
      setContainsRow: (value: boolean) => { containsRow = value; },
      setHasPlay: (value: boolean) => { hasPlay = value; },
      setHasButton: (value: boolean) => { hasButton = value; },
      expectSurface, expectJoinedSurface, expectHours,
    };
  }
  it("replaces one route render patch and releases the last patch on teardown", async () => {
    await setup();
    const routePatch = router.addPatch.mock.calls.find(([route]) => route === "/library/app/:appid")![1];
    const firstTarget = router.afterPatch.mock.calls[0]?.[0] as { renderFunc: () => unknown };
    routePatch(firstTarget);
    expect(router.afterPatch).toHaveBeenCalledTimes(1);
    const firstPatch = router.afterPatch.mock.results[0];
    if (firstPatch?.type !== "return") throw new Error("missing first HLTB render patch");

    routePatch({ renderFunc: () => null });
    expect(router.afterPatch).toHaveBeenCalledTimes(2);
    expect(firstPatch.value.unpatch).toHaveBeenCalledTimes(1);
    const secondPatch = router.afterPatch.mock.results[1];
    if (secondPatch?.type !== "return") throw new Error("missing second HLTB render patch");

    hltbController.stop();
    expect(secondPatch.value.unpatch).toHaveBeenCalledTimes(1);
  });

  it("continues registering game routes when one optional route hook fails", async () => {
    await setup();
    hltbController.stop();
    router.addPatch.mockClear();
    router.addPatch.mockImplementationOnce(() => { throw new Error("route unavailable"); });

    hltbController.mount();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    expect(router.addPatch).toHaveBeenCalledTimes(3);
  });

  it("joins the Play blur into one surface for clean-default", async () => {
    const page = await setup();
    const rendered = page.settle();

    expect(rendered.props.className).toBe("decky-metadata-hltb-joined");
    expect(ruleOf(rendered)).toBe(
      ".inner-container:has(> .decky-metadata-hltb-joined) .play-section { margin-top: calc(0px - 48px); padding-top: calc(16px + 48px); }",
    );
    page.expectJoinedSurface();
    page.expectHours(rendered);
    expect(page.observers.filter((observer) => observer.connected)).toHaveLength(1);
    expect(page.resizers.filter((observer) => observer.connected)).toHaveLength(1);
    expect(backend.getHltbStats).not.toHaveBeenCalled();
  });

  it("keeps the Play bar below the times instead of joining when pushing Play down", async () => {
    const page = await setup({ pushPlayDown: true });
    let rendered = page.settle();
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("blur(3px)");

    rendered = await page.setPushPlayDown(false);
    expect(rendered.props.className).toBe("decky-metadata-hltb-joined");
    expect(ruleOf(rendered)).toContain("margin-top: calc(0px - 48px)");
    page.expectJoinedSurface();

    rendered = await page.setPushPlayDown(true);
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("blur(3px)");
    page.expectHours(rendered);
  });

  it("pushes Play down by the full row when it fits above the footer", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.setHeaderBottom(400);
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
    expect(rendered.props.style?.marginTop).toBeUndefined();
  });

  it("keeps the Play button 4px above the footer bar", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    const rendered = page.settle();
    // Footer top 519, art 414, button bottom 64 in the section: push 37 of the 48px row.
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
    expect(rendered.props.style?.marginTop).toBe(-11);
    expect(414 + 37 + 64).toBe(519 - 4);
  });

  it("ignores footer labels that overhang above the footer bar", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.setFooterChildOffsetTop(-12);
    page.setFooterChildRect(507, 557, 1280);
    const rendered = page.settle();
    expect(rendered.props.style?.marginTop).toBe(-11);
  });

  it("uses the visible page bottom when the footer is hidden", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.setHeaderBottom(450);
    // The visible bar leaves one pixel of room: floor(519 - 4 - 450 - 64) = 1.
    expect(page.settle().props.style?.marginTop).toBe(-47);

    page.setFooterHeight(0);
    page.notifyResize();
    page.flushFrames();
    const rendered = page.settle();
    // Page bottom 534: floor(534 - 4 - 450 - 64) = 16, so 32px of the row is clipped.
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
    expect(rendered.props.style?.marginTop).toBe(-32);
  });

  it("measures the art from layout while Steam's page-entry rect animates", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    // Mid page-entry the header's rect is scaled/translated; its layout box is not.
    page.setHeaderRectBottom(370);
    const rendered = page.settle();
    expect(rendered.props.style?.marginTop).toBe(-11);
  });

  it("keeps the footer and art in layout while the scroller's rect is scaled", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    // The scroller's rect shrinks with the animated page; the footer outside it does not.
    page.setScrollerScale(0.95);
    page.setHeaderRectBottom(393.3);
    const rendered = page.settle();
    expect(rendered.props.style?.marginTop).toBe(-11);
  });

  it("keeps the footer and art in the same layout space when the scroller is offset", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.setScrollerTop(40);
    page.setFooterTop(560);
    const rendered = page.settle();
    // Art bottom 454 (140 + 314), footer top 560: floor(560 - 4 - 454 - 64) = 38.
    expect(rendered.props.style?.marginTop).toBe(-10);
  });

  it("re-measures when a page-entry transition ends", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    expect(page.settle().props.style?.marginTop).toBe(-11);

    // The footer moves down without resizing or mutating anything the observers watch.
    page.setFooterTop(560);
    page.notifyEnd("transitionend");
    page.flushFrames();
    expect(page.settle().props.style?.marginTop).toBeUndefined();
  });

  it("moves Play by the row's real outer height, not the info bar box", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    // A border or theme margin outside the info bar: the surface is 64 tall, the bar 48.
    page.setSurfaceHeight(64);
    const rendered = page.settle();
    const marginTop = rendered.props.style?.marginTop as number;
    expect(marginTop).toBe(-27);
    // The row's 64px push is clipped to 37px, leaving Play's button 4px above the footer.
    expect(414 + (64 + marginTop) + 64).toBe(519 - 4);
  });

  it("falls back to the section bottom when the Play button cannot be found", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.setHasButton(false);
    const rendered = page.settle();
    // Section bottom 80: floor(519 - 4 - 414 - 80) = 21, so 27px of the row is clipped.
    expect(rendered.props.style?.marginTop).toBe(-27);
  });

  it("measures the same room with the joined Play bar's extra padding", async () => {
    const page = await setup({ pushPlayDown: true });
    page.setHeaderBottom(700);
    page.settle();
    expect(page.settle().props.className).toBe("decky-metadata-hltb-joined");

    // The art moves up while joined: the section's added padding must not count as button height.
    page.setHeaderBottom(400);
    page.notifyMutation();
    page.flushFrames();
    const rendered = page.settle();
    expect(rendered.props.className ?? "").not.toContain("decky-metadata-hltb-joined");
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
    expect(rendered.props.style?.marginTop).toBeUndefined();
  });

  it("falls back to the joined overlay when no room is left above the footer", async () => {
    const page = await setup({ pushPlayDown: true });
    page.setHeaderBottom(700);
    page.settle();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).not.toContain("decky-metadata-hltb-flow");
    expect(rendered.props.className).toBe("decky-metadata-hltb-joined");
    expect(rendered.props.style?.marginTop).toBeUndefined();
    page.expectJoinedSurface();
  });

  it("pushes Play down fully when the setting is off, even with no room", async () => {
    const page = await setup({ style: "default", pushPlayDown: true, respectMenuBar: false });
    page.setHeaderBottom(700);
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
    expect(rendered.props.style?.marginTop).toBeUndefined();
  });

  it("does not oscillate on repeated settle passes", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.settle();
    let rendered = page.settle();
    expect(rendered.props.style?.marginTop).toBe(-11);
    for (let index = 0; index < 3; index += 1) {
      page.notifyTheme();
      page.notifyResize();
      page.flushFrames();
      rendered = page.settle();
      expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
      expect(rendered.props.style?.marginTop).toBe(-11);
    }
  });

  it("grows the push back when the footer gets shorter", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.settle();
    expect(page.settle().props.style?.marginTop).toBe(-11);

    page.setFooterHeight(0);
    page.notifyResize();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
    expect(rendered.props.style?.marginTop).toBeUndefined();
  });

  it("keeps the times in their own row when no save status bar touches the art", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.settle();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
  });

  it("stays on the art while the native Cloud row sits at its bottom edge", async () => {
    const page = await setup({ pushPlayDown: true });
    page.statusBar({ top: page.artRect.bottom });
    page.settle();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).not.toContain("decky-metadata-hltb-flow");
    // The overlay fallback joins the Play blur again, as with the setting off.
    expect(rendered.props.className).toBe("decky-metadata-hltb-joined");
    page.expectJoinedSurface();
    expect(rendered.props.style?.marginTop).toBeUndefined();
  });

  it("moves to the overlay when a status bar appears after the page loaded", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.settle();
    page.flushFrames();
    let rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");

    const bar = page.statusBar({ top: page.artRect.bottom });
    expect(bar.getBoundingClientRect().top).toBe(page.artRect.bottom + 45);
    page.notifyMutation();
    page.flushFrames();
    rendered = page.settle();
    expect(statsClassOf(rendered)).not.toContain("decky-metadata-hltb-flow");
  });

  it("returns to the flow layout when that status bar goes away", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.settle();
    page.flushFrames();
    let rendered = page.settle();

    const bar = page.statusBar({ top: page.artRect.bottom });
    page.notifyMutation();
    page.flushFrames();
    rendered = page.settle();
    expect(statsClassOf(rendered)).not.toContain("decky-metadata-hltb-flow");

    page.dropBar(bar);
    page.notifyMutation();
    page.flushFrames();
    rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
  });

  it("re-evaluates the layout when a theme change alone moves the art onto a status bar", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.statusBar({ top: page.artRect.bottom + 100 });
    page.settle();
    page.flushFrames();
    let rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");

    // The theme repaints: no container mutation, no resize, only a head change.
    page.extendArt(page.artRect.bottom + 145);
    page.notifyTheme();
    page.flushFrames();
    rendered = page.settle();
    expect(statsClassOf(rendered)).not.toContain("decky-metadata-hltb-flow");
  });

  it("does not toggle the layout when updates leave the geometry unchanged", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.settle();
    page.flushFrames();
    let rendered = page.settle();
    const flow = statsClassOf(rendered);
    expect(flow).toContain("decky-metadata-hltb-flow");
    for (let index = 0; index < 3; index += 1) {
      page.notifyTheme();
      page.notifyResize();
      page.flushFrames();
      rendered = page.settle();
      expect(statsClassOf(rendered)).toBe(flow);
    }

    page.statusBar({ top: page.artRect.bottom });
    page.notifyMutation();
    page.flushFrames();
    rendered = page.settle();
    const overlay = statsClassOf(rendered);
    expect(overlay).not.toContain("decky-metadata-hltb-flow");
    for (let index = 0; index < 3; index += 1) {
      page.notifyTheme();
      page.notifyResize();
      page.flushFrames();
      rendered = page.settle();
      expect(statsClassOf(rendered)).toBe(overlay);
    }
  });

  it("keeps the times in flow when the status bar is below the Play row", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.statusBar({ top: page.artRect.bottom + 56 });
    page.settle();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
  });

  it("ignores status bars that are empty, hidden, or out of flow", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.statusBar({ top: page.artRect.bottom, text: "" });
    page.statusBar({ top: page.artRect.bottom, style: { display: "none" } });
    page.statusBar({ top: page.artRect.bottom, style: { visibility: "hidden" } });
    page.statusBar({ top: page.artRect.bottom, style: { position: "absolute" } });
    page.settle();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
  });

  it("counts artwork that extends below the header image", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.extendArt(page.artRect.bottom + 30);
    page.statusBar({ top: page.artRect.bottom + 30 });
    page.settle();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).not.toContain("decky-metadata-hltb-flow");
  });

  it("ignores a full-bleed backdrop image that is wider than the art", async () => {
    const page = await setup({ style: "default", pushPlayDown: true });
    page.extendArt(page.artRect.bottom + 800, page.artRect.width * 2);
    page.statusBar({ top: page.artRect.bottom + 200 });
    page.settle();
    page.flushFrames();
    const rendered = page.settle();
    expect(statsClassOf(rendered)).toContain("decky-metadata-hltb-flow");
  });

  it("mirrors instead of joining when the native Play surface has no blur", async () => {
    const page = await setup({ backdrop: "none" });
    let rendered = page.settle();
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("none");

    rendered = await page.setBlur("blur");
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("blur(8px)");
  });

  it("leaves the row blurless when the user turns blur off", async () => {
    const page = await setup({ blur: "none" });
    const rendered = page.settle();
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("none");
  });

  it("mirrors the Play surface for the clean styles without joining", async () => {
    const page = await setup({ style: "clean" });
    let rendered = page.settle();
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("blur(3px)");

    page.setContainsRow(true);
    page.notifyTheme();
    page.expectSurface("blur(3px)", { background: "transparent", opacity: "1" });

    page.setHasPlay(false);
    page.notifyTheme();
    expect(Object.fromEntries(page.properties)).toEqual({ "--unrelated-sentinel": "keep" });
    expect(page.resizers.filter((observer) => observer.connected)).toHaveLength(0);

    page.setHasPlay(true);
    page.notifyTheme();
    page.expectSurface("blur(3px)", { background: "transparent", opacity: "1" });
    rendered = page.settle();
    expect(rendered.props.className).toBeUndefined();
  });

  it("tracks the bar height and unjoins when the theme drops its blur", async () => {
    const page = await setup();
    let rendered = page.settle();
    page.expectJoinedSurface();

    page.setBarHeight(60);
    page.notifyResize();
    rendered = page.settle();
    expect(ruleOf(rendered)).toContain("margin-top: calc(0px - 60px); padding-top: calc(16px + 60px)");
    page.expectJoinedSurface();

    page.setBackdrop("none");
    page.notifyTheme();
    rendered = page.settle();
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    page.expectSurface("none");

    page.setBackdrop("blur(9px)");
    page.notifyTheme();
    rendered = page.settle();
    expect(rendered.props.className).toBe("decky-metadata-hltb-joined");
    expect(ruleOf(rendered)).toContain("margin-top: calc(0px - 60px); padding-top: calc(16px + 60px)");
    page.expectHours(rendered);
  });

  it("removes the joined surface and stops observing when disabled", async () => {
    const page = await setup();
    expect(ruleOf(page.settle())).toBeDefined();

    const rendered = await page.setStyle("default");
    expect(rendered.props.className).toBeUndefined();
    expect(ruleOf(rendered)).toBeUndefined();
    expect(Object.fromEntries(page.properties)).toEqual({ "--unrelated-sentinel": "keep" });
    for (const observer of page.observers) expect(observer.disconnect).toHaveBeenCalledTimes(1);
    for (const observer of page.resizers) expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(page.observers.filter((observer) => observer.connected)).toHaveLength(0);
    expect(page.resizers.filter((observer) => observer.connected)).toHaveLength(0);
  });

  it("reads a saved Steam HLTB override for native Steam games", () => {
    try {
      expect(hltbInputs(65540, false, "Gothic 1 - classic")).toEqual({
        steam: 65540,
        title: "Gothic 1 - classic",
        pinned: null,
      });
      setSteamOverrideCached(65540, { hltb_game_id: 4031 });
      expect(hltbInputs(65540, false, "Gothic 1 - classic")).toEqual({
        steam: 65540,
        title: "Gothic 1 - classic",
        pinned: 4031,
      });
      setSteamOverrideCached(65540, null);
      expect(hltbInputs(65540, false, "Gothic 1 - classic")).toEqual({
        steam: 65540,
        title: "Gothic 1 - classic",
        pinned: null,
      });
    } finally {
      clearSteamOverrideCache();
    }
  });
});
