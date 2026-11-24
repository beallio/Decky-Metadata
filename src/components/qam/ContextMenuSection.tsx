import { Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { useT } from "../../i18n";
import { inlineStatusStyle } from "../../styles";
import type { EditorHeaderSettings } from "../../types";

type ContextMenuBodyProps = {
  settings: EditorHeaderSettings | null;
  error: string;
  onChange: (key: keyof EditorHeaderSettings, value: boolean) => void;
};

/** Options for the Edit Metadata page that the game context menu opens. */
export function ContextMenuBody({ settings, error, onChange }: ContextMenuBodyProps) {
  const t = useT();
  return (
    <>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.contextMenu.headerIconLabel")}
          description={t("qam.contextMenu.headerIconDescription")}
          checked={settings?.gameIcon ?? false}
          disabled={!settings}
          onChange={(enabled) => onChange("gameIcon", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.contextMenu.steamIconLabel")}
          description={t("qam.contextMenu.steamIconDescription")}
          checked={settings?.steamIconFallback ?? false}
          disabled={!settings?.gameIcon}
          onChange={(enabled) => onChange("steamIconFallback", enabled)}
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
    </>
  );
}

