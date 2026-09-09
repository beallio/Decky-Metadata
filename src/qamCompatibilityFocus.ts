// The native dropdown is displayed in a separate Big Picture window. Keep the
// request outside a mounted QAM component because that transition can remount
// the plugin content before it returns to the Quick Access window.
let compatibilityDropdownReturnPending = false;
let compatibilityDropdownControlUnmounted = false;
let compatibilityDropdownReturnVisible = false;
let compatibilityDropdownSelectionSaved = false;

export const requestCompatibilityDropdownReturn = () => {
  compatibilityDropdownReturnPending = true;
  compatibilityDropdownControlUnmounted = false;
  compatibilityDropdownReturnVisible = false;
  compatibilityDropdownSelectionSaved = false;
};

export const hasCompatibilityDropdownReturn = () =>
  compatibilityDropdownReturnPending;

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
  return pending;
};

export const clearCompatibilityDropdownReturn = () => {
  compatibilityDropdownReturnPending = false;
  compatibilityDropdownControlUnmounted = false;
  compatibilityDropdownReturnVisible = false;
  compatibilityDropdownSelectionSaved = false;
};
