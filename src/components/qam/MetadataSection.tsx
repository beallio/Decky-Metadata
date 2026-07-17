import { ButtonItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";

import {
  ButtonLabel,
  compactTextStyle,
  inlineStatusStyle,
  rowStackStyle,
  sectionHeadingStyle,
} from "../../styles";
import { space } from "../../tokens";
import type { StatusKind } from "../../tokens";

type MetadataSectionProps = {
  detectedCount: number;
  savedCount: number;
  missingCount: number;
  scanBusy: boolean;
  scanMessage: string;
  scanStatusKind: StatusKind;
  cacheBusy: boolean;
  onRefreshMetadata: () => void;
  onClearCache: () => void;
};

export function MetadataSection({
  detectedCount,
  savedCount,
  missingCount,
  scanBusy,
  scanMessage,
  scanStatusKind,
  cacheBusy,
  onRefreshMetadata,
  onClearCache,
}: MetadataSectionProps) {
  return (
    <PanelSection title="Metadata">
      <PanelSectionRow>
        <Field
          focusable={true}
          highlightOnFocus={false}
          preferredFocus={true}
          childrenLayout="below"
          padding="standard"
          bottomSeparator="none"
        >
          <div style={rowStackStyle}>
            <div>
              <b>{"Detected non-Steam games"}:</b> {detectedCount}
            </div>
            <div>
              <b>{"Metadata saved"}:</b> {savedCount}
            </div>
            <div>
              <b>{"Missing metadata"}:</b> {missingCount}
            </div>
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={scanBusy || detectedCount === 0}
          onClick={onRefreshMetadata}
        >
          {scanBusy ? (
            <ButtonLabel busy={true}>{"Refreshing..."}</ButtonLabel>
          ) : (
            "Refresh metadata"
          )}
        </ButtonItem>
        {scanBusy || scanMessage ? (
          <div style={inlineStatusStyle(scanStatusKind)}>
            {scanMessage || "Refreshing metadata..."}
          </div>
        ) : null}
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="none"
        >
          <div style={compactTextStyle}>
            Find and save metadata for detected non-Steam games that do not have a match yet.
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>Metadata cache</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={cacheBusy || scanBusy}
          onClick={onClearCache}
        >
          {cacheBusy ? (
            <ButtonLabel busy={true}>{"Clearing..."}</ButtonLabel>
          ) : (
            "Clear cache"
          )}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="standard"
        >
          <div style={{ ...compactTextStyle, paddingBottom: space.md }}>
            Clear saved matches and metadata so games can be matched again.
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
