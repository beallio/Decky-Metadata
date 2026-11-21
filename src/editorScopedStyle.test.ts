import { describe, expect, it } from "vitest";
import { editorActiveInputClassName, trackActiveEditorInput } from "./editorScopedStyle";

const element = (editorInput: boolean) => {
  const classes = new Set<string>();
  return {
    matches: () => editorInput,
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
    marked: () => classes.has(editorActiveInputClassName),
  };
};

const fakeDocument = () => {
  const listeners = new Map<string, () => void>();
  const pending: Array<() => void> = [];
  const doc = {
    activeElement: null as unknown,
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  return {
    doc,
    fire: (type: string) => listeners.get(type)?.(),
    flush: () => pending.splice(0).forEach((run) => run()),
    schedule: (run: () => void) => { pending.push(run); },
    listenerCount: () => listeners.size,
  };
};

describe("trackActiveEditorInput", () => {
  it("keeps the box marked while the on-screen keyboard window has focus, and clears it when focus moves on", () => {
    const fake = fakeDocument();
    const title = element(true);
    const button = element(false);
    const stop = trackActiveEditorInput(fake.doc as never, fake.schedule);

    fake.doc.activeElement = title;
    fake.fire("focusin");
    expect(title.marked()).toBe(true);

    // Window blur: focusout fires but the box keeps the cursor.
    fake.fire("focusout");
    fake.flush();
    expect(title.marked()).toBe(true);

    fake.fire("focusout");
    fake.doc.activeElement = button;
    fake.fire("focusin");
    fake.flush();
    expect(title.marked()).toBe(false);
    expect(button.marked()).toBe(false);

    fake.doc.activeElement = title;
    fake.fire("focusin");
    stop();
    expect(title.marked()).toBe(false);
    expect(fake.listenerCount()).toBe(0);
  });

  it("ignores a focusout check that settles after the editor closes", () => {
    const fake = fakeDocument();
    const title = element(true);
    const stop = trackActiveEditorInput(fake.doc as never, fake.schedule);
    fake.fire("focusout");
    stop();
    fake.doc.activeElement = title;
    fake.flush();
    expect(title.marked()).toBe(false);
  });
});
