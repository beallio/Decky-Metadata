import { getFocusNavController, getGamepadNavigationTrees } from "@decky/ui";

import * as log from "../log";

// Plugin code runs in SharedJSContext, so DOM focus calls do not move Steam's gamepad focus;
// these helpers go through Steam's own focus navigation instead.

type NativeFocusNode = {
  Element?: Element;
  m_rgChildren?: NativeFocusNode[];
  BTakeFocus?: () => boolean;
};

type NativeNavigationTree = {
  Root?: NativeFocusNode;
};

export const takeNativeFocus = (element: Element | null): boolean => {
  if (!element) return false;
  try {
    const ownerDocument = element.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (
      !ownerWindow
      || ownerWindow.closed
      || ownerWindow.document !== ownerDocument
      || ownerDocument.visibilityState !== "visible"
    ) return false;
    // Steam can leave the QAM context inactive while the panel is closed.
    // A focus node can then report success without painting gamepad focus.
    const focusNav = getFocusNavController();
    if (!focusNav?.m_ActiveContext && focusNav?.m_LastActiveContext) {
      focusNav.FindAnActiveContext?.();
    }
    const trees = (getGamepadNavigationTrees() || []) as NativeNavigationTree[];
    for (const tree of trees) {
      const pending = tree.Root ? [tree.Root] : [];
      while (pending.length) {
        const node = pending.pop();
        if (!node) continue;
        if (node.Element === element && typeof node.BTakeFocus === "function") {
          return Boolean(node.BTakeFocus());
        }
        if (Array.isArray(node.m_rgChildren)) {
          pending.push(...node.m_rgChildren);
        }
      }
    }
  } catch (error) {
    log.warn("qam", "preferred metadata focus unavailable", error);
  }
  return false;
};

/** The element Steam's gamepad focus is on, or null when no navigation context is active. */
export const nativeFocusedElement = (): Element | null => {
  try {
    const element = getFocusNavController()?.m_ActiveContext?.m_LastActiveFocusNavTree?.GetLastFocusedNode?.()?.m_element;
    // The element lives in Big Picture's window, so `instanceof Element` from this context would be false.
    return typeof element?.closest === "function" ? (element as Element) : null;
  } catch {
    return null;
  }
};
