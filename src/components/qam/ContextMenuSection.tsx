import { Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaBars } from "react-icons/fa";
import { getEditorHeaderSettings, setEditorHeaderSettings } from "../../backend";
import { translateBackendError, useT } from "../../i18n";
import { inlineStatusStyle } from "../../styles";
import type { EditorHeaderSettings } from "../../types";
import { CollapsibleSection } from "./CollapsibleSection";

/** Options for the Edit Metadata page that the game context menu opens. */
export function ContextMenuSection() {
  const t = useT();
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

  const update = (key: keyof EditorHeaderSettings, value: boolean) => {
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

  return (
    <CollapsibleSection title={t("qam.contextMenu.title")} icon={<FaBars size={16} />}>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.contextMenu.headerIconLabel")}
          description={t("qam.contextMenu.headerIconDescription")}
          checked={settings?.gameIcon ?? false}
          disabled={!settings}
          onChange={(enabled) => update("gameIcon", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.contextMenu.steamIconLabel")}
          description={t("qam.contextMenu.steamIconDescription")}
          checked={settings?.steamIconFallback ?? false}
          disabled={!settings?.gameIcon}
          onChange={(enabled) => update("steamIconFallback", enabled)}
          bottomSeparator="none"
        />
      </PanelSectionRow>
      {error ? (
        <PanelSectionRow>
          <Field focusable={false} padding="none" bottomSeparator="none">
            <div style={inlineStatusStyle("error")}>{error}</div>
          </Field>
        </PanelSectionRow>
      ) : null}
    </CollapsibleSection>
  );
}
