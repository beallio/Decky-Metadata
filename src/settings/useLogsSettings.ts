import { createElement, useEffect, useRef, useState } from "react";
import { showModal } from "@decky/ui";

import { getDebugLogging, getPluginLogs, setDebugLogging } from "../backend";
import { PluginLogModal } from "../components/qam/PluginLogModal";
import { t } from "../i18n";
import * as log from "../log";
import { toastError } from "../toast";

export const useLogsSettings = () => {
  const [logsBusy, setLogsBusy] = useState(false);
  const [debugLogging, setDebugLoggingState] = useState(false);
  const [debugLoggingLoaded, setDebugLoggingLoaded] = useState(false);
  const [debugLoggingBusy, setDebugLoggingBusy] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    void getDebugLogging()
      .then((enabled) => {
        if (mounted.current) {
          setDebugLoggingState(enabled);
          log.setVerboseLogging(enabled);
        }
      })
      .catch((error) => log.warn("bridge", "debug logging setting load failed", error))
      .finally(() => { if (mounted.current) setDebugLoggingLoaded(true); });
    return () => { mounted.current = false; };
  }, []);

  const onToggleDebugLogging = async (enabled: boolean) => {
    if (debugLoggingBusy) return;
    const previous = debugLogging;
    setDebugLoggingBusy(true);
    setDebugLoggingState(enabled);
    log.setVerboseLogging(enabled);
    try {
      const saved = await setDebugLogging(enabled);
      setDebugLoggingState(saved);
      log.setVerboseLogging(saved);
      log.info("bridge", "debug logging setting updated", saved);
    } catch (error) {
      setDebugLoggingState(previous);
      log.setVerboseLogging(previous);
      log.warn("bridge", "debug logging setting update failed", error);
    } finally {
      setDebugLoggingBusy(false);
    }
  };

  const onViewLogs = async () => {
    if (logsBusy) return;
    setLogsBusy(true);
    try {
      const logs = await getPluginLogs();
      if (!mounted.current) return;
      let modal: ReturnType<typeof showModal> | undefined;
      modal = showModal(createElement(PluginLogModal, { logs, closeModal: () => modal?.Close() }));
    } catch (error) {
      log.warn("bridge", "plugin log load failed", error);
      toastError(t("panel.toast.logs"), t("panel.logsLoadFailed"));
    } finally {
      setLogsBusy(false);
    }
  };

  return { logsBusy, debugLogging, debugLoggingLoaded, debugLoggingBusy, onViewLogs, onToggleDebugLogging };
};
