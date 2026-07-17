import { useRef, useCallback, useEffect, useReducer } from "react";
import { toaster } from "@decky/api";
import {
  PluginUpdateCandidate,
  UpdateCheckResult,
  UpdateChannel
} from "../types";
import {
  checkForPluginUpdate,
  clearPendingUpdateInstall,
  confirmUpdateInstallHandoff,
  getUpdateCheckContext,
  frontendLog,
  recordUpdateInstallRequested,
  revalidatePluginUpdate,
} from "../backend";
import {
  invokeDeckyInstaller,
  INSTALL_TYPE_DOWNGRADE,
  INSTALL_TYPE_UPDATE,
} from "./deckyInstaller";
import { updateReducer, initialUpdateState } from "./pluginUpdateReducer";


function logUpdate(traceId: string | null, stage: string, details?: any) {
  const detailsStr = details
    ? Object.entries(details)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  const prefix = traceId ? `trace_id=${traceId}` : "trace_id=none";
  const message = `${stage}: ${prefix}${detailsStr ? ", " + detailsStr : ""}`;
  try {
    void frontendLog("update", message, null, "info").catch(() => {});
  } catch (_) {}
}

function generateUpdateTraceId(): string {
  return "tr-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

export const UPDATE_CHECK_UI_TIMEOUT_MS = 120000;

export interface PluginUpdateControllerProps {
  currentVersion: string;
  updateChannel: UpdateChannel;
  automaticUpdateChecks: boolean;
  settingsLoaded: boolean;
  onInstallVersionConfirmed?: (version: string) => void;
}

export type PluginUpdateController = {
  effectiveCurrentVersion: string;
  candidate: PluginUpdateCandidate | null;
  checkResult: UpdateCheckResult | null;
  errorMessage: string | null;
  isChecking: boolean;
  isInstalling: boolean;
  isHandoffPending: boolean;
  installedReleasePublishedAt: string | null;
  checkNow(): Promise<void>;
  install(candidate: PluginUpdateCandidate): Promise<void>;
};

export function usePluginUpdateController({
  currentVersion,
  updateChannel,
  automaticUpdateChecks,
  settingsLoaded,
  onInstallVersionConfirmed
}: PluginUpdateControllerProps): PluginUpdateController {
  const [state, dispatch] = useReducer(updateReducer, initialUpdateState);

  const hasChecked = useRef(false);
  const inFlightCheck = useRef<Promise<any> | null>(null);
  const hydratedPendingInstallVersion = useRef<string | null>(null);

  const activeCheckId = useRef(0);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitialCheck = useRef(false);
  const automaticCheckToggleHydrated = useRef(false);
  const latestChannel = useRef(updateChannel);

  if (latestChannel.current !== updateChannel) {
    latestChannel.current = updateChannel;
    activeCheckId.current += 1;
    inFlightCheck.current = null;
  }

  const isHydrated = state.phase !== "hydrating";

  const effectiveCurrentVersion = state.installedOverride?.version ?? currentVersion;

  const clearCheckTimeout = useCallback(() => {
    if (checkTimeoutRef.current !== null) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }
  }, []);

  const finishCheck = useCallback((checkId: number) => {
    if (checkId === activeCheckId.current) {
      inFlightCheck.current = null;
      clearCheckTimeout();
    }
  }, [clearCheckTimeout]);

  const checkForUpdates = useCallback(
    async (opts: { force: boolean; notify: boolean; source: "automatic" | "manual" }) => {
      if (!effectiveCurrentVersion || effectiveCurrentVersion === "Loading...") {
        return;
      }
      if (opts.source === "automatic" && !settingsLoaded) {
        return;
      }
      if (opts.source === "automatic" && (state.installedOverride || state.pendingInstallVersion)) {
        logUpdate(null, "automatic_check_suppressed_pending_install");
        return;
      }
      const checkChannel = updateChannel;
      if (inFlightCheck.current && latestChannel.current === checkChannel) {
        logUpdate(null, "check_reuse", { channel: updateChannel, elapsed_ms: 0 });
        return inFlightCheck.current;
      }
      if (latestChannel.current !== checkChannel) {
        activeCheckId.current += 1;
        inFlightCheck.current = null;
        clearCheckTimeout();
        latestChannel.current = checkChannel;
      }

      activeCheckId.current += 1;
      const checkId = activeCheckId.current;

      const promise = (async () => {
        const checkStart = performance.now();
        dispatch({ type: "CHECK_START" });
        logUpdate(null, "check_start", { channel: updateChannel });

        clearCheckTimeout();
        checkTimeoutRef.current = setTimeout(() => {
          if (activeCheckId.current === checkId) {
            activeCheckId.current += 1;
            inFlightCheck.current = null;
            dispatch({ type: "CHECK_TIMEOUT", message: "Update check interrupted. Check again." });
            logUpdate(null, "check_timeout", { checkId });
          }
        }, UPDATE_CHECK_UI_TIMEOUT_MS);

        try {
          const res = await checkForPluginUpdate(effectiveCurrentVersion, opts.force);

          if (
            activeCheckId.current !== checkId ||
            latestChannel.current !== checkChannel ||
            (res.status !== "failed" && res.channel !== checkChannel)
          ) {
            return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
          }

          const elapsed_ms = Math.round(performance.now() - checkStart);
          if (res.status === "failed") {
            logUpdate(null, "check_failed", { message: res.message || "unknown", elapsed_ms });
            dispatch({ type: "CHECK_FAILED", message: res.message || "Failed to check for updates", result: res });
            if (opts.notify && opts.force) {
              toaster.toast({
                title: "Update Check Failed",
                body: res.message || "Failed to check for updates",
                duration: 3000
              });
            }
          } else if (res.status === "available") {
            const candidateVersion = res.candidate?.version;
            const isStale =
              (state.installedOverride && candidateVersion === state.installedOverride.version) ||
              candidateVersion === state.pendingInstallVersion ||
              candidateVersion === effectiveCurrentVersion;

            if (isStale) {
              logUpdate(null, "check_success", { status: "current", stale_coerced: true, elapsed_ms });
              dispatch({ type: "CHECK_SUCCESS_CURRENT", result: { status: "current", checked_at: res.checked_at, channel: updateChannel } });
            } else {
              logUpdate(null, "check_success", { status: "available", version: candidateVersion, elapsed_ms });
              dispatch({ type: "CHECK_SUCCESS_AVAILABLE", result: res, candidate: res.candidate! });
            }
          } else {
            logUpdate(null, "check_success", { status: "current", elapsed_ms });
            dispatch({ type: "CHECK_SUCCESS_CURRENT", result: res });
          }
          return res;
        } catch (err) {
          if (
            activeCheckId.current !== checkId ||
            latestChannel.current !== checkChannel
          ) {
            return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
          }

          const elapsed_ms = Math.round(performance.now() - checkStart);
          const msg = err instanceof Error ? err.message : String(err);
          logUpdate(null, "check_failed", { message: msg, elapsed_ms });
          dispatch({ type: "CHECK_FAILED", message: msg });
          if (opts.notify && opts.force) {
            toaster.toast({
              title: "Update Check Failed",
              body: msg,
              duration: 3000
            });
          }
          return {
            status: "failed",
            checked_at: new Date().toISOString(),
            message: msg
          };
        } finally {
          finishCheck(checkId);
        }
      })();

      inFlightCheck.current = promise;
      return promise;
    },
    [updateChannel, settingsLoaded, state.installedOverride, state.pendingInstallVersion, effectiveCurrentVersion, clearCheckTimeout, finishCheck]
  );

  const checkNow = useCallback(async () => {
    await checkForUpdates({ force: true, notify: true, source: "manual" });
  }, [checkForUpdates]);

  const handleHandoffSuccess = useCallback(
    async (version: string, channel: UpdateChannel, traceId: string, handoffStart: number) => {
      activeCheckId.current += 1;
      clearCheckTimeout();
      inFlightCheck.current = null;
      dispatch({ type: "INSTALL_SUCCESS", version, channel, preInstallVersion: currentVersion });

      try {
        const confirmRes = await confirmUpdateInstallHandoff(version);
        if ("status" in confirmRes && (confirmRes.status === "failed" || confirmRes.status === "skipped")) {
          throw new Error(confirmRes.message || "Failed to confirm handoff");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logUpdate(traceId, "handoff_confirm_failed", { message: msg });
      }
      logUpdate(traceId, "handoff_resolved", { status: "success", elapsed_ms: Math.round(performance.now() - handoffStart) });
      onInstallVersionConfirmed?.(version);
      toaster.toast({
        title: "Installation Initiated",
        body: `Requested installation of v${version} via Decky Loader.`,
        duration: 3000
      });
    },
    [currentVersion, onInstallVersionConfirmed, clearCheckTimeout]
  );

  useEffect(() => {
    if (!state.installedOverride) return;
    if (
      currentVersion &&
      currentVersion !== "Loading..." &&
      (currentVersion !== state.installedOverride.preInstallVersion ||
       currentVersion === state.installedOverride.version)
    ) {
      dispatch({ type: "CLEAR_INSTALLED_OVERRIDE" });
    }
  }, [currentVersion, state.installedOverride]);

  useEffect(() => {
    return () => {
      clearCheckTimeout();
    };
  }, [clearCheckTimeout]);

  useEffect(() => {
    if (latestChannel.current !== updateChannel) {
      latestChannel.current = updateChannel;
      activeCheckId.current += 1;
      inFlightCheck.current = null;
      clearCheckTimeout();
    }
  }, [updateChannel, clearCheckTimeout]);

  useEffect(() => {
    let active = true;
    async function loadCache() {
      try {
        const result = await getUpdateCheckContext();
        if (!active) return;
        if (result && !("status" in result && (result.status === "failed" || result.status === "skipped"))) {
          const ctx = result as import("../types").UpdateCheckContext;
          const pendingInstall = ctx.pending_update_install;

          if (
            pendingInstall?.version &&
            ctx.effective_installed_version === pendingInstall.version &&
            hydratedPendingInstallVersion.current !== pendingInstall.version
          ) {
            const pendingChannel: UpdateChannel =
              pendingInstall.channel === "development" ? "development" : "stable";
            hydratedPendingInstallVersion.current = pendingInstall.version;

            activeCheckId.current += 1;
            clearCheckTimeout();
            inFlightCheck.current = null;

            dispatch({
              type: "HYDRATION_COMPLETE",
              installedReleasePublishedAt: ctx.installed_release_published_at || null,
              pendingInstall: {
                version: pendingInstall.version,
                channel: pendingChannel,
                preInstallVersion: ctx.installed_version ?? currentVersion
              }
            });
            onInstallVersionConfirmed?.(pendingInstall.version);
            skipInitialCheck.current = true;
          } else {
            dispatch({
              type: "HYDRATION_COMPLETE",
              installedReleasePublishedAt: ctx.installed_release_published_at || null,
            });
          }

          if (
            settingsLoaded &&
            ctx.last_checked_at &&
            ctx.last_checked_channel === updateChannel
          ) {
            const hasPending =
              !!ctx.pending_update_install &&
              ctx.effective_installed_version === ctx.pending_update_install.version;
            if (ctx.last_available_tag && !hasPending) {
              void checkForUpdates({ force: false, notify: false, source: "automatic" });
            }
          }
        } else {
          dispatch({ type: "HYDRATION_COMPLETE", installedReleasePublishedAt: null });
        }
      } catch (err) {
        if (active) {
          dispatch({ type: "HYDRATION_COMPLETE", installedReleasePublishedAt: null });
        }
      }
    }
    void loadCache();
    return () => {
      active = false;
    };
  }, [currentVersion, onInstallVersionConfirmed, updateChannel, settingsLoaded, checkForUpdates, clearCheckTimeout]);

  useEffect(() => {
    if (!isHydrated || !settingsLoaded) {
      return;
    }
    if (!currentVersion || currentVersion === "Loading...") {
      return;
    }
    const isFirstMount = !hasChecked.current;
    hasChecked.current = true;

    if (isFirstMount) {
      if (skipInitialCheck.current) {
        logUpdate(null, "initial_check_skipped_hydration");
        return;
      }
      if (automaticUpdateChecks) {
        void checkForUpdates({ force: false, notify: false, source: "automatic" });
      }
    } else {
      void checkForUpdates({ force: true, notify: false, source: "automatic" });
    }
  }, [updateChannel, currentVersion, isHydrated, settingsLoaded, automaticUpdateChecks, checkForUpdates]);

  useEffect(() => {
    if (!isHydrated || !settingsLoaded) {
      return;
    }
    if (!automaticCheckToggleHydrated.current) {
      automaticCheckToggleHydrated.current = true;
      return;
    }
    if (!automaticUpdateChecks || !currentVersion || currentVersion === "Loading...") {
      return;
    }
    void checkForUpdates({ force: false, notify: false, source: "automatic" });
  }, [automaticUpdateChecks, currentVersion, isHydrated, settingsLoaded, checkForUpdates]);

  const install = useCallback(async (targetCandidate: PluginUpdateCandidate) => {
    if (state.phase === "installing" || state.phase === "handoff_pending") return;
    dispatch({ type: "INSTALL_START" });

    const updateTraceId = generateUpdateTraceId();
    logUpdate(updateTraceId, "install_clicked", { version: targetCandidate.version });

    try {
      const revalStart = performance.now();
      logUpdate(updateTraceId, "revalidate_start", { tag: targetCandidate.tag });
      const revalRes = await revalidatePluginUpdate(targetCandidate);
      const revalElapsed = Math.round(performance.now() - revalStart);
      if (
        ("status" in revalRes && revalRes.status === "failed") ||
        !("version" in revalRes)
      ) {
        const msg = "message" in revalRes ? revalRes.message : "unknown";
        logUpdate(updateTraceId, "revalidate_failed", { message: msg, elapsed_ms: revalElapsed });
        throw new Error(msg || "Revalidation failed");
      }
      logUpdate(updateTraceId, "revalidate_success", { version: revalRes.version, elapsed_ms: revalElapsed });

      const installType =
        targetCandidate.action === "downgrade_to_stable"
          ? INSTALL_TYPE_DOWNGRADE
          : INSTALL_TYPE_UPDATE;

      const payload = { ...revalRes, updateTraceId };

      const recordStart = performance.now();
      logUpdate(updateTraceId, "record_install_start", { version: revalRes.version });
      const recordRes = await recordUpdateInstallRequested(payload);
      if ("status" in recordRes && (recordRes.status === "failed" || recordRes.status === "skipped")) {
        throw new Error(recordRes.message || "Failed to record install request");
      }
      logUpdate(updateTraceId, "record_install_success", { version: revalRes.version, elapsed_ms: Math.round(performance.now() - recordStart) });

      activeCheckId.current += 1;
      clearCheckTimeout();
      inFlightCheck.current = null;
      dispatch({ type: "INSTALL_SUCCESS", version: revalRes.version, channel: revalRes.channel as UpdateChannel, preInstallVersion: currentVersion });

      const handoffStart = performance.now();
      logUpdate(updateTraceId, "handoff_start", {
        version: revalRes.version,
        sha256_prefix: revalRes.sha256 ? revalRes.sha256.slice(0, 8) : "none"
      });

      let handoffTimerFired = false;
      const handoffTimer = new Promise<void>((resolve) => {
        setTimeout(() => {
          handoffTimerFired = true;
          resolve();
        }, 3000);
      });

      const installerPromise = invokeDeckyInstaller(
        revalRes.artifact_url,
        revalRes.version,
        revalRes.sha256,
        installType,
        updateTraceId
      );

      await Promise.race([installerPromise, handoffTimer]);

      if (handoffTimerFired) {
        logUpdate(updateTraceId, "handoff_pending", { status: "installer_handoff_pending", elapsed_ms: Math.round(performance.now() - handoffStart) });
        dispatch({ type: "INSTALL_HANDOFF_PENDING" });
        void (async () => {
            try {
              await installerPromise;
              await handleHandoffSuccess(revalRes.version, revalRes.channel as UpdateChannel, updateTraceId, handoffStart);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logUpdate(updateTraceId, "handoff_rejected", { message: msg, elapsed_ms: Math.round(performance.now() - handoffStart) });
              try {
                const clearRes = await clearPendingUpdateInstall(revalRes.version);
                if ("status" in clearRes && (clearRes.status === "failed" || clearRes.status === "skipped")) {
                  throw new Error(clearRes.message || "Failed to clear pending install");
                }
              } catch (clearErr) {
                const clearMsg = clearErr instanceof Error ? clearErr.message : String(clearErr);
                logUpdate(updateTraceId, "pending_clear_failed", { message: clearMsg });
              }
              void checkForUpdates({ force: false, notify: false, source: "automatic" });
              dispatch({ type: "INSTALL_FAILED", message: msg });
              toaster.toast({
                title: "Installation Failed",
                body: msg,
                duration: 4000
              });
            }
        })();
      } else {
        await installerPromise;
        await handleHandoffSuccess(revalRes.version, revalRes.channel as UpdateChannel, updateTraceId, handoffStart);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        const clearRes = await clearPendingUpdateInstall(targetCandidate.version);
        if ("status" in clearRes && (clearRes.status === "failed" || clearRes.status === "skipped")) {
          throw new Error(clearRes.message || "Failed to clear pending install");
        }
      } catch (clearErr) {
        const clearMsg = clearErr instanceof Error ? clearErr.message : String(clearErr);
        logUpdate(updateTraceId, "pending_clear_failed", { message: clearMsg });
      }
      void checkForUpdates({ force: false, notify: false, source: "automatic" });
      dispatch({ type: "INSTALL_FAILED", message: msg });
      toaster.toast({
        title: "Installation Failed",
        body: msg,
        duration: 4000
      });
    }
  }, [state.phase, handleHandoffSuccess, checkForUpdates, currentVersion, clearCheckTimeout]);

  return {
    effectiveCurrentVersion,
    candidate: state.candidate,
    checkResult: state.checkResult,
    errorMessage: state.errorMessage,
    isChecking: state.phase === "checking",
    isInstalling: state.phase === "installing",
    isHandoffPending: state.phase === "handoff_pending",
    installedReleasePublishedAt: state.installedReleasePublishedAt,
    checkNow,
    install,
  };
}
