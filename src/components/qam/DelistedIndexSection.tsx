import { ButtonItem, PanelSectionRow } from "@decky/ui";
import { CollapsibleSection } from "./CollapsibleSection";

import { ButtonLabel, inlineStatusStyle } from "../../styles";

type DelistedIndexSectionProps = {
  countText: string;
  dateText?: string;
  busy: boolean;
  onRefresh: () => void;
};

export function DelistedIndexSection({
  countText,
  dateText,
  busy,
  onRefresh,
}: DelistedIndexSectionProps) {
  return (
    <CollapsibleSection title="Delisted Steam games">
      <PanelSectionRow>
        <div style={inlineStatusStyle("idle")}>{countText}</div>
      </PanelSectionRow>
      {dateText ? (
        <PanelSectionRow>
          <div style={inlineStatusStyle("idle")}>{dateText}</div>
        </PanelSectionRow>
      ) : null}
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
            "Refresh delisted games"
          )}
        </ButtonItem>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
