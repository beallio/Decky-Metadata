import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ findModuleChild: vi.fn() }));

import {
  discoverControllerTabsTarget,
  installControllerTabPersistence,
  resolveControllerChooserKey,
} from "./controllerTabPersistence";
import type { ControllerLayoutContext } from "./controllerLayoutPolicy";

const matchedShortcut = (): ControllerLayoutContext => ({
  isNonSteamShortcut: true,
  matchedSourceAppid: 55150,
});

const nativeApp = (): ControllerLayoutContext => ({
  isNonSteamShortcut: false,
  matchedSourceAppid: null,
});

const chooserTabs = (
  appid = 3213262460,
  controllerIndex = 0,
  includeOfficial = false,
  idPrefix = "",
): Array<{ id: string; content: { props: Record<string, unknown> } }> => [
  { id: `${idPrefix}templates`, content: { props: { appid, controllerIndex } } },
  ...(includeOfficial ? [{ id: `${idPrefix}official`, content: { props: { appid, controllerIndex } } }] : []),
  { id: `${idPrefix}community`, content: { props: { appid, controllerIndex } } },
  { id: `${idPrefix}search`, content: { props: { appid, controllerIndex } } },
];

const resolverDependencies = (options: {
  context?: ControllerLayoutContext;
  controllerType?: number | null;
} = {}) => ({
  resolveContext: vi.fn(() => options.context ?? matchedShortcut()),
  resolveControllerType: vi.fn(() => options.controllerType === undefined ? 102 : options.controllerType),
});

const chooserHeader = function () {
  const activeTab = "templates";
  const tabs = [];
  const onShowTab = () => undefined;
  return [activeTab, tabs, onShowTab];
};

const makeTabsModule = () => {
  const originalRender = vi.fn(function (this: unknown, props: Record<string, unknown>, marker?: unknown) {
    return { props, marker, thisValue: this };
  });
  const memo: Record<string, unknown> = {};
  Object.defineProperty(memo, "type", {
    value: originalRender,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  return {
    memo,
    module: { Header: chooserHeader, Tabs: memo },
    originalDescriptor: Object.getOwnPropertyDescriptor(memo, "type")!,
    originalRender,
  };
};

const dependenciesForModule = (
  module: unknown,
  options: Parameters<typeof resolverDependencies>[0] = {},
) => ({
  ...resolverDependencies(options),
  findModuleChild: (predicate: (candidate: unknown) => unknown) => predicate(module),
});

const render = (
  memo: Record<string, unknown>,
  props: Record<string, unknown>,
  marker = "marker",
  thisValue: unknown = { render: true },
) => (memo.type as Function).call(thisValue, props, marker) as {
  props: Record<string, unknown>;
  marker: unknown;
  thisValue: unknown;
};

describe("resolveControllerChooserKey", () => {
  it("derives independent stable keys only for the verified chooser signature", () => {
    const dependencies = resolverDependencies();

    expect(resolveControllerChooserKey(chooserTabs(3213262460, 0), dependencies)).toEqual({
      displayedAppid: 3213262460,
      controllerIndex: 0,
    });
    expect(resolveControllerChooserKey(chooserTabs(2155012430, 1), dependencies)).toEqual({
      displayedAppid: 2155012430,
      controllerIndex: 1,
    });
  });

  it("accepts Steam's generated prefix while retaining the exact tab IDs", () => {
    expect(resolveControllerChooserKey(
      chooserTabs(3213262460, 0, false, "«r99»"),
      resolverDependencies(),
    )).toEqual({ displayedAppid: 3213262460, controllerIndex: 0 });
  });

  it("derives the chooser key when the static Templates tab has no app context", () => {
    const tabs = chooserTabs();
    tabs[0] = { id: "templates", content: { props: {} } };
    expect(resolveControllerChooserKey(tabs, resolverDependencies())).toEqual({
      displayedAppid: 3213262460,
      controllerIndex: 0,
    });
  });

  it.each([
    ["missing chooser tab", chooserTabs().slice(0, 2), {}],
    ["malformed tab id", [{ id: null, content: { props: { appid: 3213262460, controllerIndex: 0 } } }, ...chooserTabs().slice(1)], {}],
    ["missing Community content", [
      chooserTabs()[0],
      { id: "community" },
      chooserTabs()[2],
    ], {}],
    ["inconsistent content", [
      ...chooserTabs(),
      { id: "official", content: { props: { appid: 3213262461, controllerIndex: 0 } } },
    ], {}],
    ["native app", chooserTabs(), { context: nativeApp() }],
    ["unmatched shortcut", chooserTabs(), {
      context: { isNonSteamShortcut: true, matchedSourceAppid: null },
    }],
    ["Steam Deck", chooserTabs(), { controllerType: 4 }],
    ["unknown controller", chooserTabs(), { controllerType: null }],
  ])("rejects %s", (_label, tabs, options) => {
    expect(resolveControllerChooserKey(tabs, resolverDependencies(options))).toBeNull();
  });
});

describe("discoverControllerTabsTarget", () => {
  it("requires every structural header marker and selects the memo object rather than its header", () => {
    const target = makeTabsModule();
    const find = (predicate: (candidate: unknown) => unknown) => predicate(target.module);

    expect(discoverControllerTabsTarget(find)).toEqual({
      memo: target.memo,
      descriptor: target.originalDescriptor,
    });

    const partialHeader = function () {
      const activeTab = "x";
      const tabs = [];
      return [activeTab, tabs];
    };
    expect(discoverControllerTabsTarget((predicate) => predicate({ Header: partialHeader, Tabs: target.memo })))
      .toBeNull();
  });

  it.each([
    ["non-callable type", { type: null }],
    ["accessor type", Object.defineProperty({}, "type", { get: () => chooserHeader, configurable: true })],
    ["non-writable type", Object.defineProperty({}, "type", { value: chooserHeader, writable: false, configurable: true })],
    ["non-configurable type", Object.defineProperty({}, "type", { value: chooserHeader, writable: true, configurable: false })],
  ])("fails open for %s descriptors", (_label, memo) => {
    expect(discoverControllerTabsTarget((predicate) => predicate({ Header: chooserHeader, Tabs: memo })))
      .toBeNull();
  });
});

describe("installControllerTabPersistence", () => {
  it("preserves a selected generated Steam tab ID across a direct remount", () => {
    const target = makeTabsModule();
    const control = installControllerTabPersistence(dependenciesForModule(target.module));
    const tabs = chooserTabs(3213262460, 0, false, "«r99»");
    control.ensureInstalled();

    const first = render(target.memo, {
      tabs,
      activeTab: "«r99»templates",
      onShowTab: () => undefined,
    });
    (first.props.onShowTab as Function)("«r99»community");

    const remounted = render(target.memo, {
      tabs: [...tabs, { id: "«r99»user", content: { props: { appid: 3213262460, controllerIndex: 0 } } }],
      activeTab: "«r99»user",
      onShowTab: () => undefined,
    });
    expect(remounted.props.activeTab).toBe("«r99»community");
  });

  it("records a selected available tab, preserves callback semantics, and restores it after a native reset", () => {
    const target = makeTabsModule();
    const control = installControllerTabPersistence(dependenciesForModule(target.module));
    const callbackThis = { callback: true };
    const onShowTab = vi.fn(function (this: unknown, tab: string, extra: string) {
      expect(this).toBe(callbackThis);
      return `${tab}:${extra}`;
    });

    expect(control.ensureInstalled()).toBe(true);
    const first = render(target.memo, {
      tabs: chooserTabs(),
      activeTab: "templates",
      onShowTab,
      unrelated: "retained",
    });
    expect(first.marker).toBe("marker");
    expect(first.props.unrelated).toBe("retained");
    expect(first.props.onShowTab).not.toBe(onShowTab);
    expect((first.props.onShowTab as Function).call(callbackThis, "community", "extra"))
      .toBe("community:extra");
    expect(onShowTab).toHaveBeenCalledWith("community", "extra");
    expect(control.rememberedTab(3213262460, 0)).toBe("community");

    const remounted = render(target.memo, {
      tabs: chooserTabs(),
      activeTab: "templates",
      onShowTab,
    });
    expect(remounted.props.activeTab).toBe("community");
  });

  it("keeps independent appid/controller memories, clears only fresh queries, and preserves direct filter queries", () => {
    const target = makeTabsModule();
    const control = installControllerTabPersistence(dependenciesForModule(target.module));
    control.ensureInstalled();

    const remember = (appid: number, controllerIndex: number, tab: string) => {
      const output = render(target.memo, {
        tabs: chooserTabs(appid, controllerIndex),
        activeTab: "templates",
        onShowTab: () => undefined,
      });
      (output.props.onShowTab as Function)(tab);
    };
    // Exercise both dimensions independently: a key based on only appid or
    // only controller index would conflate at least two of these memories.
    remember(3213262460, 0, "community");
    remember(3213262460, 1, "search");
    remember(2155012430, 0, "templates");
    remember(2155012430, 1, "community");
    control.beforeControllerQuery(3213262460, 0, false);
    expect(control.rememberedTab(3213262460, 0)).toBe("community");
    expect(control.rememberedTab(3213262460, 1)).toBe("search");
    expect(control.rememberedTab(2155012430, 0)).toBe("templates");
    expect(control.rememberedTab(2155012430, 1)).toBe("community");
    control.beforeControllerQuery(3213262460, 0, true);
    expect(control.rememberedTab(3213262460, 0)).toBeNull();
    expect(control.rememberedTab(3213262460, 1)).toBe("search");
    expect(control.rememberedTab(2155012430, 0)).toBe("templates");
    expect(control.rememberedTab(2155012430, 1)).toBe("community");
  });

  it("installs before the first chooser selection on a fresh query and preserves it across a direct remount", () => {
    const target = makeTabsModule();
    const control = installControllerTabPersistence(dependenciesForModule(target.module));

    expect(control.isInstalled()).toBe(false);
    control.beforeControllerQuery(3213262460, 0, true);
    expect(control.isInstalled()).toBe(true);
    expect(control.rememberedTab(3213262460, 0)).toBeNull();

    const first = render(target.memo, {
      tabs: chooserTabs(),
      activeTab: "templates",
      onShowTab: () => undefined,
    });
    (first.props.onShowTab as Function)("community");
    expect(control.rememberedTab(3213262460, 0)).toBe("community");

    control.beforeControllerQuery(3213262460, 0, false);
    expect(control.rememberedTab(3213262460, 0)).toBe("community");
    const remounted = render(target.memo, {
      tabs: chooserTabs(),
      activeTab: "templates",
      onShowTab: () => undefined,
    });
    expect(remounted.props.activeTab).toBe("community");
  });

  it("does not invent a saved tab, deletes an unavailable remembered id, and lets native state pass through", () => {
    const target = makeTabsModule();
    const control = installControllerTabPersistence(dependenciesForModule(target.module));
    control.ensureInstalled();
    const first = render(target.memo, {
      tabs: chooserTabs(3213262460, 0, true),
      activeTab: "templates",
      onShowTab: () => undefined,
    });
    (first.props.onShowTab as Function)("official");
    const remounted = render(target.memo, {
      tabs: chooserTabs(),
      activeTab: "templates",
      onShowTab: () => undefined,
    });

    expect(remounted.props.activeTab).toBe("templates");
    expect(control.rememberedTab(3213262460, 0)).toBeNull();
  });

  it("does not alter native, unmatched, type-4, unknown-controller, or malformed chooser renders", () => {
    const target = makeTabsModule();
    const variants = [
      dependenciesForModule(target.module, { context: nativeApp() }),
      dependenciesForModule(target.module, { context: { isNonSteamShortcut: true, matchedSourceAppid: null } }),
      dependenciesForModule(target.module, { controllerType: 4 }),
      dependenciesForModule(target.module, { controllerType: null }),
    ];

    for (const dependencies of variants) {
      const control = installControllerTabPersistence(dependencies);
      control.ensureInstalled();
      const props = { tabs: chooserTabs(), activeTab: "templates", onShowTab: () => undefined };
      expect(render(target.memo, props).props).toBe(props);
      control.cleanup();
    }
  });

  it("keeps selected memory even when the native callback throws", () => {
    const target = makeTabsModule();
    const control = installControllerTabPersistence(dependenciesForModule(target.module));
    control.ensureInstalled();
    const rendered = render(target.memo, {
      tabs: chooserTabs(),
      activeTab: "templates",
      onShowTab: () => { throw new Error("native callback failed"); },
    });

    expect(() => (rendered.props.onShowTab as Function)("community")).toThrow("native callback failed");
    expect(control.rememberedTab(3213262460, 0)).toBe("community");
  });

  it("is lazily retryable and idempotent, reports discovery errors only once, and restores the exact descriptor on cleanup", () => {
    const target = makeTabsModule();
    const diagnostic = vi.fn();
    let calls = 0;
    const control = installControllerTabPersistence({
      ...resolverDependencies(),
      findModuleChild: (predicate) => {
        calls += 1;
        if (calls === 1) return null;
        return predicate(target.module);
      },
      reportDiagnostic: diagnostic,
    });
    expect(control.ensureInstalled()).toBe(false);
    expect(control.ensureInstalled()).toBe(true);
    expect(control.ensureInstalled()).toBe(true);
    expect(control.isInstalled()).toBe(true);
    control.cleanup();
    control.cleanup();
    expect(Object.getOwnPropertyDescriptor(target.memo, "type")).toEqual(target.originalDescriptor);
    expect(control.isInstalled()).toBe(false);

    const throwing = installControllerTabPersistence({
      ...resolverDependencies(),
      findModuleChild: () => { throw new Error("webpack unavailable"); },
      reportDiagnostic: diagnostic,
    });
    expect(throwing.ensureInstalled()).toBe(false);
    expect(throwing.ensureInstalled()).toBe(false);
    expect(diagnostic).toHaveBeenCalledTimes(1);
  });

  it("rolls back a descriptor transaction failure without retaining installation state", () => {
    const target = makeTabsModule();
    let calls = 0;
    const control = installControllerTabPersistence({
      ...dependenciesForModule(target.module),
      defineProperty: (object, key, descriptor) => {
        calls += 1;
        Object.defineProperty(object, key, descriptor);
        if (calls === 1) throw new Error("install failed after write");
        return object;
      },
    });

    expect(control.ensureInstalled()).toBe(false);
    expect(Object.getOwnPropertyDescriptor(target.memo, "type")).toEqual(target.originalDescriptor);
    expect(control.isInstalled()).toBe(false);
  });
});
