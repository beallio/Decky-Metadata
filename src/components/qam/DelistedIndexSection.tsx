import { ButtonItem, PanelSection, PanelSectionRow } from "@decky/ui";

import { ButtonLabel, inlineStatusStyle } from "../../styles";

type DelistedIndexSectionProps = {
  statusText: string;
  busy: boolean;
  onRefresh: () => void;
};

export function DelistedIndexSection({
  statusText,
  busy,
  onRefresh,
}: DelistedIndexSectionProps) {
  return (
    <PanelSection title="Delisted Index">
      <PanelSectionRow>
        <div style={inlineStatusStyle("idle")}>{statusText}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="standard"
          disabled={busy}
          onClick={onRefresh}
        >
          {busy ? (
            <ButtonLabel busy={true}>{"Refreshing..."}</ButtonLabel>
          ) : (
            "Refresh delisted index"
          )}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
