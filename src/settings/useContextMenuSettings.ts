import { useEffect, useRef, useState } from "react";
import { getEditorHeaderSettings, setEditorHeaderSettings } from "../backend";
import { translateBackendError } from "../i18n";
import type { EditorHeaderSettings } from "../types";

/** Edit Metadata header options: ContextMenuBody props. */
export function useContextMenuSettings() {
  const [settings, setSettings] = useState<EditorHeaderSettings | null>(null);
  const [error, setError] = useState("");
  const saveQueue = useRef(Promise.resolve());
  // Each save sends the whole object; build it from the latest choice so quick toggles do not undo each other.
  const latest = useRef<EditorHeaderSettings | null>(null);
  // The last settings the backend has; a failed save goes back to these, never to another unsaved toggle.
  const saved = useRef<EditorHeaderSettings | null>(null);

  useEffect(() => {
    let current = true;
    getEditorHeaderSettings().then(
      (loaded) => {
        if (!current) return;
        latest.current = loaded;
        saved.current = loaded;
        setSettings(loaded);
      },
      (loadError) => { if (current) setError(translateBackendError(loadError)); },
    );
    return () => { current = false; };
  }, []);

  const onChange = (key: keyof EditorHeaderSettings, value: boolean) => {
    if (!latest.current) return;
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setSettings(next);
    setError("");
    const save = saveQueue.current.then(() => setEditorHeaderSettings(next));
    saveQueue.current = save.then(() => undefined, () => undefined);
    save.then(
      () => { saved.current = next; },
      (saveError) => {
        if (latest.current !== next) return;
        latest.current = saved.current;
        setSettings(saved.current);
        setError(translateBackendError(saveError));
      },
    );
  };

  return { settings, error, onChange };
}
