import { useEffect, useRef, useState } from "react";
import { getEditorHeaderSettings, setEditorHeaderSettings } from "../backend";
import { translateBackendError } from "../i18n";
import type { EditorHeaderSettings } from "../types";

/** Edit Metadata header options: ContextMenuBody props. */
export function useContextMenuSettings() {
  const [settings, setSettings] = useState<EditorHeaderSettings | null>(null);
  const [error, setError] = useState("");
  // Each save sends the whole object; build it from the latest choice so quick toggles do not undo each other.
  const latest = useRef<EditorHeaderSettings | null>(null);

  useEffect(() => {
    let current = true;
    getEditorHeaderSettings().then(
      (loaded) => {
        if (!current) return;
        latest.current = loaded;
        setSettings(loaded);
      },
      (loadError) => { if (current) setError(translateBackendError(loadError)); },
    );
    return () => { current = false; };
  }, []);

  const onChange = (key: keyof EditorHeaderSettings, value: boolean) => {
    const previous = latest.current;
    if (!previous) return;
    const next = { ...previous, [key]: value };
    latest.current = next;
    setSettings(next);
    setError("");
    setEditorHeaderSettings(next).catch((saveError) => {
      if (latest.current !== next) return;
      latest.current = previous;
      setSettings(previous);
      setError(translateBackendError(saveError));
    });
  };

  return { settings, error, onChange };
}
