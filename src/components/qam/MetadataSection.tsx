import { ButtonItem, Field, PanelSectionRow, ProgressBarItem } from "@decky/ui";

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

export function MetadataScanBody({
  detectedCount,
  savedCount,
  missingCount,
  scanBusy,
  scanMessage,
  scanCompleted,
  scanTotal,
  scanStatusKind,
  onRefreshMetadata,
}: Pick<MetadataSectionProps, "detectedCount" | "savedCount" | "missingCount" | "scanBusy" | "scanMessage" | "scanCompleted" | "scanTotal" | "scanStatusKind" | "onRefreshMetadata">) {
  const t = useT();

  return (
    <>
      <PanelSectionRow>
        <Field label={t("qam.metadata.detectedGames")} focusable highlightOnFocus bottomSeparator="none">
          {/* Steam's Field hides a falsy child, so 0 must be text. */}
          {String(detectedCount)}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={t("qam.metadata.saved")} focusable highlightOnFocus bottomSeparator="none">
          {String(savedCount)}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={t("qam.metadata.missing")} focusable highlightOnFocus bottomSeparator="none">
          {String(missingCount)}
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
          {scanBusy ? <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel> : t("qam.metadata.refresh")}
        </ButtonItem>
        {!scanBusy && scanMessage ? <div style={inlineStatusStyle(scanStatusKind)}>{scanMessage}</div> : null}
      </PanelSectionRow>
      {scanBusy ? (
        <ProgressBarItem
          nProgress={scanTotal > 0 ? (scanCompleted / scanTotal) * 100 : 0}
          description={scanMessage || t("qam.metadata.refreshingStatus")}
          bottomSeparator="none"
        />
      ) : null}
    </>
  );
}

export function MetadataMaintenanceBody({
  scanBusy,
  cacheBusy,
  delistedCountText,
  delistedDateText,
  delistedBusy,
  onClearCache,
  onRefreshDelisted,
}: Pick<MetadataSectionProps, "scanBusy" | "cacheBusy" | "delistedCountText" | "delistedDateText" | "delistedBusy" | "onClearCache" | "onRefreshDelisted">) {
  const t = useT();
  const delistedDescription = [delistedCountText, delistedDateText].filter(Boolean).join(" ");

  return (
    <>
      <PanelSectionRow><div style={sectionHeadingStyle}>{t("qam.metadata.cacheHeading")}</div></PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={t("qam.metadata.clearCacheDescription")}
          bottomSeparator="none"
          disabled={cacheBusy || scanBusy}
          onClick={onClearCache}
        >
          {cacheBusy ? <ButtonLabel busy={true}>{t("qam.metadata.clearing")}</ButtonLabel> : t("qam.metadata.clearCache")}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow><div style={sectionHeadingStyle}>{t("qam.metadata.delistedHeading")}</div></PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={delistedDescription}
          bottomSeparator="none"
          disabled={delistedBusy}
          onClick={onRefreshDelisted}
        >
          {delistedBusy ? <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel> : t("qam.metadata.refreshDelisted")}
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}

