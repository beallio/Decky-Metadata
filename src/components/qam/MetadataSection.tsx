import { ButtonItem, DialogControlsSection, DialogControlsSectionHeader, Field, PanelSectionRow, ProgressBarWithInfo } from "@decky/ui";

import { ButtonLabel } from "../../styles";
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
  // Native default is a fixed-width, focusable column at the right; the bar uses the whole row instead.
  const progress = scanBusy ? (
    <ProgressBarWithInfo
      nProgress={scanTotal > 0 ? (scanCompleted / scanTotal) * 100 : 0}
      sOperationText={scanMessage || t("qam.metadata.refreshingStatus")}
      childrenContainerWidth="max"
      focusable={false}
      bottomSeparator={inline ? undefined : "none"}
    />
  ) : null;

  if (inline) {
    return (
      <DialogControlsSection>
        <Field label={t("qam.metadata.detectedGames")}>{String(detectedCount)}</Field>
        <Field label={t("qam.metadata.saved")}>{String(savedCount)}</Field>
        <Field label={t("qam.metadata.missing")}>{String(missingCount)}</Field>
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
      {progress}
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


