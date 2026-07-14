import type {
  ControllerConfiguratorStoreBoundary,
  SteamInputBoundary,
  SteamInternals,
} from "../types";
import type { Unpatch } from "./core";
import {
  mergeCommunityConfigs,
  mergeOfficialConfigs,
  mergeRecommendedTemplates,
  type ControllerConfigMergeResult,
} from "./controllerLayoutPolicy";

export const CONTROLLER_LAYOUT_WARNING = {
  heading: "Controller layouts disabled",
  body: "Using Steam's standard controller layout UI until Decky Metadata is reloaded.",
} as const;

export type ControllerLayoutTargets = {
  input: SteamInputBoundary;
  store: ControllerConfiguratorStoreBoundary;
};

export type ControllerLayoutFailure = {
  section: "discovery" | "install" | "query" | "official" | "templates" | "workshop";
  code: string;
  displayedAppid?: number;
  matchedAppid?: number;
  detail?: string;
};

type GetterSection = "official" | "templates" | "workshop";
type TimerHandle = unknown;

export type ControllerLayoutDependencies = {
  discoverTargets: () => ControllerLayoutTargets | null;
  resolveSource: (displayedAppid: number) => number | null;
  reportFailure: (failure: ControllerLayoutFailure) => void;
  notify: (heading: string, body: string) => void;
  schedule: (callback: () => void, delayMs: number) => TimerHandle;
  cancel: (handle: TimerHandle) => void;
  defineProperty: (
    target: object,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
  ) => object;
  maxAttempts: number;
  retryDelayMs: number;
};

export type ControllerLayoutControl = {
  isDisabled: () => boolean;
  isInstalled: () => boolean;
};

type ValidatedTargets = {
  input: SteamInputBoundary;
  store: ControllerConfiguratorStoreBoundary & {
    m_mapAppConfigs: { set: (appid: number, value: unknown) => unknown };
  };
  storePrototype: object;
  descriptors: Array<{
    target: object;
    key: "QueryControllerConfigsForApp" |
      "GetOfficialConfigsForApp" |
      "GetTemplateConfigsForApp" |
      "GetWorkshopConfigsForApp";
    descriptor: PropertyDescriptor & { value: Function };
  }>;
};

const getterMerges: Record<
  GetterSection,
  (nativeBase: readonly unknown[], supplemental: unknown) => ControllerConfigMergeResult
> = {
  official: mergeOfficialConfigs,
  templates: mergeRecommendedTemplates,
  workshop: mergeCommunityConfigs,
};

const getterKeys: Record<GetterSection, ValidatedTargets["descriptors"][number]["key"]> = {
  official: "GetOfficialConfigsForApp",
  templates: "GetTemplateConfigsForApp",
  workshop: "GetWorkshopConfigsForApp",
};

const callableDataDescriptor = (
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: Function } =>
  !!descriptor &&
  typeof descriptor.value === "function" &&
  descriptor.writable === true &&
  descriptor.configurable === true;

const validateTargets = (targets: ControllerLayoutTargets): ValidatedTargets | null => {
  const inputDescriptor = Object.getOwnPropertyDescriptor(
    targets.input,
    "QueryControllerConfigsForApp",
  );
  const storePrototype = Object.getPrototypeOf(targets.store);
  if (
    !storePrototype ||
    typeof targets.store.QueryConfigsForApp !== "function" ||
    typeof targets.store.m_mapAppConfigs?.set !== "function" ||
    !callableDataDescriptor(inputDescriptor)
  ) {
    return null;
  }

  const descriptors: ValidatedTargets["descriptors"] = [{
    target: targets.input,
    key: "QueryControllerConfigsForApp",
    descriptor: inputDescriptor,
  }];
  for (const key of Object.values(getterKeys)) {
    const descriptor = Object.getOwnPropertyDescriptor(storePrototype, key);
    if (!callableDataDescriptor(descriptor)) return null;
    descriptors.push({ target: storePrototype, key, descriptor });
  }

  return {
    input: targets.input,
    store: targets.store as ValidatedTargets["store"],
    storePrototype,
    descriptors,
  };
};

const errorDetail = (error: unknown): string => {
  if (error instanceof Error && error.name) return error.name;
  return typeof error;
};

const validAppid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const discoverControllerLayoutTargets = (): ControllerLayoutTargets | null => {
  const internals = globalThis as unknown as SteamInternals;
  const input = internals.SteamClient?.Input;
  const store = internals.controllerConfiguratorStore;
  return input && store ? { input, store } : null;
};

const defaultSchedule = (callback: () => void, delayMs: number): TimerHandle =>
  globalThis.setTimeout(callback, delayMs);

const defaultCancel = (handle: TimerHandle): void =>
  globalThis.clearTimeout(handle as number);

export const installControllerLayouts = (
  unpatchers: Unpatch[],
  provided: Partial<ControllerLayoutDependencies> &
    Pick<ControllerLayoutDependencies, "notify" | "reportFailure" | "resolveSource">,
): ControllerLayoutControl => {
  const dependencies: ControllerLayoutDependencies = {
    discoverTargets: discoverControllerLayoutTargets,
    schedule: defaultSchedule,
    cancel: defaultCancel,
    defineProperty: Object.defineProperty,
    maxAttempts: 240,
    retryDelayMs: 500,
    ...provided,
  };
  let disabled = false;
  let installed = false;
  let cleanedUp = false;
  let timer: TimerHandle | undefined;
  let attempts = 0;
  let installedDescriptors: ValidatedTargets["descriptors"] = [];

  const trip = (failure: ControllerLayoutFailure): void => {
    if (disabled || cleanedUp) return;
    disabled = true;
    try {
      dependencies.reportFailure(failure);
    } catch (_error) {
      // Logging must not interfere with the secured native result.
    }
    try {
      dependencies.notify(
        CONTROLLER_LAYOUT_WARNING.heading,
        CONTROLLER_LAYOUT_WARNING.body,
      );
    } catch (_error) {
      // The injected or Decky notifier is strictly best effort.
    }
  };

  const restoreDescriptors = (descriptors: ValidatedTargets["descriptors"]): void => {
    for (let index = descriptors.length - 1; index >= 0; index -= 1) {
      const entry = descriptors[index];
      try {
        dependencies.defineProperty(entry.target, entry.key, entry.descriptor);
      } catch (_error) {
        // Continue restoring every other section even if Steam changed mid-unload.
      }
    }
  };

  const installValidatedTargets = (targets: ValidatedTargets): void => {
    const applied: ValidatedTargets["descriptors"] = [];
    const inputEntry = targets.descriptors[0];
    const originalQuery = inputEntry.descriptor.value;
    const queryWrapper = function (this: unknown, ...args: unknown[]) {
      const nativeResult = originalQuery.apply(this, args);
      if (disabled) return nativeResult;
      const displayedAppid = args[0];
      if (!validAppid(displayedAppid)) return nativeResult;
      let matchedAppid: number | null = null;
      try {
        matchedAppid = dependencies.resolveSource(displayedAppid);
        if (matchedAppid === null) return nativeResult;
        if (!validAppid(matchedAppid) || matchedAppid === displayedAppid) {
          throw new Error("invalid matched appid");
        }
        targets.store.m_mapAppConfigs.set(matchedAppid, []);
        originalQuery.apply(this, [matchedAppid, ...args.slice(1)]);
      } catch (error) {
        trip({
          section: "query",
          code: "runtime-error",
          displayedAppid,
          matchedAppid: matchedAppid ?? undefined,
          detail: errorDetail(error),
        });
      }
      return nativeResult;
    };

    const getterWrappers = new Map<GetterSection, Function>();
    for (const section of Object.keys(getterKeys) as GetterSection[]) {
      const key = getterKeys[section];
      const entry = targets.descriptors.find((candidate) => candidate.key === key)!;
      const originalGetter = entry.descriptor.value;
      getterWrappers.set(section, function (this: unknown, ...args: unknown[]) {
        const nativeBase = originalGetter.apply(this, args);
        if (disabled) return nativeBase;
        const displayedAppid = args[0];
        if (!validAppid(displayedAppid)) return nativeBase;
        let matchedAppid: number | null = null;
        try {
          matchedAppid = dependencies.resolveSource(displayedAppid);
          if (matchedAppid === null) return nativeBase;
          if (!validAppid(matchedAppid) || matchedAppid === displayedAppid) {
            throw new Error("invalid matched appid");
          }
          if (!Array.isArray(nativeBase)) {
            trip({
              section,
              code: "native-base-not-array",
              displayedAppid,
              matchedAppid,
            });
            return nativeBase;
          }
          const supplemental = originalGetter.apply(this, [matchedAppid, ...args.slice(1)]);
          const result = getterMerges[section](nativeBase, supplemental);
          if (result.ok === false) {
            trip({
              section,
              code: result.reason,
              displayedAppid,
              matchedAppid,
              detail: result.index === undefined ? undefined : `index:${result.index}`,
            });
            return nativeBase;
          }
          return result.value;
        } catch (error) {
          trip({
            section,
            code: "runtime-error",
            displayedAppid,
            matchedAppid: matchedAppid ?? undefined,
            detail: errorDetail(error),
          });
          return nativeBase;
        }
      });
    }

    const replacements = [
      { ...inputEntry, descriptor: { ...inputEntry.descriptor, value: queryWrapper } },
      ...targets.descriptors.slice(1).map((entry) => {
        const section = (Object.keys(getterKeys) as GetterSection[])
          .find((candidate) => getterKeys[candidate] === entry.key)!;
        return {
          ...entry,
          descriptor: { ...entry.descriptor, value: getterWrappers.get(section)! },
        };
      }),
    ];

    try {
      for (const replacement of replacements) {
        dependencies.defineProperty(
          replacement.target,
          replacement.key,
          replacement.descriptor,
        );
        const original = targets.descriptors.find((entry) => entry.key === replacement.key)!;
        applied.push(original);
      }
    } catch (error) {
      restoreDescriptors(applied);
      trip({ section: "install", code: "transaction-failed", detail: errorDetail(error) });
      return;
    }

    installedDescriptors = targets.descriptors;
    installed = true;
  };

  const attemptInstall = (): void => {
    timer = undefined;
    if (cleanedUp || disabled || installed) return;
    attempts += 1;
    let targets: ControllerLayoutTargets | null;
    try {
      targets = dependencies.discoverTargets();
    } catch (error) {
      trip({ section: "discovery", code: "discovery-error", detail: errorDetail(error) });
      return;
    }
    if (!targets) {
      if (attempts >= dependencies.maxAttempts) {
        trip({ section: "discovery", code: "retry-exhausted" });
      } else {
        try {
          timer = dependencies.schedule(attemptInstall, dependencies.retryDelayMs);
        } catch (error) {
          trip({
            section: "discovery",
            code: "retry-schedule-failed",
            detail: errorDetail(error),
          });
        }
      }
      return;
    }
    let validated: ValidatedTargets | null;
    try {
      validated = validateTargets(targets);
    } catch (error) {
      trip({
        section: "install",
        code: "target-validation-failed",
        detail: errorDetail(error),
      });
      return;
    }
    if (!validated) {
      trip({ section: "install", code: "incompatible-target" });
      return;
    }
    try {
      installValidatedTargets(validated);
    } catch (error) {
      trip({
        section: "install",
        code: "wrapper-construction-failed",
        detail: errorDetail(error),
      });
    }
  };

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timer !== undefined) {
      dependencies.cancel(timer);
      timer = undefined;
    }
    if (installedDescriptors.length > 0) {
      restoreDescriptors(installedDescriptors);
      installedDescriptors = [];
    }
    installed = false;
  };

  unpatchers.push(cleanup);
  attemptInstall();

  return {
    isDisabled: () => disabled,
    isInstalled: () => installed,
  };
};
