import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "./types";

// The native dropdown is displayed in a separate Big Picture window. Keep the
// request outside a mounted QAM component because that transition can remount
// the plugin content before it returns to the Quick Access window.
let compatibilityDropdownReturnPending = false;
let compatibilityDropdownControlUnmounted = false;
let compatibilityDropdownReturnVisible = false;
let compatibilityDropdownSelectionSaved = false;
let compatibilityDropdownOrigin: "category" | "scope" = "category";

type CompatibilityPolicySaveKind = "category" | "scope";

type CompatibilityPolicySave = {
  id: number;
  lifecycleGeneration: number;
  category: DeckCompatibilityCategory | null;
  scope: CompatibilityDefaultScope;
  pendingKind: CompatibilityPolicySaveKind | null;
  error: string;
};

let compatibilityPolicySaveId = 0;
let compatibilityPolicySave: CompatibilityPolicySave | null = null;
const compatibilityPolicySaveListeners = new Set<() => void>();

const notifyCompatibilityPolicySave = () => {
  compatibilityPolicySaveListeners.forEach((listener) => listener());
};

/** Keep one policy transaction alive while the native popup remounts QAM. */
export const compatibilityPolicySaveSnapshot = () => compatibilityPolicySave;

export const subscribeCompatibilityPolicySave = (listener: () => void) => {
  compatibilityPolicySaveListeners.add(listener);
  return () => compatibilityPolicySaveListeners.delete(listener);
};

export const hasPendingCompatibilityPolicySave = () =>
  compatibilityPolicySave !== null && compatibilityPolicySave.pendingKind !== null;

export const beginCompatibilityPolicySave = (
  kind: CompatibilityPolicySaveKind,
  lifecycleGeneration: number,
  category: DeckCompatibilityCategory | null,
  scope: CompatibilityDefaultScope,
) => {
  const id = compatibilityPolicySaveId + 1;
  compatibilityPolicySaveId = id;
  compatibilityPolicySave = {
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
    !compatibilityPolicySave
    || compatibilityPolicySave.id !== id
    || compatibilityPolicySave.lifecycleGeneration !== lifecycleGeneration
  ) {
    return false;
  }
  compatibilityPolicySave = {
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
    !compatibilityPolicySave
    || compatibilityPolicySave.lifecycleGeneration === lifecycleGeneration
  ) {
    return false;
  }
  compatibilityPolicySave = null;
  compatibilityPolicySaveId += 1;
  notifyCompatibilityPolicySave();
  return true;
};

/** Test cleanup only; production invalidates transactions by lifecycle. */
export const clearCompatibilityPolicySave = () => {
  compatibilityPolicySave = null;
  compatibilityPolicySaveId += 1;
  notifyCompatibilityPolicySave();
};

export const requestCompatibilityDropdownReturn = (origin: "category" | "scope") => {
  compatibilityDropdownReturnPending = true;
  compatibilityDropdownControlUnmounted = false;
  compatibilityDropdownReturnVisible = false;
  compatibilityDropdownSelectionSaved = false;
  compatibilityDropdownOrigin = origin;
};

export const hasCompatibilityDropdownReturn = () =>
  compatibilityDropdownReturnPending;

export const compatibilityDropdownReturnOrigin = () => compatibilityDropdownOrigin;

export const noteCompatibilityDropdownControlUnmounted = () => {
  if (!compatibilityDropdownReturnPending) return false;
  compatibilityDropdownControlUnmounted = true;
  return true;
};

export const noteCompatibilityDropdownReturnVisible = () => {
  if (!compatibilityDropdownReturnPending || !compatibilityDropdownControlUnmounted) {
    return false;
  }
  compatibilityDropdownReturnVisible = true;
  return true;
};

/** Selection completes after the backend confirms the new global policy. */
export const noteCompatibilityDropdownSelectionSaved = () => {
  if (!compatibilityDropdownReturnPending) return false;
  compatibilityDropdownReturnVisible = true;
  compatibilityDropdownSelectionSaved = true;
  return true;
};

export const isCompatibilityDropdownSelectionReturn = () =>
  compatibilityDropdownSelectionSaved;

export const isCompatibilityDropdownReturnReady = () =>
  compatibilityDropdownReturnPending && compatibilityDropdownReturnVisible;

/**
 * Consume the request only after native gamepad focus succeeds. Failed early
 * attempts remain armed until the current close handoff finishes or aborts.
 */
export const consumeCompatibilityDropdownReturn = () => {
  const pending = compatibilityDropdownReturnPending;
  compatibilityDropdownReturnPending = false;
  compatibilityDropdownControlUnmounted = false;
  compatibilityDropdownReturnVisible = false;
  compatibilityDropdownSelectionSaved = false;
  compatibilityDropdownOrigin = "category";
  return pending;
};

export const clearCompatibilityDropdownReturn = () => {
  compatibilityDropdownReturnPending = false;
  compatibilityDropdownControlUnmounted = false;
  compatibilityDropdownReturnVisible = false;
  compatibilityDropdownSelectionSaved = false;
  compatibilityDropdownOrigin = "category";
};
