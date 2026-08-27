import { findModuleChild } from "@decky/ui";
import type { ControllerLayoutContext } from "./controllerLayoutPolicy";

type RequiredChooserTab = "templates" | "community" | "search";

const LEGION_GO_S_CONTROLLER_TYPE = 102;
const REQUIRED_CHOOSER_TABS: ReadonlySet<RequiredChooserTab> = new Set([
  "templates",
  "community",
  "search",
]);

export type ControllerChooserTab = {
  id: unknown;
  content?: unknown;
};

export type ControllerTabSelectionKey = Readonly<{
  displayedAppid: number;
  controllerIndex: number;
}>;

export type ControllerTabsTarget = Readonly<{
  memo: object;
  descriptor: PropertyDescriptor & { value: Function };
}>;

export type ControllerTabPersistenceDependencies = {
  resolveContext: (displayedAppid: number) => ControllerLayoutContext;
  resolveControllerType: (controllerIndex: number) => number | null;
  findModuleChild?: (predicate: (module: unknown) => unknown) => unknown;
  reportDiagnostic?: (error: unknown) => void;
  defineProperty?: (
    target: object,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
  ) => object;
};

export type ControllerTabPersistenceControl = {
  ensureInstalled: () => boolean;
  beforeControllerQuery: (
    displayedAppid: number,
    controllerIndex: number,
    storeDriven: boolean,
  ) => void;
  cleanup: () => void;
  isInstalled: () => boolean;
  rememberedTab: (displayedAppid: number, controllerIndex: number) => string | null;
};

type ChooserTab = Readonly<{
  id: string;
}>;

type ParsedChooserTabs = Readonly<{
  tabs: readonly ChooserTab[];
  displayedAppid: number;
  controllerIndex: number;
}>;

type ChooserRenderScope = Readonly<{
  key: ControllerTabSelectionKey;
  tabs: readonly ChooserTab[];
  props: Record<string, unknown>;
  onShowTab: Function;
}>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const validDisplayedAppid = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const validControllerIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const tabIdentity = (id: unknown): string | null => {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed ? trimmed : null;
};

const canonicalChooserTab = (id: string): RequiredChooserTab | null => {
  // Steam's observed chooser IDs prepend a generated `«r…»` token.  Strip
  // that one exact shape only; arbitrary suffixes must stay unrelated.
  const semanticId = id.replace(/^«r[0-9a-z]+»/i, "").toLocaleLowerCase("en-US");
  if (semanticId === "templates") return "templates";
  if (semanticId === "community" || semanticId === "community layouts") return "community";
  if (semanticId === "search") return "search";
  return null;
};

const contentNumbers = (content: unknown): {
  displayedAppid: number;
  controllerIndex: number;
} | null => {
  const contentRecord = asRecord(content);
  const props = asRecord(contentRecord?.props);
  if (!props) return null;
  const displayedAppid = props.appid ?? props.appId ?? props.nAppID;
  const controllerIndex = props.controllerIndex ?? props.nControllerIndex;
  if (!validDisplayedAppid(displayedAppid) || !validControllerIndex(controllerIndex)) return null;
  return { displayedAppid, controllerIndex };
};

const chooserTabs = (value: unknown): ParsedChooserTabs | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const output: ChooserTab[] = [];
  const seenIds = new Set<string>();
  let displayedAppid: number | undefined;
  let controllerIndex: number | undefined;

  for (const rawTab of value) {
    const tab = asRecord(rawTab);
    const id = tabIdentity(tab?.id);
    const numbers = contentNumbers(tab?.content);
    if (!id || seenIds.has(id)) return null;
    const signature = canonicalChooserTab(id);
    if ((signature === "community" || signature === "search") && !numbers) return null;
    if (numbers) {
      if (displayedAppid === undefined) displayedAppid = numbers.displayedAppid;
      if (controllerIndex === undefined) controllerIndex = numbers.controllerIndex;
      if (displayedAppid !== numbers.displayedAppid || controllerIndex !== numbers.controllerIndex) {
        return null;
      }
    }
    seenIds.add(id);
    output.push({ id });
  }

  if (!displayedAppid || controllerIndex === undefined) return null;
  const signatures = new Set(
    output.map((tab) => canonicalChooserTab(tab.id)).filter((signature): signature is RequiredChooserTab =>
      signature !== null,
    ),
  );
  for (const required of REQUIRED_CHOOSER_TABS) {
    if (!signatures.has(required)) return null;
  }
  return { tabs: output, displayedAppid, controllerIndex };
};

const contextMatchesAffectedChooser = (
  dependencies: Pick<ControllerTabPersistenceDependencies, "resolveContext" | "resolveControllerType">,
  displayedAppid: number,
  controllerIndex: number,
): boolean => {
  const context = dependencies.resolveContext(displayedAppid);
  return context?.isNonSteamShortcut === true &&
    validDisplayedAppid(context.matchedSourceAppid) &&
    context.matchedSourceAppid !== displayedAppid &&
    dependencies.resolveControllerType(controllerIndex) === LEGION_GO_S_CONTROLLER_TYPE;
};

export const resolveControllerChooserKey = (
  tabs: unknown,
  dependencies: Pick<ControllerTabPersistenceDependencies, "resolveContext" | "resolveControllerType">,
): ControllerTabSelectionKey | null => {
  try {
    const parsedTabs = chooserTabs(tabs);
    if (!parsedTabs) return null;
    const { displayedAppid, controllerIndex } = parsedTabs;
    return contextMatchesAffectedChooser(dependencies, displayedAppid, controllerIndex)
      ? { displayedAppid, controllerIndex }
      : null;
  } catch (_error) {
    return null;
  }
};

const callableWritableDescriptor = (
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: Function } => !!descriptor &&
  typeof descriptor.value === "function" &&
  descriptor.writable === true &&
  descriptor.configurable === true;

const sourceHasChooserMarkers = (candidate: unknown): boolean => {
  if (typeof candidate !== "function") return false;
  try {
    const source = Function.prototype.toString.call(candidate);
    return ["activeTab", "tabs", "onShowTab"].every((marker) => source.includes(marker));
  } catch (_error) {
    return false;
  }
};

const validTabsTarget = (value: unknown): value is ControllerTabsTarget => {
  const target = asRecord(value);
  return !!target &&
    target.memo !== null && typeof target.memo === "object" &&
    callableWritableDescriptor(target.descriptor as PropertyDescriptor | undefined);
};

export const discoverControllerTabsTarget = (
  locateModule: (predicate: (module: unknown) => unknown) => unknown,
  onError?: (error: unknown) => void,
): ControllerTabsTarget | null => {
  try {
    const target = locateModule((module) => {
      const exports = asRecord(module);
      if (!exports) return undefined;
      const values = Object.values(exports);
      if (!values.some(sourceHasChooserMarkers)) return undefined;
      const targets = values.flatMap((candidate) => {
        if (candidate === null || typeof candidate !== "object") return [];
        const descriptor = Object.getOwnPropertyDescriptor(candidate, "type");
        return callableWritableDescriptor(descriptor)
          ? [{ memo: candidate, descriptor }]
          : [];
      });
      return targets.length === 1 ? targets[0] : undefined;
    });
    return validTabsTarget(target) ? target : null;
  } catch (error) {
    try {
      onError?.(error);
    } catch (_reportError) {
      // Diagnostics must not affect Steam's native chooser.
    }
    return null;
  }
};

const defaultFindModuleChild = (predicate: (module: unknown) => unknown): unknown =>
  findModuleChild(predicate as (module: any) => any);

const selectionKey = (displayedAppid: number, controllerIndex: number): string =>
  `${displayedAppid}:${controllerIndex}`;

const renderScope = (
  propsValue: unknown,
  dependencies: Pick<ControllerTabPersistenceDependencies, "resolveContext" | "resolveControllerType">,
): ChooserRenderScope | null => {
  const props = asRecord(propsValue);
  if (!props || typeof props.onShowTab !== "function") return null;
  const parsedTabs = chooserTabs(props.tabs);
  if (!parsedTabs || !contextMatchesAffectedChooser(
    dependencies,
    parsedTabs.displayedAppid,
    parsedTabs.controllerIndex,
  )) return null;
  return {
    key: {
      displayedAppid: parsedTabs.displayedAppid,
      controllerIndex: parsedTabs.controllerIndex,
    },
    tabs: parsedTabs.tabs,
    props,
    onShowTab: props.onShowTab,
  };
};

export const installControllerTabPersistence = (
  provided: ControllerTabPersistenceDependencies,
): ControllerTabPersistenceControl => {
  const dependencies: ControllerTabPersistenceDependencies = {
    ...provided,
    findModuleChild: provided.findModuleChild ?? defaultFindModuleChild,
    defineProperty: provided.defineProperty ?? Object.defineProperty,
  };
  const rememberedTabs = new Map<string, string>();
  let installed = false;
  let cleanedUp = false;
  let installedTarget: ControllerTabsTarget | null = null;
  let reported = false;

  const reportOnce = (error: unknown): void => {
    if (reported) return;
    reported = true;
    try {
      dependencies.reportDiagnostic?.(error);
    } catch (_error) {
      // Diagnostics are optional and must remain fail-open.
    }
  };

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    rememberedTabs.clear();
    if (installedTarget) {
      try {
        dependencies.defineProperty!(
          installedTarget.memo,
          "type",
          installedTarget.descriptor,
        );
      } catch (error) {
        reportOnce(error);
      }
    }
    installed = false;
    installedTarget = null;
  };

  const ensureInstalled = (): boolean => {
    if (cleanedUp) return false;
    if (installed) return true;
    const target = discoverControllerTabsTarget(dependencies.findModuleChild!, reportOnce);
    if (!target) return false;
    const originalRender = target.descriptor.value;
    const wrappedRender = function (this: unknown, ...args: unknown[]) {
      let patchedArgs = args;
      try {
        const scope = renderScope(args[0], dependencies);
        if (scope) {
          const key = selectionKey(scope.key.displayedAppid, scope.key.controllerIndex);
          const availableIds = new Set(scope.tabs.map((tab) => tab.id));
          const remembered = rememberedTabs.get(key);
          let activeTab = scope.props.activeTab;
          if (remembered !== undefined) {
            if (availableIds.has(remembered)) activeTab = remembered;
            else rememberedTabs.delete(key);
          }
          const originalOnShowTab = scope.onShowTab;
          const onShowTab = function (this: unknown, ...callbackArgs: unknown[]) {
            const requested = tabIdentity(callbackArgs[0]);
            if (requested && availableIds.has(requested)) rememberedTabs.set(key, requested);
            return originalOnShowTab.apply(this, callbackArgs);
          };
          patchedArgs = [{ ...scope.props, activeTab, onShowTab }, ...args.slice(1)];
        }
      } catch (error) {
        reportOnce(error);
      }
      return originalRender.apply(this, patchedArgs);
    };

    try {
      dependencies.defineProperty!(target.memo, "type", {
        ...target.descriptor,
        value: wrappedRender,
      });
      installedTarget = target;
      installed = true;
      return true;
    } catch (error) {
      try {
        dependencies.defineProperty!(target.memo, "type", target.descriptor);
      } catch (restoreError) {
        reportOnce(restoreError);
      }
      reportOnce(error);
      return false;
    }
  };

  return {
    ensureInstalled,
    beforeControllerQuery: (displayedAppid, controllerIndex, storeDriven) => {
      if (cleanedUp || !validDisplayedAppid(displayedAppid) || !validControllerIndex(controllerIndex)) {
        return;
      }
      const key = selectionKey(displayedAppid, controllerIndex);
      // The first fresh chooser query is the only chance to wrap the tab
      // callback before the user makes a selection. Discovery is lazy and
      // fail-open, so retrying here is harmless when its webpack chunk is not
      // loaded yet.
      ensureInstalled();
      if (storeDriven) {
        rememberedTabs.delete(key);
      }
    },
    cleanup,
    isInstalled: () => installed,
    rememberedTab: (displayedAppid, controllerIndex) => {
      if (!validDisplayedAppid(displayedAppid) || !validControllerIndex(controllerIndex)) return null;
      return rememberedTabs.get(selectionKey(displayedAppid, controllerIndex)) ?? null;
    },
  };
};
