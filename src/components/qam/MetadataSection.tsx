import { ButtonItem, Field, PanelSectionRow, ProgressBarItem } from "@decky/ui";
import { FaTags } from "react-icons/fa6";
import { CollapsibleSection } from "./CollapsibleSection";

import {
  ButtonLabel,
  inlineStatusStyle,
  sectionHeadingStyle,
} from "../../styles";
import type { StatusKind } from "../../tokens";
import { useT } from "../../i18n";

type MetadataSectionProps = {
  detectedCount: number;
  savedCount: number;
  missingCount: number;
  scanBusy: boolean;
  scanMessage: string;
  scanCompleted: number;
  scanTotal: number;
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
  scanCompleted,
  scanTotal,
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
  const delistedDescription = [delistedCountText, delistedDateText].filter(Boolean).join(" ");

  return (
    <CollapsibleSection title={t("qam.metadata.title")} icon={<FaTags size={16} />}>
      <PanelSectionRow>
        <Field
          label={t("qam.metadata.detectedGames")}
          focusable
          highlightOnFocus
          bottomSeparator="none"
        >
          {detectedCount}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          label={t("qam.metadata.saved")}
          focusable
          highlightOnFocus
          bottomSeparator="none"
        >
          {savedCount}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          label={t("qam.metadata.missing")}
          focusable
          highlightOnFocus
          bottomSeparator="none"
        >
          {missingCount}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={t("qam.metadata.refreshDescription")}
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
        {!scanBusy && scanMessage ? (
          <div style={inlineStatusStyle(scanStatusKind)}>{scanMessage}</div>
        ) : null}
      </PanelSectionRow>
      {scanBusy ? (
        <ProgressBarItem
          nProgress={scanTotal > 0 ? (scanCompleted / scanTotal) * 100 : 0}
          description={scanMessage || t("qam.metadata.refreshingStatus")}
          bottomSeparator="none"
        />
      ) : null}
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("qam.metadata.cacheHeading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={t("qam.metadata.clearCacheDescription")}
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
        <div style={sectionHeadingStyle}>{t("qam.metadata.delistedHeading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={delistedDescription}
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
    </CollapsibleSection>
  );
}
