import { describe, expect, it } from "vitest";
import { editorActiveInputAttribute, trackActiveEditorInput } from "./editorScopedStyle";

const element = (editorInput: boolean) => {
  const attributes = new Set<string>();
  return {
    matches: () => editorInput,
    setAttribute: (name: string) => attributes.add(name),
    removeAttribute: (name: string) => attributes.delete(name),
    marked: () => attributes.has(editorActiveInputAttribute),
  };
};

const harness = () => {
  const listeners = new Map<string, () => void>();
  const pending: Array<() => void> = [];
  let classChanged: (() => void) | undefined;
  const doc = {
    activeElement: null as unknown,
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const root = { contains: () => true };
  const stop = trackActiveEditorInput(
    doc as never,
    root as never,
    (run) => { pending.push(run); },
    (_root, callback) => { classChanged = callback; return () => { classChanged = undefined; }; },
  );
  return {
    doc,
    stop,
    // Steam toggles its focus class; no focus event reaches the page.
    steamFocusMoved: () => { classChanged?.(); pending.splice(0).forEach((run) => run()); },
    flush: () => pending.splice(0).forEach((run) => run()),
    observing: () => classChanged !== undefined,
    steamFocusQueued: () => classChanged?.(),
    listenerCount: () => listeners.size,
  };
};

describe("trackActiveEditorInput", () => {
  it("marks the box from Steam's focus-class changes and keeps it while the keyboard has focus", () => {
    const h = harness();
    const title = element(true);
    const button = element(false);

    h.doc.activeElement = title;
    h.steamFocusMoved();
    expect(title.marked()).toBe(true);

    // Keyboard opens: Steam drops its focus class, the box keeps the cursor.
    h.steamFocusMoved();
    expect(title.marked()).toBe(true);

    h.doc.activeElement = button;
    h.steamFocusMoved();
    expect(title.marked()).toBe(false);
    expect(button.marked()).toBe(false);

    h.doc.activeElement = title;
    h.steamFocusMoved();
    h.stop();
    expect(title.marked()).toBe(false);
    expect(h.observing()).toBe(false);
    expect(h.listenerCount()).toBe(0);
  });

  it("ignores a check that settles after the editor closes", () => {
    const h = harness();
    const title = element(true);
    h.doc.activeElement = title;
    h.steamFocusQueued();
    h.stop();
    h.flush();
    expect(title.marked()).toBe(false);
  });
});
