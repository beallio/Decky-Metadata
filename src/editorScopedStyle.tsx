import { useEffect, useRef } from "react";
import { editorScopedCss } from "./metadataEditorStyles";

// A data attribute: React rewrites `className` whenever Steam re-renders the input.
export const editorActiveInputAttribute = "data-decky-metadata-active-input";

type FocusDocument = Pick<Document, "addEventListener" | "removeEventListener" | "activeElement">;
type Observe = (root: Element, callback: () => void) => () => void;

const observeClassChanges: Observe = (root, callback) => {
  const View = root.ownerDocument?.defaultView?.MutationObserver;
  if (!View) return () => undefined;
  const observer = new View(callback);
  observer.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
  return () => observer.disconnect();
};

/**
 * Mark the editor text box that holds the cursor. Steam's focus class drops
 * while the on-screen keyboard has controller focus, although the box keeps
 * the cursor and still receives the typed text. Focus events are unreliable
 * when the Steam window lacks system focus, so Steam's own focus-class
 * changes and typing also trigger a check.
 */
export const trackActiveEditorInput = (
  doc: FocusDocument,
  root: Element,
  schedule: (callback: () => void) => void = (callback) => { setTimeout(callback, 0); },
  observe: Observe = observeClassChanges,
): (() => void) => {
  let marked: Element | null = null;
  let tracking = true;
  const sync = () => {
    if (!tracking) return;
    const active = doc.activeElement;
    const next = active && root.contains(active) && active.matches?.("input.DialogInput") ? active : null;
    if (next === marked) return;
    marked?.removeAttribute(editorActiveInputAttribute);
    next?.setAttribute(editorActiveInputAttribute, "");
    marked = next;
  };
  // A window blur fires focusout but leaves activeElement on the box; check after it settles.
  const settle = () => schedule(sync);
  const events = ["focusin", "focusout", "input"] as const;
  events.forEach((type) => doc.addEventListener(type, settle, true));
  const disconnect = observe(root, settle);
  sync();
  return () => {
    tracking = false;
    events.forEach((type) => doc.removeEventListener(type, settle, true));
    disconnect();
    marked?.removeAttribute(editorActiveInputAttribute);
    marked = null;
  };
};

/** The editor's scoped CSS, plus active-box tracking in the document that shows the editor. */
export const EditorScopedStyle = () => {
  const ref = useRef<HTMLStyleElement>(null);
  useEffect(() => {
    const style = ref.current;
    const root = style?.parentElement;
    return style && root ? trackActiveEditorInput(style.ownerDocument, root) : undefined;
  }, []);
  return <style ref={ref}>{editorScopedCss}</style>;
};
