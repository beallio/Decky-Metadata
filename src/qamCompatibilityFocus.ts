import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "./types";

type CompatibilityPolicySaveKind = "category" | "scope";
type CompatibilityDropdownOrigin = "category" | "scope";

type CompatibilityPolicySave = {
  id: number;
  lifecycleGeneration: number;
  category: DeckCompatibilityCategory | null;
  scope: CompatibilityDefaultScope;
  pendingKind: CompatibilityPolicySaveKind | null;
  error: string;
};

type CompatibilityQamRuntime = {
  dropdown: {
    returnPending: boolean;
    controlUnmounted: boolean;
    returnVisible: boolean;
    selectionSaved: boolean;
    origin: CompatibilityDropdownOrigin;
  };
  policySaveId: number;
  policySave: CompatibilityPolicySave | null;
  policySaveListeners: Set<() => void>;
};

const COMPATIBILITY_QAM_RUNTIME_KEY = "__deckyMetadataCompatibilityQamRuntime";

const newCompatibilityQamRuntime = (): CompatibilityQamRuntime => ({
  dropdown: {
    returnPending: false,
    controlUnmounted: false,
    returnVisible: false,
    selectionSaved: false,
    origin: "category",
  },
  policySaveId: 0,
  policySave: null,
  policySaveListeners: new Set<() => void>(),
});

/**
 * A native popup can keep an old callback alive while Decky evaluates a new
 * bundle for the replacement QAM panel. Share that UI handoff state just like
 * the compatibility policy runtime, so both bundles observe one transaction.
 */
const compatibilityQamRuntime = (): CompatibilityQamRuntime => {
  const host = globalThis as Record<string, unknown>;
  const existing = host[COMPATIBILITY_QAM_RUNTIME_KEY] as Partial<CompatibilityQamRuntime> | undefined;
  if (
    existing
    && typeof existing === "object"
    && existing.dropdown
    && existing.policySaveListeners instanceof Set
    && typeof existing.policySaveId === "number"
  ) {
    return existing as CompatibilityQamRuntime;
  }
  const runtime = newCompatibilityQamRuntime();
  host[COMPATIBILITY_QAM_RUNTIME_KEY] = runtime;
  return runtime;
};

const runtime = compatibilityQamRuntime();

const notifyCompatibilityPolicySave = () => {
  runtime.policySaveListeners.forEach((listener) => listener());
};

/** Keep one policy transaction alive while the native popup remounts QAM. */
export const compatibilityPolicySaveSnapshot = () => runtime.policySave;

export const subscribeCompatibilityPolicySave = (listener: () => void) => {
  runtime.policySaveListeners.add(listener);
  return () => runtime.policySaveListeners.delete(listener);
};

export const hasPendingCompatibilityPolicySave = () =>
  runtime.policySave !== null && runtime.policySave.pendingKind !== null;

export const beginCompatibilityPolicySave = (
  kind: CompatibilityPolicySaveKind,
  lifecycleGeneration: number,
  category: DeckCompatibilityCategory | null,
  scope: CompatibilityDefaultScope,
) => {
  const id = runtime.policySaveId + 1;
  runtime.policySaveId = id;
  runtime.policySave = {
    id,
    lifecycleGeneration,
    category,
    scope,
    pendingKind: kind,
    error: "",
  };
  notifyCompatibilityPolicySave();
  return id;
};

/** Complete only the transaction from the current plugin lifetime. */
export const settleCompatibilityPolicySave = (
  id: number,
  lifecycleGeneration: number,
  category: DeckCompatibilityCategory | null,
  scope: CompatibilityDefaultScope,
  error = "",
) => {
  if (
    !runtime.policySave
    || runtime.policySave.id !== id
    || runtime.policySave.lifecycleGeneration !== lifecycleGeneration
  ) {
    return false;
  }
  runtime.policySave = {
    id,
    lifecycleGeneration,
    category,
    scope,
    pendingKind: null,
    error,
  };
  notifyCompatibilityPolicySave();
  return true;
};

/** Invalidate an old plugin's transaction without letting it unlock a new mount. */
export const discardStaleCompatibilityPolicySave = (lifecycleGeneration: number) => {
  if (
    !runtime.policySave
    || runtime.policySave.lifecycleGeneration === lifecycleGeneration
  ) {
    return false;
  }
  runtime.policySave = null;
  runtime.policySaveId += 1;
  notifyCompatibilityPolicySave();
  return true;
};

/** Test cleanup only; production invalidates transactions by lifecycle. */
export const clearCompatibilityPolicySave = () => {
  runtime.policySave = null;
  runtime.policySaveId += 1;
  notifyCompatibilityPolicySave();
};

export const requestCompatibilityDropdownReturn = (origin: CompatibilityDropdownOrigin) => {
  runtime.dropdown.returnPending = true;
  runtime.dropdown.controlUnmounted = false;
  runtime.dropdown.returnVisible = false;
  runtime.dropdown.selectionSaved = false;
  runtime.dropdown.origin = origin;
};

export const hasCompatibilityDropdownReturn = () =>
  runtime.dropdown.returnPending;

export const compatibilityDropdownReturnOrigin = () => runtime.dropdown.origin;

export const noteCompatibilityDropdownControlUnmounted = () => {
  if (!runtime.dropdown.returnPending) return false;
  runtime.dropdown.controlUnmounted = true;
  return true;
};

export const noteCompatibilityDropdownReturnVisible = () => {
  if (!runtime.dropdown.returnPending || !runtime.dropdown.controlUnmounted) {
    return false;
  }
  runtime.dropdown.returnVisible = true;
  return true;
};

/** Selection completes after the backend confirms the new global policy. */
export const noteCompatibilityDropdownSelectionSaved = () => {
  if (!runtime.dropdown.returnPending) return false;
  runtime.dropdown.returnVisible = true;
  runtime.dropdown.selectionSaved = true;
  return true;
};

export const isCompatibilityDropdownSelectionReturn = () =>
  runtime.dropdown.selectionSaved;

export const isCompatibilityDropdownReturnReady = () =>
  runtime.dropdown.returnPending && runtime.dropdown.returnVisible;

/**
 * Consume the request only after native gamepad focus succeeds. Failed early
 * attempts remain armed until the current close handoff finishes or aborts.
 */
export const consumeCompatibilityDropdownReturn = () => {
  const pending = runtime.dropdown.returnPending;
  runtime.dropdown.returnPending = false;
  runtime.dropdown.controlUnmounted = false;
  runtime.dropdown.returnVisible = false;
  runtime.dropdown.selectionSaved = false;
  runtime.dropdown.origin = "category";
  return pending;
};

export const clearCompatibilityDropdownReturn = () => {
  runtime.dropdown.returnPending = false;
  runtime.dropdown.controlUnmounted = false;
  runtime.dropdown.returnVisible = false;
  runtime.dropdown.selectionSaved = false;
  runtime.dropdown.origin = "category";
};
