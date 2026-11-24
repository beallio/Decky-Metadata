import { ButtonItem, DialogControlsSection, DialogControlsSectionHeader, Field, PanelSectionRow, ProgressBarItem } from "@decky/ui";

import {
  ButtonLabel,
  inlineStatusStyle,
} from "../../styles";
import type { StatusKind } from "../../tokens";
import { useT } from "../../i18n";

type MetadataSectionProps = {
  inline?: boolean;
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
  inline = false,
}: Pick<MetadataSectionProps, "detectedCount" | "savedCount" | "missingCount" | "scanBusy" | "scanMessage" | "scanCompleted" | "scanTotal" | "scanStatusKind" | "onRefreshMetadata"> & { inline?: boolean }) {
  const t = useT();

  if (inline) {
    return (
      <DialogControlsSection>
        <Field label={t("qam.metadata.detectedGames")}>{String(detectedCount)}</Field>
        <Field label={t("qam.metadata.saved")}>{String(savedCount)}</Field>
        <Field label={t("qam.metadata.missing")}>{String(missingCount)}</Field>
        {scanBusy ? (
          <ProgressBarItem
            nProgress={scanTotal > 0 ? (scanCompleted / scanTotal) * 100 : 0}
            description={scanMessage || t("qam.metadata.refreshingStatus")}
          />
        ) : null}
        <ButtonItem
          layout="inline"
          label={t("qam.metadata.refresh")}
          description={t("qam.metadata.refreshDescription")}
          disabled={scanBusy || detectedCount === 0}
          onClick={onRefreshMetadata}
        >
          {scanBusy ? <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel> : t("settings.action.refresh")}
        </ButtonItem>
        {!scanBusy && scanMessage ? <Field focusable={false} childrenLayout="below">{scanMessage}</Field> : null}
      </DialogControlsSection>
    );
  }

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
      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.metadata.cacheHeading")}</DialogControlsSectionHeader>
        <ButtonItem
          layout="inline"
          label={t("qam.metadata.clearCache")}
          description={t("qam.metadata.clearCacheDescription")}
          disabled={cacheBusy || scanBusy}
          onClick={onClearCache}
        >
          {cacheBusy ? <ButtonLabel busy={true}>{t("qam.metadata.clearing")}</ButtonLabel> : t("settings.action.clear")}
        </ButtonItem>
      </DialogControlsSection>
      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.metadata.delistedHeading")}</DialogControlsSectionHeader>
        <ButtonItem
          layout="inline"
          label={t("qam.metadata.refreshDelisted")}
          description={delistedDescription}
          disabled={delistedBusy}
          onClick={onRefreshDelisted}
        >
          {delistedBusy ? <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel> : t("settings.action.refresh")}
        </ButtonItem>
      </DialogControlsSection>
    </>
  );
}


