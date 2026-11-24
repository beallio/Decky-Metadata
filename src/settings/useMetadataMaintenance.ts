import { useCallback, useEffect, useState } from "react";
import { clearMetadataCache, getDelistedIndexStatus, refreshDelistedIndex } from "../backend";
import { hltbStore } from "../hltb/store";
import { currentSteamLanguage, formatDate, formatNumber, translateBackendError, useT } from "../i18n";
import * as log from "../log";
import { metadataScanStore } from "../metadataScan";
import { toastError, toastSuccess } from "../toast";
import type { GameOption } from "../types";

const epochToDate = (value?: number | null) => {
  if (!value) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(date);
};

// Clear cache and the delisted Steam index: MetadataMaintenanceBody props.
export const useMetadataMaintenance = (games: GameOption[]) => {
  const t = useT();
  const [cacheBusy, setCacheBusy] = useState(false);
  const [delistedStatus, setDelistedStatus] = useState<{ count: number; fetched_at: number } | null>(null);
  const [delistedBusy, setDelistedBusy] = useState(false);

  const loadDelistedStatus = useCallback(async () => {
    try {
      setDelistedStatus(await getDelistedIndexStatus());
    } catch (error) {
      log.warn("bridge", "delisted index status load failed", error);
    }
  }, []);

  useEffect(() => {
    void loadDelistedStatus();
  }, [loadDelistedStatus]);

  const onClearCache = async () => {
    if (cacheBusy || metadataScanStore.getSnapshot().busy) return;
    setCacheBusy(true);
    try {
      await clearMetadataCache();
      // Clear cache takes every game off the removed list; HLTB must ask again.
      hltbStore.reset();
      await metadataScanStore.refreshCounts(games);
      if (games.length) void metadataScanStore.start(games, currentSteamLanguage);
      toastSuccess(t("panel.toast.cache"), t("panel.cacheCleared"));
    } catch (error) {
      toastError(t("panel.toast.cacheClearFailed"), translateBackendError(error));
    } finally {
      setCacheBusy(false);
    }
  };

  const onRefreshDelisted = async () => {
    if (delistedBusy) return;
    setDelistedBusy(true);
    try {
      const result = await refreshDelistedIndex();
      if (!result.ok) {
        throw new Error("Delisted index refresh failed");
      }
      toastSuccess(t("panel.toast.delisted"), t("panel.delistedUpdated"));
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toastError(t("panel.toast.delisted"), t("panel.delistedRefreshFailed"));
    } finally {
      setDelistedBusy(false);
    }
  };

  const downloaded = Boolean(delistedStatus?.count && delistedStatus.fetched_at);
  return {
    cacheBusy,
    delistedBusy,
    delistedCountText: downloaded
      ? t("panel.delistedCount", { value: formatNumber(delistedStatus!.count) })
      : t("panel.delistedNotDownloaded"),
    delistedDateText: downloaded
      ? t("panel.delistedLastUpdated", { date: epochToDate(delistedStatus!.fetched_at) })
      : "",
    onClearCache,
    onRefreshDelisted,
  };
};
