import type { ComponentProps, ComponentType } from "react";
import { ButtonItem, DialogControlsSection, DialogControlsSectionHeader, Field, PanelSectionRow, ProgressBarWithInfo } from "@decky/ui";

import { ButtonLabel } from "../../styles";
import { useT } from "../../i18n";

type ProgressBarWithInfoFieldProps = ComponentProps<typeof ProgressBarWithInfo> & {
  childrenLayout?: "inline" | "below";
  className?: string;
};

const ProgressBarField = ProgressBarWithInfo as ComponentType<ProgressBarWithInfoFieldProps>;

const SCAN_PROGRESS_CLASS = "decky-metadata-scan-progress";
const scanProgressCss = `
.${SCAN_PROGRESS_CLASS} {
  max-width: 100%;
  overflow-wrap: anywhere;
}
.${SCAN_PROGRESS_CLASS} div {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
`;

type MetadataSectionProps = {
  inline?: boolean;
  detectedCount: number;
  savedCount: number;
  missingCount: number;
  scanBusy: boolean;
  scanMessage: string;
  scanCompleted: number;
  scanTotal: number;
  cacheBusy: boolean;
  delistedCountText: string;
  delistedDateText?: string;
  delistedBusy: boolean;
  onRefreshMetadata: () => void;
  onClearCache: () => void;
  onRefreshDelisted: () => void;
  /** False while the page shows a cached game list: actions wait for the fresh one. */
  listReady?: boolean;
};

export function MetadataScanBody({
  detectedCount,
  savedCount,
  missingCount,
  scanBusy,
  scanMessage,
  scanCompleted,
  scanTotal,
  onRefreshMetadata,
  inline = false,
  listReady = true,
}: Pick<MetadataSectionProps, "detectedCount" | "savedCount" | "missingCount" | "scanBusy" | "scanMessage" | "scanCompleted" | "scanTotal" | "onRefreshMetadata" | "listReady"> & { inline?: boolean }) {
  const t = useT();
  // Steam's ProgressBarWithInfo forwards Field props at runtime. Without childrenLayout="below",
  // Field places the bar in FieldRightColumn (flex-shrink: 0, no min-width: 0), so long titles
  // stretch the progress bar past the right edge of the QAM. Putting it in FieldLeftColumn via
  // childrenLayout="below" and wrapping the QAM row in PanelSectionRow keeps it within the panel.
  const progressStyle = scanBusy ? <style>{scanProgressCss}</style> : null;
  const progress = scanBusy ? (
    <ProgressBarField
      nProgress={scanTotal > 0 ? (scanCompleted / scanTotal) * 100 : 0}
      sOperationText={scanMessage || t("qam.metadata.refreshingStatus")}
      childrenContainerWidth="max"
      childrenLayout="below"
      className={SCAN_PROGRESS_CLASS}
      focusable={false}
      bottomSeparator={inline ? undefined : "none"}
    />
  ) : null;

  if (inline) {
    return (
      <DialogControlsSection>
        {progressStyle}
        {/* Focusable so the D-pad can highlight each stat row in Settings, matching Versions. */}
        <Field label={t("qam.metadata.detectedGames")} focusable highlightOnFocus>{String(detectedCount)}</Field>
        <Field label={t("qam.metadata.saved")} focusable highlightOnFocus>{String(savedCount)}</Field>
        <Field label={t("qam.metadata.missing")} focusable highlightOnFocus>{String(missingCount)}</Field>
        {progress}
        <ButtonItem
          layout="inline"
          label={t("qam.metadata.refresh")}
          description={t("qam.metadata.refreshDescription")}
          disabled={!listReady || scanBusy || detectedCount === 0}
          onClick={onRefreshMetadata}
        >
          {scanBusy ? <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel> : t("settings.action.refresh")}
        </ButtonItem>
      </DialogControlsSection>
    );
  }

  return (
    <>
      {progressStyle}
      <PanelSectionRow>
        <Field label={t("qam.metadata.detectedGames")} bottomSeparator="none">
          {/* Steam's Field hides a falsy child, so 0 must be text. */}
          {String(detectedCount)}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={t("qam.metadata.saved")} bottomSeparator="none">
          {String(savedCount)}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={t("qam.metadata.missing")} bottomSeparator="none">
          {String(missingCount)}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={t("qam.metadata.refreshDescription")}
          bottomSeparator="none"
          disabled={!listReady || scanBusy || detectedCount === 0}
          onClick={onRefreshMetadata}
        >
          {scanBusy ? <ButtonLabel busy={true}>{t("qam.metadata.refreshing")}</ButtonLabel> : t("qam.metadata.refresh")}
        </ButtonItem>
      </PanelSectionRow>
      {progress ? <PanelSectionRow>{progress}</PanelSectionRow> : null}
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
  listReady = true,
}: Pick<MetadataSectionProps, "scanBusy" | "cacheBusy" | "delistedCountText" | "delistedDateText" | "delistedBusy" | "onClearCache" | "onRefreshDelisted" | "listReady">) {
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
          disabled={!listReady || cacheBusy || scanBusy}
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


