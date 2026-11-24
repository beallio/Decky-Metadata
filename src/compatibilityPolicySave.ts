import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "./types";

type CompatibilityPolicySaveKind = "category" | "scope";

type CompatibilityPolicySave = {
  id: number;
  lifecycleGeneration: number;
  category: DeckCompatibilityCategory | null;
  scope: CompatibilityDefaultScope;
  pendingKind: CompatibilityPolicySaveKind | null;
  error: string;
};

type CompatibilityQamRuntime = {
  policySaveId: number;
  policySave: CompatibilityPolicySave | null;
  policySaveListeners: Set<() => void>;
};

const COMPATIBILITY_QAM_RUNTIME_KEY = "__deckyMetadataCompatibilityQamRuntime";

const newCompatibilityQamRuntime = (): CompatibilityQamRuntime => ({
  policySaveId: 0,
  policySave: null,
  policySaveListeners: new Set<() => void>(),
});

/** Share policy transactions across bundles during the plugin's lifetime. */
const compatibilityQamRuntime = (): CompatibilityQamRuntime => {
  const host = globalThis as Record<string, unknown>;
  const existing = host[COMPATIBILITY_QAM_RUNTIME_KEY] as Partial<CompatibilityQamRuntime> | undefined;
  if (
    existing
    && typeof existing === "object"
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

/** One policy transaction shared by the QAM and Settings bundles, so both show the same pending save. */
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

