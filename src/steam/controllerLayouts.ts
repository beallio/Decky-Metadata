import type {
  ControllerConfiguratorStoreBoundary,
  SteamInputBoundary,
  SteamInternals,
} from "../types";
import type { Unpatch } from "./core";
import {
  filterControllerSearchConfigs,
  isNativeSteamAppid,
  mergeCommunityConfigs,
  mergeOfficialConfigs,
  mergeRecommendedTemplates,
  type ControllerLayoutContext,
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
  section: "discovery" | "install" | "query" | "official" | "templates" | "workshop" |
    "search";
  code: string;
  displayedAppid?: number;
  matchedAppid?: number;
  detail?: string;
};

type GetterSection = "official" | "templates" | "workshop";
type TimerHandle = unknown;

export type ControllerLayoutDependencies = {
  discoverTargets: () => ControllerLayoutTargets | null;
  resolveContext: (displayedAppid: number) => ControllerLayoutContext;
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
    m_mapAppConfigs: {
      has: (appid: number) => boolean;
      set: (appid: number, value: unknown) => unknown;
    };
  };
  storePrototype: object;
  descriptors: Array<{
    target: object;
    key: "QueryControllerConfigsForApp" |
      "GetOfficialConfigsForApp" |
      "GetTemplateConfigsForApp" |
      "GetWorkshopConfigsForApp" |
      "GetAllConfigs";
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
    typeof targets.store.m_mapAppConfigs?.has !== "function" ||
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
  const searchDescriptor = Object.getOwnPropertyDescriptor(storePrototype, "GetAllConfigs");
  if (!callableDataDescriptor(searchDescriptor)) return null;
  descriptors.push({
    target: storePrototype,
    key: "GetAllConfigs",
    descriptor: searchDescriptor,
  });

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

type SupplementalQueryKey = {
  sourceAppid: number;
  controllerIndex: number;
  filterOtherControllerTypes: boolean;
};

const supplementalQueryKey = (
  sourceAppid: number,
  args: readonly unknown[],
): SupplementalQueryKey | null => {
  const controllerIndex = args[1];
  const filterOtherControllerTypes = args[2];
  if (
    !Number.isInteger(controllerIndex) ||
    (controllerIndex as number) < 0 ||
    typeof filterOtherControllerTypes !== "boolean"
  ) {
    return null;
  }
  return {
    sourceAppid,
    controllerIndex: controllerIndex as number,
    filterOtherControllerTypes,
  };
};

const sameSupplementalQueryKey = (
  left: SupplementalQueryKey | undefined,
  right: SupplementalQueryKey,
): boolean => !!left &&
  left.sourceAppid === right.sourceAppid &&
  left.controllerIndex === right.controllerIndex &&
  left.filterOtherControllerTypes === right.filterOtherControllerTypes;

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
    Pick<ControllerLayoutDependencies, "notify" | "reportFailure" | "resolveContext">,
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
  let activeDisplayedShortcutAppid: number | null = null;
  let activeMatchedSourceAppid: number | null = null;
  const supplementalSourceAppids = new Set<number>();
  const supplementalQueryKeys = new Map<number, SupplementalQueryKey>();

  const trip = (failure: ControllerLayoutFailure): void => {
    if (disabled || cleanedUp) return;
    disabled = true;
    activeDisplayedShortcutAppid = null;
    activeMatchedSourceAppid = null;
    supplementalSourceAppids.clear();
    supplementalQueryKeys.clear();
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
    const establishDisplayedContext = (displayedAppid: unknown): number | null => {
      activeDisplayedShortcutAppid = null;
      activeMatchedSourceAppid = null;
      if (!validAppid(displayedAppid)) return null;
      const context: unknown = dependencies.resolveContext(displayedAppid);
      if (
        typeof context !== "object" ||
        context === null ||
        typeof (context as ControllerLayoutContext).isNonSteamShortcut !== "boolean"
      ) {
        throw new Error("invalid controller layout context");
      }
      const isNonSteamShortcut = (context as ControllerLayoutContext).isNonSteamShortcut;
      const matchedAppid = (context as ControllerLayoutContext).matchedSourceAppid;
      if (
        matchedAppid !== null &&
        (
          !isNativeSteamAppid(matchedAppid) ||
          matchedAppid === displayedAppid ||
          !isNonSteamShortcut
        )
      ) {
        throw new Error("invalid matched appid");
      }
      if (!isNonSteamShortcut) {
        if (matchedAppid !== null) throw new Error("native context has matched appid");
        if (supplementalSourceAppids.has(displayedAppid)) {
          supplementalSourceAppids.delete(displayedAppid);
          supplementalQueryKeys.delete(displayedAppid);
        }
        return null;
      }
      activeDisplayedShortcutAppid = displayedAppid;
      if (matchedAppid === null) return null;
      activeMatchedSourceAppid = matchedAppid;
      return matchedAppid;
    };
    const inputEntry = targets.descriptors[0];
    const originalQuery = inputEntry.descriptor.value;
    const queryWrapper = function (this: unknown, ...args: unknown[]) {
      const nativeResult = originalQuery.apply(this, args);
      if (disabled) return nativeResult;
      const displayedAppid = args[0];
      const validDisplayedAppid = validAppid(displayedAppid) ? displayedAppid : undefined;
      let matchedAppid: number | null = null;
      try {
        matchedAppid = establishDisplayedContext(displayedAppid);
        if (matchedAppid === null || validDisplayedAppid === undefined) return nativeResult;
        const queryKey = supplementalQueryKey(matchedAppid, args);
        if (!queryKey) {
          trip({
            section: "query",
            code: "invalid-query-key",
            displayedAppid: validDisplayedAppid,
            matchedAppid,
          });
          return nativeResult;
        }
        activeMatchedSourceAppid = matchedAppid;
        const cacheExisted = targets.store.m_mapAppConfigs.has(matchedAppid);
        if (
          cacheExisted &&
          sameSupplementalQueryKey(supplementalQueryKeys.get(matchedAppid), queryKey)
        ) {
          supplementalSourceAppids.add(matchedAppid);
          return nativeResult;
        }
        targets.store.m_mapAppConfigs.set(matchedAppid, []);
        originalQuery.apply(this, [matchedAppid, ...args.slice(1)]);
        supplementalQueryKeys.set(matchedAppid, queryKey);
        supplementalSourceAppids.add(matchedAppid);
      } catch (error) {
        trip({
          section: "query",
          code: "runtime-error",
          displayedAppid: validDisplayedAppid,
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
        const validDisplayedAppid = validAppid(displayedAppid) ? displayedAppid : undefined;
        let matchedAppid: number | null = null;
        try {
          matchedAppid = establishDisplayedContext(displayedAppid);
          if (matchedAppid === null || validDisplayedAppid === undefined) return nativeBase;
          if (!Array.isArray(nativeBase)) {
            trip({
              section,
              code: "native-base-not-array",
              displayedAppid: validDisplayedAppid,
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
              displayedAppid: validDisplayedAppid,
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
            displayedAppid: validDisplayedAppid,
            matchedAppid: matchedAppid ?? undefined,
            detail: errorDetail(error),
          });
          return nativeBase;
        }
      });
    }

    const searchEntry = targets.descriptors.find(
      (candidate) => candidate.key === "GetAllConfigs",
    )!;
    const originalSearch = searchEntry.descriptor.value;
    const searchWrapper = function (this: unknown, ...args: unknown[]) {
      const nativeResult = originalSearch.apply(this, args);
      if (disabled) return nativeResult;
      const displayedAppid = activeDisplayedShortcutAppid;
      const matchedAppid = activeMatchedSourceAppid;
      try {
        const result = filterControllerSearchConfigs(
          nativeResult,
          displayedAppid,
          matchedAppid,
          supplementalSourceAppids,
        );
        if (result.ok === false) {
          trip({
            section: "search",
            code: result.reason,
            displayedAppid: displayedAppid ?? undefined,
            matchedAppid: matchedAppid ?? undefined,
          });
          return nativeResult;
        }
        return result.value;
      } catch (error) {
        trip({
          section: "search",
          code: "runtime-error",
          displayedAppid: displayedAppid ?? undefined,
          matchedAppid: matchedAppid ?? undefined,
          detail: errorDetail(error),
        });
        return nativeResult;
      }
    };

    const replacements = [
      { ...inputEntry, descriptor: { ...inputEntry.descriptor, value: queryWrapper } },
      ...(Object.keys(getterKeys) as GetterSection[]).map((section) => {
        const entry = targets.descriptors.find(
          (candidate) => candidate.key === getterKeys[section],
        )!;
        return {
          ...entry,
          descriptor: { ...entry.descriptor, value: getterWrappers.get(section)! },
        };
      }),
      { ...searchEntry, descriptor: { ...searchEntry.descriptor, value: searchWrapper } },
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
    activeDisplayedShortcutAppid = null;
    activeMatchedSourceAppid = null;
    supplementalSourceAppids.clear();
    supplementalQueryKeys.clear();
  };

  unpatchers.push(cleanup);
  attemptInstall();

  return {
    isDisabled: () => disabled,
    isInstalled: () => installed,
  };
};
