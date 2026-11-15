import { ButtonItem, Field, PanelSectionRow } from "@decky/ui";
import { FaTags } from "react-icons/fa6";
import { CollapsibleSection } from "./CollapsibleSection";

import {
  ButtonLabel,
  compactTextStyle,
  inlineStatusStyle,
  rowStackStyle,
  sectionHeadingStyle,
} from "../../styles";
import { space } from "../../tokens";
import type { StatusKind } from "../../tokens";
import { useT } from "../../i18n";

const subsectionDescriptionStyle = { ...compactTextStyle, paddingBottom: space.md } as const;

type MetadataSectionProps = {
  detectedCount: number;
  savedCount: number;
  missingCount: number;
  scanBusy: boolean;
  scanMessage: string;
  scanStatusKind: StatusKind;
  cacheBusy: boolean;
  delistedCountText: string;
  delistedDateText?: string;
  delistedBusy: boolean;
  onRefreshMetadata: () => void;
  onClearCache: () => void;
  onRefreshDelisted: () => void;
};

export function MetadataSection({
  detectedCount,
  savedCount,
  missingCount,
  scanBusy,
  scanMessage,
  scanStatusKind,
  cacheBusy,
  delistedCountText,
  delistedDateText,
  delistedBusy,
  onRefreshMetadata,
  onClearCache,
  onRefreshDelisted,
}: MetadataSectionProps) {
  const t = useT();

  return (
    <CollapsibleSection title={t("qam.metadata.title")} icon={<FaTags size={16} />}>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="standard"
          bottomSeparator="none"
        >
          <div style={rowStackStyle}>
            <div>
              <b>{t("qam.metadata.detectedGames")}</b> {detectedCount}
            </div>
            <div>
              <b>{t("qam.metadata.saved")}</b> {savedCount}
            </div>
            <div>
              <b>{t("qam.metadata.missing")}</b> {missingCount}
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
            <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel>
          ) : (
            t("qam.metadata.refresh")
          )}
        </ButtonItem>
        {scanBusy || scanMessage ? (
          <div style={inlineStatusStyle(scanStatusKind)}>
            {scanMessage || t("qam.metadata.refreshingStatus")}
          </div>
        ) : null}
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="standard"
        >
          <div style={subsectionDescriptionStyle}>
            {t("qam.metadata.refreshDescription")}
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("qam.metadata.cacheHeading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={cacheBusy || scanBusy}
          onClick={onClearCache}
        >
          {cacheBusy ? (
            <ButtonLabel busy={true}>{t("qam.metadata.clearing")}</ButtonLabel>
          ) : (
            t("qam.metadata.clearCache")
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
          <div style={subsectionDescriptionStyle}>
            {t("qam.metadata.clearCacheDescription")}
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("qam.metadata.delistedHeading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={delistedBusy}
          onClick={onRefreshDelisted}
        >
          {delistedBusy ? (
            <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel>
          ) : (
            t("qam.metadata.refreshDelisted")
          )}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={inlineStatusStyle("idle")}>{delistedCountText}</div>
      </PanelSectionRow>
      {delistedDateText ? (
        <PanelSectionRow>
          <div style={inlineStatusStyle("idle")}>{delistedDateText}</div>
        </PanelSectionRow>
      ) : null}
    </CollapsibleSection>
  );
}
