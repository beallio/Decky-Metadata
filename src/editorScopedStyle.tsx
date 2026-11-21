import { useEffect, useRef } from "react";
import { editorScopedCss } from "./metadataEditorStyles";

export const editorActiveInputClassName = "decky-metadata-editor__input-active";

type FocusDocument = Pick<Document, "addEventListener" | "removeEventListener" | "activeElement">;

/**
 * Mark the editor text box that holds the cursor. Steam's focus class and CSS
 * `:focus` both drop while the on-screen keyboard window has focus, although
 * the box keeps the cursor and still receives the typed text.
 */
export const trackActiveEditorInput = (
  doc: FocusDocument,
  schedule: (callback: () => void) => void = (callback) => { setTimeout(callback, 0); },
): (() => void) => {
  let marked: Element | null = null;
  let tracking = true;
  const sync = () => {
    if (!tracking) return;
    const active = doc.activeElement;
    const next = active?.matches?.(".decky-metadata-editor input.DialogInput") ? active : null;
    if (next === marked) return;
    marked?.classList.remove(editorActiveInputClassName);
    next?.classList.add(editorActiveInputClassName);
    marked = next;
  };
  // A window blur also fires focusout, but leaves activeElement on the box; check after it settles.
  const settle = () => schedule(sync);
  doc.addEventListener("focusin", sync, true);
  doc.addEventListener("focusout", settle, true);
  sync();
  return () => {
    tracking = false;
    doc.removeEventListener("focusin", sync, true);
    doc.removeEventListener("focusout", settle, true);
    marked?.classList.remove(editorActiveInputClassName);
    marked = null;
  };
};

/** The editor's scoped CSS, plus active-box tracking in the document that shows the editor. */
export const EditorScopedStyle = () => {
  const ref = useRef<HTMLStyleElement>(null);
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    return doc ? trackActiveEditorInput(doc) : undefined;
  }, []);
  return <style ref={ref}>{editorScopedCss}</style>;
};
