import { describe, expect, it, vi } from "vitest";
import {
  CONTROLLER_LAYOUT_WARNING,
  ControllerLayoutFailure,
  ControllerLayoutTargets,
  installControllerLayouts,
} from "./controllerLayouts";
import type { ControllerLayoutContext } from "./controllerLayoutPolicy";

type GetterSection = "official" | "templates" | "workshop";

const nativeContext = (): ControllerLayoutContext => ({
  isNonSteamShortcut: false,
  matchedSourceAppid: null,
});

const shortcutContext = (matchedSourceAppid: number | null): ControllerLayoutContext => ({
  isNonSteamShortcut: true,
  matchedSourceAppid,
});

const contextsForSources = (
  sources: ReadonlyMap<number, number>,
  unmatchedShortcuts: ReadonlySet<number> = new Set(),
) => (appid: number): ControllerLayoutContext =>
  sources.has(appid)
    ? shortcutContext(sources.get(appid)!)
    : unmatchedShortcuts.has(appid)
    ? shortcutContext(null)
    : nativeContext();

class TrackingMap extends Map<number, unknown> {
  hasCalls: number[] = [];
  writes: Array<[number, unknown]> = [];
  throwOnHas?: number;
  throwOnSet?: number;
  forbidAccess = false;

  private assertAccessAllowed(operation: string): void {
    if (this.forbidAccess) throw new Error(`${operation} forbidden`);
  }

  seed(key: number, value: unknown): void {
    Map.prototype.set.call(this, key, value);
  }

  override has(key: number): boolean {
    this.assertAccessAllowed("has");
    this.hasCalls.push(key);
    if (key === this.throwOnHas) throw new Error("has failed");
    return super.has(key);
  }

  override set(key: number, value: unknown): this {
    this.assertAccessAllowed("set");
    this.writes.push([key, value]);
    if (key === this.throwOnSet) throw new Error("set failed");
    return super.set(key, value);
  }

  override get(key: number): unknown {
    this.assertAccessAllowed("get");
    return super.get(key);
  }

  override delete(key: number): boolean {
    this.assertAccessAllowed("delete");
    return super.delete(key);
  }

  override clear(): void {
    this.assertAccessAllowed("clear");
    super.clear();
  }

  override get size(): number {
    this.assertAccessAllowed("size");
    return super.size;
  }

  override entries(): MapIterator<[number, unknown]> {
    this.assertAccessAllowed("entries");
    return super.entries();
  }

  override keys(): MapIterator<number> {
    this.assertAccessAllowed("keys");
    return super.keys();
  }

  override values(): MapIterator<unknown> {
    this.assertAccessAllowed("values");
    return super.values();
  }

  override forEach(
    callbackfn: (value: unknown, key: number, map: Map<number, unknown>) => void,
    thisArg?: unknown,
  ): void {
    this.assertAccessAllowed("forEach");
    super.forEach(callbackfn, thisArg);
  }

  override [Symbol.iterator](): MapIterator<[number, unknown]> {
    this.assertAccessAllowed("iterator");
    return super[Symbol.iterator]();
  }
}

const makeHarness = (options: {
  source?: number | null;
  resolveContext?: (appid: number) => ControllerLayoutContext;
  queryThrowsFor?: number;
  getterThrowsFor?: { section: GetterSection; appid: number };
  searchThrows?: boolean;
  searchResult?: unknown;
  preexistingSourceAppids?: number[];
  hasThrowsFor?: number;
  setThrowsFor?: number;
  populateSourceCache?: boolean;
  malformedWorkshopSupplemental?: "array" | "record";
} = {}) => {
  const calls: string[] = [];
  const source = options.source === undefined ? 20 : options.source;
  const queryResult = { native: "query-result" };
  const configMap = new TrackingMap();
  configMap.throwOnHas = options.hasThrowsFor;
  configMap.throwOnSet = options.setThrowsFor;
  for (const appid of options.preexistingSourceAppids ?? []) {
    configMap.seed(appid, [{ appID: appid }]);
  }
  const query = vi.fn(function (appid: number, controller: number, filter: boolean) {
    calls.push(`query:${appid}:${controller}:${filter}`);
    if (appid === options.queryThrowsFor) throw new Error("query failed");
    if (options.populateSourceCache !== false) {
      configMap.seed(appid, [{ appID: appid }]);
    }
    return queryResult;
  });
  const input: Record<string, unknown> = {};
  Object.defineProperty(input, "QueryControllerConfigsForApp", {
    value: query,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  const originalQueryDescriptor = Object.getOwnPropertyDescriptor(
    input,
    "QueryControllerConfigsForApp",
  );
  const outputs = {
    officialShortcut: [{ URL: "official://shortcut" }],
    officialMatched: [{ URL: "official://matched" }],
    templatesShortcut: [{ URL: "template://shortcut", bRecommended: false }],
    templatesMatched: [
      { URL: "template://matched-generic", bRecommended: false },
      { URL: "template://matched-recommended", bRecommended: true },
    ],
    workshopShortcut: [{ URL: "workshop://shortcut" }],
    workshopMatched: [{ URL: "workshop://matched" }],
    search: [
      { appID: 20, URL: "search://wobbly" },
      { appID: 30, URL: "search://transformers" },
      { appID: 40, URL: "search://space-marine" },
      { appID: 620, URL: "search://native" },
    ],
  };

  class Store {
    m_mapAppConfigs = configMap;

    QueryConfigsForApp() {
      return undefined;
    }

    GetOfficialConfigsForApp(appid: number, controllerType: number) {
      calls.push(`official:${appid}:${controllerType}`);
      if (options.getterThrowsFor?.section === "official" && appid === options.getterThrowsFor.appid) {
        throw new Error("official failed");
      }
      return appid === 10 ? outputs.officialShortcut : outputs.officialMatched;
    }

    GetTemplateConfigsForApp(appid: number, controllerType: number) {
      calls.push(`templates:${appid}:${controllerType}`);
      if (options.getterThrowsFor?.section === "templates" && appid === options.getterThrowsFor.appid) {
        throw new Error("templates failed");
      }
      return appid === 10 ? outputs.templatesShortcut : outputs.templatesMatched;
    }

    GetWorkshopConfigsForApp(appid: number, controllerType: number) {
      calls.push(`workshop:${appid}:${controllerType}`);
      if (options.getterThrowsFor?.section === "workshop" && appid === options.getterThrowsFor.appid) {
        throw new Error("workshop failed");
      }
      if (appid !== 10 && options.malformedWorkshopSupplemental === "array") return null;
      if (appid !== 10 && options.malformedWorkshopSupplemental === "record") return [null];
      return appid === 10 ? outputs.workshopShortcut : outputs.workshopMatched;
    }

    GetAllConfigs() {
      calls.push("search");
      if (options.searchThrows) throw new Error("search failed");
      return Object.prototype.hasOwnProperty.call(options, "searchResult")
        ? options.searchResult
        : outputs.search;
    }

    SetSelectedConfigForApp() {
      calls.push("selection");
    }

    PreviewConfigForAppAndController() {
      calls.push("preview");
    }
  }

  const store = new Store();
  const originalGetterDescriptors = Object.fromEntries(
    [
      "GetOfficialConfigsForApp",
      "GetTemplateConfigsForApp",
      "GetWorkshopConfigsForApp",
      "GetAllConfigs",
    ].map((key) => [key, Object.getOwnPropertyDescriptor(Object.getPrototypeOf(store), key)]),
  );
  const targets: ControllerLayoutTargets = { input, store };
  const failures: ControllerLayoutFailure[] = [];
  const notifications: Array<[string, string]> = [];
  const unpatchers: Array<() => void> = [];
  const control = installControllerLayouts(unpatchers, {
    discoverTargets: () => targets,
    resolveContext: options.resolveContext ?? ((appid) =>
      appid === 10 ? shortcutContext(source) : nativeContext()
    ),
    reportFailure: (failure) => failures.push(failure),
    notify: (heading, body) => notifications.push([heading, body]),
    maxAttempts: 1,
  });

  return {
    calls,
    control,
    failures,
    input,
    notifications,
    originalGetterDescriptors,
    originalQueryDescriptor,
    outputs,
    query,
    queryResult,
    store,
    targets,
    unpatchers,
  };
};

const callQuery = (
  input: Record<string, unknown>,
  appid = 10,
  controllerIndex: unknown = 1,
  filterOtherControllerTypes: unknown = true,
) => (input.QueryControllerConfigsForApp as Function)(
  appid,
  controllerIndex,
  filterOtherControllerTypes,
);

describe("installControllerLayouts", () => {
  it("passes native and never-on-Steam calls through without supplemental work", () => {
    const native = makeHarness({ source: null });
    const nativeQueryResult = callQuery(native.input);
    const nativeOfficial = native.store.GetOfficialConfigsForApp(10, 7);

    expect(nativeQueryResult).toBe(native.queryResult);
    expect(nativeOfficial).toBe(native.outputs.officialShortcut);
    expect(native.calls).toEqual([
      "query:10:1:true",
      "official:10:7",
    ]);
    expect(native.store.m_mapAppConfigs.writes).toEqual([]);
    expect(native.failures).toEqual([]);
    expect(native.notifications).toEqual([]);
  });

  it("queries the displayed shortcut first and merges only intended matched sections", () => {
    const harness = makeHarness();
    const prototype = Object.getPrototypeOf(harness.store);
    const selectedDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      "SetSelectedConfigForApp",
    );
    const previewDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      "PreviewConfigForAppAndController",
    );

    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(harness.store.GetOfficialConfigsForApp(10, 4)).toEqual([
      { URL: "official://shortcut" },
      { URL: "official://matched" },
    ]);
    expect(harness.store.GetTemplateConfigsForApp(10, 4)).toEqual([
      { URL: "template://shortcut", bRecommended: false },
      { URL: "template://matched-recommended", bRecommended: true },
    ]);
    expect(harness.store.GetWorkshopConfigsForApp(10, 4)).toEqual([
      { URL: "workshop://shortcut" },
      { URL: "workshop://matched" },
    ]);

    expect(harness.calls).toEqual([
      "query:10:1:true",
      "query:20:1:true",
      "official:10:4",
      "official:20:4",
      "templates:10:4",
      "templates:20:4",
      "workshop:10:4",
      "workshop:20:4",
    ]);
    expect(harness.store.m_mapAppConfigs.writes).toEqual([[20, []]]);
    expect(harness.store.m_mapAppConfigs.hasCalls).toEqual([20]);
    expect(harness.calls).not.toContain("selection");
    expect(harness.calls).not.toContain("preview");
    expect(Object.getOwnPropertyDescriptor(prototype, "SetSelectedConfigForApp"))
      .toEqual(selectedDescriptor);
    expect(Object.getOwnPropertyDescriptor(prototype, "PreviewConfigForAppAndController"))
      .toEqual(previewDescriptor);
  });

  it("reuses identical source query keys and refreshes changed keys exactly once", () => {
    const harness = makeHarness();

    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(callQuery(harness.input, 10, 2, true)).toBe(harness.queryResult);
    expect(callQuery(harness.input, 10, 2, true)).toBe(harness.queryResult);
    expect(callQuery(harness.input, 10, 2, false)).toBe(harness.queryResult);
    expect(callQuery(harness.input, 10, 2, false)).toBe(harness.queryResult);

    expect(harness.calls).toEqual([
      "query:10:1:true",
      "query:20:1:true",
      "query:10:1:true",
      "query:10:2:true",
      "query:20:2:true",
      "query:10:2:true",
      "query:10:2:false",
      "query:20:2:false",
      "query:10:2:false",
    ]);
    expect(harness.store.m_mapAppConfigs.writes).toEqual([
      [20, []],
      [20, []],
      [20, []],
    ]);
    expect(harness.store.m_mapAppConfigs.hasCalls).toEqual([20, 20, 20, 20, 20, 20]);
  });

  it("requeries when the known source cache entry is missing", () => {
    const harness = makeHarness();

    callQuery(harness.input);
    Map.prototype.delete.call(harness.store.m_mapAppConfigs, 20);
    callQuery(harness.input);

    expect(harness.calls.filter((call) => call.startsWith("query:20"))).toHaveLength(2);
    expect(harness.store.m_mapAppConfigs.writes).toEqual([[20, []], [20, []]]);
  });

  it("isolates inactive supplemental Search records while preserving active and native records", () => {
    const sources = new Map([[10, 20], [11, 30], [12, 40]]);
    const harness = makeHarness({
      resolveContext: contextsForSources(sources),
    });

    callQuery(harness.input, 10);
    callQuery(harness.input, 11);
    expect(harness.store.GetAllConfigs()).toEqual([
      { appID: 30, URL: "search://transformers" },
      { appID: 40, URL: "search://space-marine" },
      { appID: 620, URL: "search://native" },
    ]);

    callQuery(harness.input, 12);
    expect(harness.store.GetAllConfigs()).toEqual([
      { appID: 40, URL: "search://space-marine" },
      { appID: 620, URL: "search://native" },
    ]);

    callQuery(harness.input, 10);
    expect(harness.store.GetAllConfigs()).toEqual([
      { appID: 20, URL: "search://wobbly" },
      { appID: 620, URL: "search://native" },
    ]);
    expect(harness.calls.filter((call) => call.startsWith("query:20"))).toHaveLength(1);
  });

  it("tracks absent and pre-existing supplemental caches and relinquishes on native query", () => {
    const sources = new Map([[10, 20], [11, 30]]);
    const preexisting = makeHarness({
      preexistingSourceAppids: [20],
      resolveContext: contextsForSources(sources),
    });
    callQuery(preexisting.input, 10);
    callQuery(preexisting.input, 11);
    expect(preexisting.store.GetAllConfigs()).toEqual([
      { appID: 30, URL: "search://transformers" },
      { appID: 40, URL: "search://space-marine" },
      { appID: 620, URL: "search://native" },
    ]);
    expect(preexisting.calls.filter((call) => call.startsWith("query:20")))
      .toHaveLength(1);

    const relinquished = makeHarness({
      resolveContext: contextsForSources(sources),
    });
    callQuery(relinquished.input, 10);
    callQuery(relinquished.input, 20);
    callQuery(relinquished.input, 11);
    expect(relinquished.store.GetAllConfigs()).toEqual([
      { appID: 20, URL: "search://wobbly" },
      { appID: 30, URL: "search://transformers" },
      { appID: 40, URL: "search://space-marine" },
      { appID: 620, URL: "search://native" },
    ]);
    expect(relinquished.calls.filter((call) => call.startsWith("query:20")))
      .toHaveLength(2);
    callQuery(relinquished.input, 10);
    expect(relinquished.calls.filter((call) => call.startsWith("query:20")))
      .toHaveLength(3);
  });

  it("establishes matched and no-match Search context from getters before query effects", () => {
    const sources = new Map([
      [2155012430, 55150],
      [2312439508, 15100],
    ]);
    const search = [
      { appID: 55150, URL: "search://space-marine" },
      { appID: 15100, URL: "search://assassins-creed" },
      { appID: 620, URL: "search://native" },
      { title: "opaque" },
    ];
    const harness = makeHarness({
      searchResult: search,
      resolveContext: contextsForSources(sources, new Set([3156562597])),
    });

    callQuery(harness.input, 2155012430);
    harness.calls.length = 0;
    harness.store.GetOfficialConfigsForApp(2312439508, 4);
    harness.store.m_mapAppConfigs.forbidAccess = true;
    expect(harness.store.GetAllConfigs()).toEqual([
      { appID: 15100, URL: "search://assassins-creed" },
      { appID: 620, URL: "search://native" },
      { title: "opaque" },
    ]);
    harness.store.m_mapAppConfigs.forbidAccess = false;
    expect(harness.calls).toEqual([
      "official:2312439508:4",
      "official:15100:4",
      "search",
    ]);

    callQuery(harness.input, 2312439508);
    harness.calls.length = 0;
    harness.store.GetTemplateConfigsForApp(3156562597, 4);
    harness.store.m_mapAppConfigs.forbidAccess = true;
    expect(harness.store.GetAllConfigs()).toEqual([
      { appID: 620, URL: "search://native" },
      { title: "opaque" },
    ]);
    harness.store.m_mapAppConfigs.forbidAccess = false;
    expect(harness.calls).toEqual([
      "templates:3156562597:4",
      "search",
    ]);
  });

  it("isolates the displayed shortcut across the reproduced matched and unmatched sequence", () => {
    const spaceMarineShortcut = Object.freeze({
      appID: 2155012430,
      URL: "search://space-marine-shortcut",
    });
    const assassinsCreedShortcut = Object.freeze({
      appID: 2312439508,
      URL: "search://assassins-creed-shortcut",
    });
    const wolverineShortcut = Object.freeze({
      appID: 3156562597,
      URL: "search://wolverine-shortcut",
    });
    const spaceMarineSource = Object.freeze({ appID: 55150, URL: "search://55150" });
    const assassinsCreedSource = Object.freeze({ appID: 15100, URL: "search://15100" });
    const native = Object.freeze({ appID: 620, URL: "search://native" });
    const opaque = Object.freeze({ title: "opaque" });
    const throwingAppid = Object.defineProperty({}, "appID", {
      get: () => {
        throw new Error("opaque native getter");
      },
    });
    const search = Object.freeze([
      spaceMarineShortcut,
      assassinsCreedShortcut,
      wolverineShortcut,
      spaceMarineSource,
      assassinsCreedSource,
      native,
      opaque,
      throwingAppid,
    ]);
    const sources = new Map([
      [2155012430, 55150],
      [2312439508, 15100],
    ]);
    let forbidContextResolution = false;
    const harness = makeHarness({
      searchResult: search,
      resolveContext: (appid) => {
        if (forbidContextResolution) throw new Error("context resolution forbidden");
        return contextsForSources(sources, new Set([3156562597]))(appid);
      },
    });

    callQuery(harness.input, 2155012430);
    callQuery(harness.input, 2312439508);
    forbidContextResolution = true;
    harness.store.m_mapAppConfigs.forbidAccess = true;
    const afterAssassinsCreed = harness.store.GetAllConfigs();
    harness.store.m_mapAppConfigs.forbidAccess = false;
    forbidContextResolution = false;
    expect(afterAssassinsCreed).toEqual([
      assassinsCreedShortcut,
      assassinsCreedSource,
      native,
      opaque,
      throwingAppid,
    ]);

    callQuery(harness.input, 3156562597);
    forbidContextResolution = true;
    harness.store.m_mapAppConfigs.forbidAccess = true;
    const afterWolverine = harness.store.GetAllConfigs();
    harness.store.m_mapAppConfigs.forbidAccess = false;
    forbidContextResolution = false;
    expect(afterWolverine).toEqual([
      wolverineShortcut,
      native,
      opaque,
      throwingAppid,
    ]);
  });

  it("preserves native Search identity and never touches the map from Search", () => {
    const native = makeHarness({ source: null });
    native.store.m_mapAppConfigs.forbidAccess = true;
    const nativeSearch = native.store.GetAllConfigs();
    native.store.m_mapAppConfigs.forbidAccess = false;
    expect(nativeSearch).toBe(native.outputs.search);

    const matched = makeHarness();
    callQuery(matched.input);
    const hasCalls = matched.store.m_mapAppConfigs.hasCalls.length;
    const writes = matched.store.m_mapAppConfigs.writes.length;
    matched.store.m_mapAppConfigs.forbidAccess = true;
    expect(() => matched.store.GetAllConfigs()).not.toThrow();
    matched.store.m_mapAppConfigs.forbidAccess = false;
    expect(matched.store.m_mapAppConfigs.hasCalls).toHaveLength(hasCalls);
    expect(matched.store.m_mapAppConfigs.writes).toHaveLength(writes);
  });

  it("resolves displayed context once per wrapped call and never from Search", () => {
    const resolveContext = vi.fn((appid: number) =>
      appid === 10 ? shortcutContext(20) : nativeContext()
    );
    const harness = makeHarness({ resolveContext });

    callQuery(harness.input);
    expect(resolveContext).toHaveBeenCalledTimes(1);
    harness.store.GetOfficialConfigsForApp(10, 4);
    expect(resolveContext).toHaveBeenCalledTimes(2);
    harness.store.GetAllConfigs();
    expect(resolveContext).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["query", (h: ReturnType<typeof makeHarness>) => callQuery(h.input)],
    ["official", (h: ReturnType<typeof makeHarness>) => h.store.GetOfficialConfigsForApp(10, 1)],
    ["templates", (h: ReturnType<typeof makeHarness>) => h.store.GetTemplateConfigsForApp(10, 1)],
    ["workshop", (h: ReturnType<typeof makeHarness>) => h.store.GetWorkshopConfigsForApp(10, 1)],
    ["search", (h: ReturnType<typeof makeHarness>) => h.store.GetAllConfigs()],
  ] as const)("preserves a native %s throw without retrying the original", (section, invoke) => {
    const harness = section === "query"
      ? makeHarness({ queryThrowsFor: 10 })
      : section === "search"
      ? makeHarness({ searchThrows: true })
      : makeHarness({ getterThrowsFor: { section: section as GetterSection, appid: 10 } });

    expect(() => invoke(harness)).toThrow(`${section} failed`);
    expect(harness.calls.filter((call) =>
      section === "search" ? call === "search" : call.startsWith(`${section}:10`)
    )).toHaveLength(1);
    expect(harness.failures).toEqual([]);
    expect(harness.control.isDisabled()).toBe(false);
  });

  it("rejects malformed targets without installing any descriptor", () => {
    const harness = makeHarness();
    harness.unpatchers[0]();
    const queryDescriptor = Object.getOwnPropertyDescriptor(
      harness.input,
      "QueryControllerConfigsForApp",
    );
    const getterDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(harness.store),
      "GetOfficialConfigsForApp",
    );
    const failures: ControllerLayoutFailure[] = [];
    const notifications: Array<[string, string]> = [];
    const unpatchers: Array<() => void> = [];
    const malformedStore = { ...harness.store, GetOfficialConfigsForApp: undefined };

    const control = installControllerLayouts(unpatchers, {
      discoverTargets: () => ({ input: harness.input, store: malformedStore as any }),
      resolveContext: () => shortcutContext(20),
      reportFailure: (failure) => failures.push(failure),
      notify: (heading, body) => notifications.push([heading, body]),
      maxAttempts: 1,
    });

    expect(control.isDisabled()).toBe(true);
    expect(Object.getOwnPropertyDescriptor(harness.input, "QueryControllerConfigsForApp"))
      .toEqual(queryDescriptor);
    expect(Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(harness.store),
      "GetOfficialConfigsForApp",
    )).toEqual(getterDescriptor);
    expect(failures).toHaveLength(1);
    expect(notifications).toEqual([
      [CONTROLLER_LAYOUT_WARNING.heading, CONTROLLER_LAYOUT_WARNING.body],
    ]);
  });

  it.each([1, 2, 3, 4, 5])(
    "rolls back exact descriptors when transactional install section %i fails",
    (failAt) => {
      const harness = makeHarness();
      harness.unpatchers[0]();
      const prototype = Object.getPrototypeOf(harness.store);
      const originalDescriptors = [
        [harness.input, "QueryControllerConfigsForApp"],
        [prototype, "GetOfficialConfigsForApp"],
        [prototype, "GetTemplateConfigsForApp"],
        [prototype, "GetWorkshopConfigsForApp"],
        [prototype, "GetAllConfigs"],
      ].map(([target, key]) => Object.getOwnPropertyDescriptor(target, key as string));
      let definitions = 0;
      let threw = false;
      let restoredBeforeNotify = false;

      const control = installControllerLayouts([], {
        discoverTargets: () => harness.targets,
        resolveContext: () => shortcutContext(20),
        reportFailure: () => undefined,
        notify: () => {
          restoredBeforeNotify = [
            Object.getOwnPropertyDescriptor(harness.input, "QueryControllerConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetOfficialConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetTemplateConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetWorkshopConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetAllConfigs"),
          ].every((descriptor, index) =>
            descriptor?.value === originalDescriptors[index]?.value &&
            descriptor?.writable === originalDescriptors[index]?.writable &&
            descriptor?.configurable === originalDescriptors[index]?.configurable
          );
        },
        defineProperty: (target, key, descriptor) => {
          definitions += 1;
          if (!threw && definitions === failAt) {
            threw = true;
            throw new Error(`install ${failAt} failed`);
          }
          Object.defineProperty(target, key, descriptor);
          return target;
        },
        maxAttempts: 1,
      });

      expect(control.isDisabled()).toBe(true);
      expect(restoredBeforeNotify).toBe(true);
      expect([
        Object.getOwnPropertyDescriptor(harness.input, "QueryControllerConfigsForApp"),
        Object.getOwnPropertyDescriptor(prototype, "GetOfficialConfigsForApp"),
        Object.getOwnPropertyDescriptor(prototype, "GetTemplateConfigsForApp"),
        Object.getOwnPropertyDescriptor(prototype, "GetWorkshopConfigsForApp"),
        Object.getOwnPropertyDescriptor(prototype, "GetAllConfigs"),
      ]).toEqual(originalDescriptors);
    },
  );

  it.each([
    ["query", { queryThrowsFor: 20 }, (h: ReturnType<typeof makeHarness>) => callQuery(h.input)],
    ["official", { getterThrowsFor: { section: "official", appid: 20 } }, (h: ReturnType<typeof makeHarness>) => h.store.GetOfficialConfigsForApp(10, 1)],
    ["templates", { getterThrowsFor: { section: "templates", appid: 20 } }, (h: ReturnType<typeof makeHarness>) => h.store.GetTemplateConfigsForApp(10, 1)],
    ["workshop", { getterThrowsFor: { section: "workshop", appid: 20 } }, (h: ReturnType<typeof makeHarness>) => h.store.GetWorkshopConfigsForApp(10, 1)],
  ] as const)("fails open from the %s section and disables every later section", (_section, options, invoke) => {
    const harness = makeHarness(options as any);
    const nativeOutput = invoke(harness);

    if (_section === "query") expect(nativeOutput).toBe(harness.queryResult);
    else expect(Array.isArray(nativeOutput)).toBe(true);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.failures).toHaveLength(1);
    expect(harness.notifications).toEqual([
      [CONTROLLER_LAYOUT_WARNING.heading, CONTROLLER_LAYOUT_WARNING.body],
    ]);

    harness.calls.length = 0;
    expect(harness.store.GetWorkshopConfigsForApp(10, 2)).toEqual([
      { URL: "workshop://shortcut" },
    ]);
    expect(harness.calls).toEqual(["workshop:10:2"]);
    expect(harness.failures).toHaveLength(1);
    expect(harness.notifications).toHaveLength(1);
  });

  it.each([
    [1.5, true],
    [-1, true],
    [1, "true"],
  ])("fails open on an incompatible matched query key (%s, %s)", (controller, filter) => {
    const harness = makeHarness();

    expect(callQuery(harness.input, 10, controller, filter)).toBe(harness.queryResult);
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.failures).toEqual([
      expect.objectContaining({ section: "query", code: "invalid-query-key" }),
    ]);
    expect(harness.notifications).toHaveLength(1);
  });

  it.each(["has", "set"] as const)(
    "fails open when the exact-key map %s operation throws",
    (operation) => {
      const harness = makeHarness(operation === "has"
        ? { hasThrowsFor: 20 }
        : { setThrowsFor: 20 });

      expect(callQuery(harness.input)).toBe(harness.queryResult);
      expect(harness.calls).toEqual(["query:10:1:true"]);
      expect(harness.control.isDisabled()).toBe(true);
      expect(harness.failures).toEqual([
        expect.objectContaining({ section: "query", code: "runtime-error" }),
      ]);
      expect(harness.notifications).toHaveLength(1);
    },
  );

  it("returns a malformed matched Search result and disables all five wrappers once", () => {
    const malformed = { native: "malformed-search" };
    const harness = makeHarness({ searchResult: malformed });
    callQuery(harness.input);

    expect(harness.store.GetAllConfigs()).toBe(malformed);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.failures).toEqual([
      expect.objectContaining({
        section: "search",
        code: "native-search-not-array",
        matchedAppid: 20,
      }),
    ]);
    expect(harness.notifications).toHaveLength(1);

    harness.calls.length = 0;
    callQuery(harness.input);
    harness.store.GetOfficialConfigsForApp(10, 1);
    harness.store.GetTemplateConfigsForApp(10, 1);
    harness.store.GetWorkshopConfigsForApp(10, 1);
    expect(harness.store.GetAllConfigs()).toBe(malformed);
    expect(harness.calls).toEqual([
      "query:10:1:true",
      "official:10:1",
      "templates:10:1",
      "workshop:10:1",
      "search",
    ]);
    expect(harness.failures).toHaveLength(1);
    expect(harness.notifications).toHaveLength(1);
  });

  it("returns the native Search value when plugin-only filtering throws", () => {
    const nativeSearch = new Proxy(
      [{ appID: 20, URL: "search://wobbly" }],
      {
        get(target, property, receiver) {
          if (property === "0") throw new Error("record access failed");
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const harness = makeHarness({ searchResult: nativeSearch });
    callQuery(harness.input);

    expect(harness.store.GetAllConfigs()).toBe(nativeSearch);
    expect(harness.calls.filter((call) => call === "search")).toHaveLength(1);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.failures).toEqual([
      expect.objectContaining({
        section: "search",
        code: "runtime-error",
        matchedAppid: 20,
      }),
    ]);
    expect(harness.notifications).toHaveLength(1);

    harness.calls.length = 0;
    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(harness.store.GetOfficialConfigsForApp(10, 1)).toBe(
      harness.outputs.officialShortcut,
    );
    expect(harness.store.GetTemplateConfigsForApp(10, 1)).toBe(
      harness.outputs.templatesShortcut,
    );
    expect(harness.store.GetWorkshopConfigsForApp(10, 1)).toBe(
      harness.outputs.workshopShortcut,
    );
    expect(harness.store.GetAllConfigs()).toBe(nativeSearch);
    expect(harness.calls).toEqual([
      "query:10:1:true",
      "official:10:1",
      "templates:10:1",
      "workshop:10:1",
      "search",
    ]);
    expect(harness.failures).toHaveLength(1);
    expect(harness.notifications).toHaveLength(1);
  });

  it("fails open if source resolution throws without retaining stale Search state", () => {
    let shouldThrow = false;
    const harness = makeHarness({
      resolveContext: (appid) => {
        if (shouldThrow) throw new Error("resolver failed");
        return appid === 10 ? shortcutContext(20) : nativeContext();
      },
    });
    callQuery(harness.input);
    shouldThrow = true;

    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.store.GetAllConfigs()).toBe(harness.outputs.search);
    expect(harness.failures).toEqual([
      expect.objectContaining({ section: "query", code: "runtime-error" }),
    ]);
  });

  it("fails open when getter context resolution throws after clearing stale Search state", () => {
    let failForAppid: number | null = null;
    const harness = makeHarness({
      resolveContext: (appid) => {
        if (appid === failForAppid) throw new Error("resolver failed");
        return appid === 10 ? shortcutContext(20) : nativeContext();
      },
    });
    callQuery(harness.input);
    failForAppid = 11;
    harness.calls.length = 0;

    expect(harness.store.GetOfficialConfigsForApp(11, 7)).toBe(
      harness.outputs.officialMatched,
    );
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.calls).toEqual(["official:11:7"]);
    expect(harness.failures).toEqual([
      expect.objectContaining({
        section: "official",
        code: "runtime-error",
        displayedAppid: 11,
      }),
    ]);
    expect(harness.notifications).toEqual([
      [CONTROLLER_LAYOUT_WARNING.heading, CONTROLLER_LAYOUT_WARNING.body],
    ]);

    expect(harness.store.GetAllConfigs()).toBe(harness.outputs.search);
    expect(harness.store.GetTemplateConfigsForApp(10, 1)).toBe(
      harness.outputs.templatesShortcut,
    );
    expect(harness.failures).toHaveLength(1);
    expect(harness.notifications).toHaveLength(1);
  });

  it.each([
    ["missing context fields", {}],
    ["non-boolean shortcut flag", { isNonSteamShortcut: "yes", matchedSourceAppid: null }],
    ["matched source on native context", {
      isNonSteamShortcut: false,
      matchedSourceAppid: 20,
    }],
    ["missing matched source", { isNonSteamShortcut: true }],
    ["zero matched source", { isNonSteamShortcut: true, matchedSourceAppid: 0 }],
    ["fractional matched source", { isNonSteamShortcut: true, matchedSourceAppid: 1.5 }],
    ["shortcut boundary matched source", {
      isNonSteamShortcut: true,
      matchedSourceAppid: 0x80000000,
    }],
    ["synthetic shortcut matched source", {
      isNonSteamShortcut: true,
      matchedSourceAppid: 3156562597,
    }],
    ["shortcut ceiling matched source", {
      isNonSteamShortcut: true,
      matchedSourceAppid: 0xffffffff,
    }],
    ["overflowing matched source", {
      isNonSteamShortcut: true,
      matchedSourceAppid: 0x100000000,
    }],
    ["displayed appid as matched source", {
      isNonSteamShortcut: true,
      matchedSourceAppid: 10,
    }],
  ])("fails open once for malformed resolved context: %s", (_label, context) => {
    const harness = makeHarness({
      resolveContext: () => context as ControllerLayoutContext,
    });

    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.store.GetAllConfigs()).toBe(harness.outputs.search);
    expect(harness.failures).toEqual([
      expect.objectContaining({ section: "query", code: "runtime-error" }),
    ]);
    expect(harness.notifications).toHaveLength(1);
  });

  it("sets disabled state before reporting and notifying and swallows both throws", () => {
    const harness = makeHarness();
    harness.unpatchers[0]();
    let control: ReturnType<typeof installControllerLayouts>;
    let disabledDuringReport = false;
    let disabledDuringNotify = false;
    const reportedFailures: ControllerLayoutFailure[] = [];
    let notifyCalls = 0;
    const query = harness.query;
    query.mockImplementation(function (appid: number, controller: number, filter: boolean) {
      harness.calls.push(`query:${appid}:${controller}:${filter}`);
      if (appid === 20) throw new Error("supplemental failed");
      return harness.queryResult;
    });

    control = installControllerLayouts([], {
      discoverTargets: () => harness.targets,
      resolveContext: (appid) => appid === 10 ? shortcutContext(20) : nativeContext(),
      reportFailure: (failure) => {
        disabledDuringReport = control.isDisabled();
        reportedFailures.push(failure);
        throw new Error("reporter unavailable");
      },
      notify: () => {
        notifyCalls += 1;
        disabledDuringNotify = control.isDisabled();
        throw new Error("toaster unavailable");
      },
      maxAttempts: 1,
    });

    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(disabledDuringReport).toBe(true);
    expect(disabledDuringNotify).toBe(true);
    expect(reportedFailures).toEqual([
      expect.objectContaining({ section: "query", code: "runtime-error", matchedAppid: 20 }),
    ]);
    expect(notifyCalls).toBe(1);
    expect(query).toHaveBeenCalledTimes(2);

    harness.calls.length = 0;
    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(harness.store.GetOfficialConfigsForApp(10, 1)).toBe(
      harness.outputs.officialShortcut,
    );
    expect(harness.store.GetTemplateConfigsForApp(10, 1)).toBe(
      harness.outputs.templatesShortcut,
    );
    expect(harness.store.GetWorkshopConfigsForApp(10, 1)).toBe(
      harness.outputs.workshopShortcut,
    );
    expect(harness.store.GetAllConfigs()).toBe(harness.outputs.search);
    expect(harness.calls).toEqual([
      "query:10:1:true",
      "official:10:1",
      "templates:10:1",
      "workshop:10:1",
      "search",
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    expect(reportedFailures).toHaveLength(1);
    expect(notifyCalls).toBe(1);
  });

  it.each([
    ["array", "supplemental-not-array"],
    ["record", "malformed-supplemental-record"],
  ] as const)("fails open on a malformed supplemental %s", (shape, code) => {
    const harness = makeHarness({ malformedWorkshopSupplemental: shape });

    expect(harness.store.GetWorkshopConfigsForApp(10, 1)).toEqual([
      { URL: "workshop://shortcut" },
    ]);
    expect(harness.control.isDisabled()).toBe(true);
    expect(harness.failures[0]).toMatchObject({
      section: "workshop",
      displayedAppid: 10,
      matchedAppid: 20,
      code,
    });
  });

  it("does not notify for transient discovery retries and installs when targets appear", () => {
    const harness = makeHarness();
    harness.unpatchers[0]();
    const scheduled: Array<() => void> = [];
    let ready = false;
    const notifications: Array<[string, string]> = [];
    const unpatchers: Array<() => void> = [];
    const control = installControllerLayouts(unpatchers, {
      discoverTargets: () => ready ? harness.targets : null,
      resolveContext: (appid) => appid === 10 ? shortcutContext(20) : nativeContext(),
      reportFailure: () => undefined,
      notify: (heading, body) => notifications.push([heading, body]),
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancel: () => undefined,
      maxAttempts: 3,
    });

    expect(notifications).toEqual([]);
    expect(control.isInstalled()).toBe(false);
    ready = true;
    scheduled.shift()?.();
    expect(control.isInstalled()).toBe(true);
    expect(control.isDisabled()).toBe(false);
    expect(notifications).toEqual([]);
    expect(callQuery(harness.input)).toBe(harness.queryResult);
  });

  it("disables and notifies once after bounded discovery is exhausted", () => {
    const scheduled: Array<() => void> = [];
    const failures: ControllerLayoutFailure[] = [];
    const notifications: Array<[string, string]> = [];
    const control = installControllerLayouts([], {
      discoverTargets: () => null,
      resolveContext: nativeContext,
      reportFailure: (failure) => failures.push(failure),
      notify: (heading, body) => notifications.push([heading, body]),
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancel: () => undefined,
      maxAttempts: 3,
    });

    expect(notifications).toEqual([]);
    scheduled.shift()?.();
    expect(notifications).toEqual([]);
    scheduled.shift()?.();
    expect(control.isDisabled()).toBe(true);
    expect(failures).toEqual([
      expect.objectContaining({ section: "discovery", code: "retry-exhausted" }),
    ]);
    expect(notifications).toHaveLength(1);
  });

  it("restores exact descriptors across repeated install and idempotent uninstall cycles", () => {
    const first = makeHarness();
    const prototype = Object.getPrototypeOf(first.store);
    const originals = {
      QueryControllerConfigsForApp: first.originalQueryDescriptor,
      ...first.originalGetterDescriptors,
    };
    const descriptors = () => ({
      QueryControllerConfigsForApp: Object.getOwnPropertyDescriptor(
        first.input,
        "QueryControllerConfigsForApp",
      ),
      GetOfficialConfigsForApp: Object.getOwnPropertyDescriptor(
        prototype,
        "GetOfficialConfigsForApp",
      ),
      GetTemplateConfigsForApp: Object.getOwnPropertyDescriptor(
        prototype,
        "GetTemplateConfigsForApp",
      ),
      GetWorkshopConfigsForApp: Object.getOwnPropertyDescriptor(
        prototype,
        "GetWorkshopConfigsForApp",
      ),
      GetAllConfigs: Object.getOwnPropertyDescriptor(
        prototype,
        "GetAllConfigs",
      ),
    });

    expect(first.unpatchers).toHaveLength(1);
    callQuery(first.input);
    const writesBeforeCleanup = first.store.m_mapAppConfigs.writes.length;
    first.unpatchers[0]();
    first.unpatchers[0]();
    expect(descriptors()).toEqual(originals);
    expect(first.store.m_mapAppConfigs.has(20)).toBe(true);
    expect(first.store.m_mapAppConfigs.writes).toHaveLength(writesBeforeCleanup);

    const secondUnpatchers: Array<() => void> = [];
    const second = installControllerLayouts(secondUnpatchers, {
      discoverTargets: () => first.targets,
      resolveContext: nativeContext,
      reportFailure: () => undefined,
      notify: () => undefined,
      maxAttempts: 1,
    });
    expect(second.isInstalled()).toBe(true);
    expect(first.store.GetAllConfigs()).toBe(first.outputs.search);
    secondUnpatchers[0]();
    expect(descriptors()).toEqual(originals);
  });
});
