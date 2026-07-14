import { describe, expect, it, vi } from "vitest";
import {
  CONTROLLER_LAYOUT_WARNING,
  ControllerLayoutFailure,
  ControllerLayoutTargets,
  installControllerLayouts,
} from "./controllerLayouts";

type Section = "official" | "templates" | "workshop";

class TrackingMap extends Map<number, unknown> {
  writes: Array<[number, unknown]> = [];

  override set(key: number, value: unknown): this {
    this.writes.push([key, value]);
    return super.set(key, value);
  }
}

const makeHarness = (options: {
  source?: number | null;
  queryThrowsFor?: number;
  getterThrowsFor?: { section: Section; appid: number };
  malformedWorkshopSupplemental?: "array" | "record";
} = {}) => {
  const calls: string[] = [];
  const source = options.source === undefined ? 20 : options.source;
  const queryResult = { native: "query-result" };
  const query = vi.fn(function (appid: number, controller: number, filter: boolean) {
    calls.push(`query:${appid}:${controller}:${filter}`);
    if (appid === options.queryThrowsFor) throw new Error("query failed");
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
  };

  class Store {
    m_mapAppConfigs = new TrackingMap();

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
    ].map((key) => [key, Object.getOwnPropertyDescriptor(Object.getPrototypeOf(store), key)]),
  );
  const targets: ControllerLayoutTargets = { input, store };
  const failures: ControllerLayoutFailure[] = [];
  const notifications: Array<[string, string]> = [];
  const unpatchers: Array<() => void> = [];
  const control = installControllerLayouts(unpatchers, {
    discoverTargets: () => targets,
    resolveSource: (appid) => appid === 10 ? source : null,
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

const callQuery = (input: Record<string, unknown>, appid = 10) =>
  (input.QueryControllerConfigsForApp as Function)(appid, 1, true);

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
    expect(harness.calls).not.toContain("selection");
    expect(harness.calls).not.toContain("preview");
    expect(Object.getOwnPropertyDescriptor(prototype, "SetSelectedConfigForApp"))
      .toEqual(selectedDescriptor);
    expect(Object.getOwnPropertyDescriptor(prototype, "PreviewConfigForAppAndController"))
      .toEqual(previewDescriptor);
  });

  it.each([
    ["query", (h: ReturnType<typeof makeHarness>) => callQuery(h.input)],
    ["official", (h: ReturnType<typeof makeHarness>) => h.store.GetOfficialConfigsForApp(10, 1)],
    ["templates", (h: ReturnType<typeof makeHarness>) => h.store.GetTemplateConfigsForApp(10, 1)],
    ["workshop", (h: ReturnType<typeof makeHarness>) => h.store.GetWorkshopConfigsForApp(10, 1)],
  ] as const)("preserves a native %s throw without retrying the original", (section, invoke) => {
    const harness = section === "query"
      ? makeHarness({ queryThrowsFor: 10 })
      : makeHarness({ getterThrowsFor: { section: section as Section, appid: 10 } });

    expect(() => invoke(harness)).toThrow(`${section} failed`);
    expect(harness.calls.filter((call) => call.startsWith(`${section}:10`))).toHaveLength(1);
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
      resolveSource: () => 20,
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

  it.each([2, 3, 4])(
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
      ].map(([target, key]) => Object.getOwnPropertyDescriptor(target, key as string));
      let definitions = 0;
      let threw = false;
      let restoredBeforeNotify = false;

      const control = installControllerLayouts([], {
        discoverTargets: () => harness.targets,
        resolveSource: () => 20,
        reportFailure: () => undefined,
        notify: () => {
          restoredBeforeNotify = [
            Object.getOwnPropertyDescriptor(harness.input, "QueryControllerConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetOfficialConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetTemplateConfigsForApp"),
            Object.getOwnPropertyDescriptor(prototype, "GetWorkshopConfigsForApp"),
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

  it("sets disabled state before notifying and swallows a throwing notifier", () => {
    const harness = makeHarness();
    harness.unpatchers[0]();
    let control: ReturnType<typeof installControllerLayouts>;
    let disabledDuringNotify = false;
    const query = harness.query;
    query.mockImplementation(function (appid: number) {
      if (appid === 20) throw new Error("supplemental failed");
      return harness.queryResult;
    });

    control = installControllerLayouts([], {
      discoverTargets: () => harness.targets,
      resolveSource: (appid) => appid === 10 ? 20 : null,
      reportFailure: () => undefined,
      notify: () => {
        disabledDuringNotify = control.isDisabled();
        throw new Error("toaster unavailable");
      },
      maxAttempts: 1,
    });

    expect(() => callQuery(harness.input)).not.toThrow();
    expect(disabledDuringNotify).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(callQuery(harness.input)).toBe(harness.queryResult);
    expect(query).toHaveBeenCalledTimes(3);
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
      resolveSource: (appid) => appid === 10 ? 20 : null,
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
      resolveSource: () => null,
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
    });

    expect(first.unpatchers).toHaveLength(1);
    first.unpatchers[0]();
    first.unpatchers[0]();
    expect(descriptors()).toEqual(originals);

    const secondUnpatchers: Array<() => void> = [];
    const second = installControllerLayouts(secondUnpatchers, {
      discoverTargets: () => first.targets,
      resolveSource: () => null,
      reportFailure: () => undefined,
      notify: () => undefined,
      maxAttempts: 1,
    });
    expect(second.isInstalled()).toBe(true);
    secondUnpatchers[0]();
    expect(descriptors()).toEqual(originals);
  });
});
