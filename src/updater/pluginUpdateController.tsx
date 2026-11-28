import { useEffect, useState } from "react";
import { toaster } from "@decky/api";
import type {
  PluginUpdateCandidate,
  RevalidateResult,
  UpdateChannel,
  UpdateCheckContext,
  UpdateCheckResult,
  UpdateInstallRequest,
  UpdateRpcResult,
  UpdateSettings,
} from "../types";
import {
  checkForPluginUpdate,
  clearPendingUpdateInstall,
  confirmUpdateInstallHandoff,
  frontendLog,
  getPluginVersion,
  getUpdateCheckContext,
  getUpdateSettings,
  recordUpdateInstallRequested,
  revalidatePluginUpdate,
  setAutomaticUpdateChecks,
  setTestingTabEnabled,
  setUpdateChannel,
} from "../backend";
import {
  invokeDeckyInstaller,
  INSTALL_TYPE_DOWNGRADE,
  INSTALL_TYPE_UPDATE,
} from "./deckyInstaller";
import { t, translateBackendError } from "../i18n";
import { toastError } from "../toast";
import { updateReducer, initialUpdateState } from "./pluginUpdateReducer";
import { DEFAULT_UPDATE_SETTINGS, resolveLoadedUpdateSettings } from "./updateSettings";

function logUpdate(traceId: string | null, stage: string, details?: Record<string, unknown>) {
  const detailsStr = details
    ? Object.entries(details)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")
    : "";
  const prefix = traceId ? `trace_id=${traceId}` : "trace_id=none";
  const message = `${stage}: ${prefix}${detailsStr ? ", " + detailsStr : ""}`;
  try {
    void frontendLog("update", message, null, "info").catch(() => {});
  } catch (_) {}
}

function generateUpdateTraceId(): string {
  return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const UPDATE_CHECK_UI_TIMEOUT_MS = 120000;

export type PluginUpdateControllerSnapshot = {
  pluginVersion: string;
  updateChannel: UpdateChannel;
  automaticUpdateChecks: boolean;
  testingTabEnabled: boolean;
  settingsLoaded: boolean;
  candidate: PluginUpdateCandidate | null;
  checkResult: UpdateCheckResult | null;
  errorMessage: string | null;
  checkTimedOut: boolean;
  isChecking: boolean;
  isInstalling: boolean;
  isHandoffPending: boolean;
  installedReleasePublishedAt: string | null;
};

export type PluginUpdateController = PluginUpdateControllerSnapshot & {
  checkNow(): Promise<void>;
  install(candidate: PluginUpdateCandidate): Promise<void>;
  setUpdateChannel(enabled: boolean): Promise<void>;
  setAutomaticUpdateChecks(enabled: boolean): Promise<void>;
  setTestingTabEnabled(enabled: boolean): Promise<void>;
};

export type PluginUpdateControllerDeps = {
  getPluginVersion: () => Promise<string>;
  getUpdateSettings: () => Promise<UpdateRpcResult<UpdateSettings>>;
  getUpdateCheckContext: () => Promise<UpdateRpcResult<UpdateCheckContext>>;
  checkForPluginUpdate: (currentVersion: string, force: boolean) => Promise<UpdateCheckResult>;
  setUpdateChannel: (channel: UpdateChannel) => Promise<UpdateRpcResult<UpdateSettings>>;
  setAutomaticUpdateChecks: (enabled: boolean) => Promise<UpdateRpcResult<UpdateSettings>>;
  setTestingTabEnabled: (enabled: boolean) => Promise<UpdateRpcResult<UpdateSettings>>;
  clearPendingUpdateInstall: (version: string | null) => Promise<UpdateRpcResult<UpdateCheckContext>>;
  confirmUpdateInstallHandoff: (version: string) => Promise<UpdateRpcResult<UpdateCheckContext>>;
  recordUpdateInstallRequested: (
    request: UpdateInstallRequest
  ) => Promise<UpdateRpcResult<UpdateCheckContext>>;
  revalidatePluginUpdate: (
    candidate: PluginUpdateCandidate
  ) => Promise<UpdateRpcResult<RevalidateResult>>;
  invokeDeckyInstaller: (
    url: string,
    version: string,
    sha256: string,
    installType: typeof INSTALL_TYPE_UPDATE | typeof INSTALL_TYPE_DOWNGRADE,
    traceId?: string
  ) => Promise<unknown>;
  toast: (options: { title: string; body: string; duration: number }) => void;
  toastError: (title: string, body: string) => void;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

type CheckOptions = {
  force: boolean;
  notify: boolean;
  source: "automatic" | "manual";
};

export class PluginUpdateControllerStore {
  private state = { ...initialUpdateState };
  private pluginVersion = "";
  // Settings the backend saved; checks follow only these. Pending choices show at once until their save settles.
  private confirmed: UpdateSettings = { ...DEFAULT_UPDATE_SETTINGS };
  private pendingChannel: { value: UpdateChannel } | null = null;
  private pendingAutomatic: { value: boolean } | null = null;
  private pendingTestingTab: { value: boolean } | null = null;
  // True from the Install click until Decky answers or the install fails: no check or second install meanwhile.
  private installOwned = false;
  private settingsLoaded = false;
  private readonly listeners = new Set<() => void>();
  private settingsSaveQueue: Promise<void> = Promise.resolve();
  private snapshot: PluginUpdateControllerSnapshot = {
    pluginVersion: "",
    updateChannel: "stable",
    automaticUpdateChecks: true,
    testingTabEnabled: false,
    settingsLoaded: false,
    candidate: null,
    checkResult: null,
    errorMessage: null,
    checkTimedOut: false,
    isChecking: false,
    isInstalling: false,
    isHandoffPending: false,
    installedReleasePublishedAt: null,
  };
  private initializationStarted = false;
  private generation = 0;
  private activeCheckId = 0;
  private inFlightCheck: Promise<UpdateCheckResult> | null = null;
  private checkTimeout: ReturnType<typeof setTimeout> | null = null;
  private handoffTimeout: ReturnType<typeof setTimeout> | null = null;
  private resolveHandoffTimeout: (() => void) | null = null;

  constructor(private readonly deps: PluginUpdateControllerDeps) {}

  getSnapshot(): PluginUpdateControllerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.initializationStarted) {
      this.initializationStarted = true;
      void this.initialize();
    }
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.generation += 1;
    this.installOwned = false;
    this.dropActiveCheck();
    this.clearHandoffTimeout(true);
  }

  checkNow = async (): Promise<void> => {
    await this.checkForUpdates({ force: true, notify: true, source: "manual" });
  };

  setUpdateChannel = async (enabled: boolean): Promise<void> => {
    const pending = { value: (enabled ? "development" : "stable") as UpdateChannel };
    const generation = this.generation;
    this.pendingChannel = pending;
    this.publish();
    let saved: UpdateSettings | null = null;
    try {
      const result = await this.saveSettings(() => this.deps.setUpdateChannel(pending.value));
      if (generation !== this.generation) return;
      if ("status" in result) {
        this.deps.toastError(
          t("panel.toast.updates"),
          result.message ? translateBackendError(result.message) : t("panel.updateChannelSaveError")
        );
      } else {
        saved = result;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      logUpdate(null, "update_channel_save_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.pendingChannel === pending) this.pendingChannel = null;
    if (saved) this.applySettings(saved);
    else this.publish();
  };

  setAutomaticUpdateChecks = async (enabled: boolean): Promise<void> => {
    const pending = { value: enabled };
    const generation = this.generation;
    this.pendingAutomatic = pending;
    this.publish();
    let saved: UpdateSettings | null = null;
    try {
      const result = await this.saveSettings(() => this.deps.setAutomaticUpdateChecks(enabled));
      if (generation !== this.generation) return;
      if ("status" in result) {
        this.deps.toastError(
          t("panel.toast.updates"),
          result.message ? translateBackendError(result.message) : t("panel.automaticUpdateSaveError")
        );
      } else {
        saved = result;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      logUpdate(null, "automatic_update_setting_save_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.pendingAutomatic === pending) this.pendingAutomatic = null;
    if (saved) this.applySettings(saved);
    else this.publish();
  };

  setTestingTabEnabled = async (enabled: boolean): Promise<void> => {
    const pending = { value: enabled };
    const generation = this.generation;
    this.pendingTestingTab = pending;
    this.publish();
    let saved: UpdateSettings | null = null;
    try {
      const result = await this.saveSettings(() => this.deps.setTestingTabEnabled(enabled));
      if (generation !== this.generation) return;
      if ("status" in result) {
        this.deps.toastError(
          t("panel.toast.updates"),
          result.message ? translateBackendError(result.message) : t("panel.testingTabSaveError")
        );
      } else {
        saved = resolveLoadedUpdateSettings(result);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      logUpdate(null, "testing_tab_setting_save_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.pendingTestingTab === pending) this.pendingTestingTab = null;
    if (saved) this.applySettings(saved);
    else this.publish();
  };

  install = async (targetCandidate: PluginUpdateCandidate): Promise<void> => {
    if (this.installOwned) return;
    this.installOwned = true;
    // A check that finishes during the install would overwrite its state.
    this.dropActiveCheck();
    const generation = this.generation;
    this.dispatch({ type: "INSTALL_START" });

    const traceId = generateUpdateTraceId();
    logUpdate(traceId, "install_clicked", { version: targetCandidate.version });
    try {
      const revalidationStarted = performance.now();
      logUpdate(traceId, "revalidate_start", { tag: targetCandidate.tag });
      const revalidation = await this.deps.revalidatePluginUpdate(targetCandidate);
      if (generation !== this.generation) return;
      if ("status" in revalidation || !("version" in revalidation)) {
        const message = "message" in revalidation ? revalidation.message : "unknown";
        logUpdate(traceId, "revalidate_failed", {
          message: message || "unknown",
          elapsed_ms: Math.round(performance.now() - revalidationStarted),
        });
        throw new Error(message || t("updater.install.revalidationFailed"));
      }
      logUpdate(traceId, "revalidate_success", {
        version: revalidation.version,
        elapsed_ms: Math.round(performance.now() - revalidationStarted),
      });

      const installType =
        targetCandidate.action === "downgrade_to_stable"
          ? INSTALL_TYPE_DOWNGRADE
          : INSTALL_TYPE_UPDATE;
      const request: UpdateInstallRequest = { ...revalidation, updateTraceId: traceId };
      const recordStarted = performance.now();
      logUpdate(traceId, "record_install_start", { version: revalidation.version });
      const recordResult = await this.deps.recordUpdateInstallRequested(request);
      if (generation !== this.generation) return;
      if (
        "status" in recordResult &&
        (recordResult.status === "failed" || recordResult.status === "skipped")
      ) {
        throw new Error(recordResult.message || t("updater.install.recordFailed"));
      }
      logUpdate(traceId, "record_install_success", {
        version: revalidation.version,
        elapsed_ms: Math.round(performance.now() - recordStarted),
      });

      const handoffStarted = performance.now();
      logUpdate(traceId, "handoff_start", {
        version: revalidation.version,
        sha256_prefix: revalidation.sha256 ? revalidation.sha256.slice(0, 8) : "none",
      });
      let handoffTimerFired = false;
      let resolveHandoffTimer!: () => void;
      const handoffPromise = new Promise<void>((resolve) => {
        resolveHandoffTimer = () => resolve(undefined);
      });
      this.resolveHandoffTimeout = resolveHandoffTimer;
      this.handoffTimeout = this.deps.setTimeout(() => {
        this.handoffTimeout = null;
        this.resolveHandoffTimeout = null;
        handoffTimerFired = true;
        resolveHandoffTimer();
      }, 3000);
      const installerPromise = this.deps.invokeDeckyInstaller(
        revalidation.artifact_url,
        revalidation.version,
        revalidation.sha256,
        installType,
        traceId
      );
      try {
        await Promise.race([installerPromise, handoffPromise]);
      } finally {
        this.clearHandoffTimeout();
      }
      if (generation !== this.generation) return;

      if (handoffTimerFired) {
        logUpdate(traceId, "handoff_pending", {
          status: "installer_handoff_pending",
          elapsed_ms: Math.round(performance.now() - handoffStarted),
        });
        this.dispatch({ type: "INSTALL_HANDOFF_PENDING" });
        void this.finishPendingHandoff(installerPromise, revalidation, traceId, handoffStarted, generation);
        return;
      }
      await installerPromise;
      if (generation !== this.generation) return;
      await this.handleHandoffSuccess(revalidation, traceId, handoffStarted, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.failInstall(error, targetCandidate, traceId, generation);
    }
  };

  private async initialize(): Promise<void> {
    const generation = this.generation;
    const versionRequest = this.deps.getPluginVersion().catch((error: unknown) => {
      logUpdate(null, "plugin_version_load_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return "";
    });
    const settingsRequest = this.deps.getUpdateSettings().catch((error: unknown) => {
      logUpdate(null, "update_settings_load_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    const contextRequest = this.deps.getUpdateCheckContext().catch((error: unknown) => {
      logUpdate(null, "update_context_load_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    const [version, settingsResult, contextResult] = await Promise.all([
      versionRequest,
      settingsRequest,
      contextRequest,
    ]);
    if (generation !== this.generation) return;

    if (version) this.pluginVersion = version;
    this.confirmed = resolveLoadedUpdateSettings(settingsResult ?? { status: "failed" });
    this.settingsLoaded = true;

    const context = contextResult && !("status" in contextResult) ? contextResult : null;
    this.dispatch({
      type: "HYDRATION_COMPLETE",
      installedReleasePublishedAt: context?.installed_release_published_at || null,
    });

    if (this.confirmed.automatic_update_checks) {
      void this.checkForUpdates({ force: false, notify: false, source: "automatic" });
    }
  }

  private get updateChannel(): UpdateChannel {
    return this.pendingChannel?.value ?? this.confirmed.update_channel;
  }

  private get automaticUpdateChecks(): boolean {
    return this.pendingAutomatic?.value ?? this.confirmed.automatic_update_checks;
  }

  private get testingTabEnabled(): boolean {
    return this.pendingTestingTab?.value ?? this.confirmed.testing_tab_enabled;
  }

  private dropActiveCheck(): void {
    this.activeCheckId += 1;
    this.inFlightCheck = null;
    this.clearCheckTimeout();
  }

  private saveSettings<T>(save: () => Promise<T>): Promise<T> {
    const pending = this.settingsSaveQueue.then(save);
    this.settingsSaveQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  /** Apply settings the backend saved; checks follow the change from the settings saved before. */
  private applySettings(settings: UpdateSettings): void {
    const previous = this.confirmed;
    this.confirmed = settings;
    const channelChanged = previous.update_channel !== settings.update_channel;
    const automaticChecksEnabled =
      !previous.automatic_update_checks && settings.automatic_update_checks && this.pendingAutomatic?.value !== false;
    if (channelChanged) {
      this.dropActiveCheck();
      this.dispatch({ type: "CHECK_CANCELLED" });
    } else {
      this.publish();
    }

    if (channelChanged) {
      // A user action, so it is not held back like an automatic check: it replaces the check dropped above.
      void this.checkForUpdates({ force: true, notify: false, source: "manual" });
    } else if (automaticChecksEnabled && this.settingsLoaded) {
      void this.checkForUpdates({ force: false, notify: false, source: "automatic" });
    }
  }

  private async checkForUpdates(options: CheckOptions): Promise<UpdateCheckResult | undefined> {
    if (this.installOwned) {
      logUpdate(null, "check_suppressed_install");
      return;
    }
    const currentVersion = this.pluginVersion;
    if (!currentVersion || currentVersion === "Loading...") return;
    if (options.source === "automatic" && !this.settingsLoaded) return;
    if (options.source === "automatic" && !this.confirmed.automatic_update_checks) {
      logUpdate(null, "automatic_check_suppressed_disabled");
      return;
    }

    // The backend checks its saved channel, so a pending channel choice does not count yet.
    const checkChannel = this.confirmed.update_channel;
    if (this.inFlightCheck) {
      logUpdate(null, "check_reuse", { channel: checkChannel, elapsed_ms: 0 });
      return this.inFlightCheck;
    }

    this.activeCheckId += 1;
    const checkId = this.activeCheckId;
    const generation = this.generation;
    const checkStarted = performance.now();
    this.dispatch({ type: "CHECK_START" });
    logUpdate(null, "check_start", { channel: checkChannel });
    this.clearCheckTimeout();
    this.checkTimeout = this.deps.setTimeout(() => {
      if (generation !== this.generation || this.activeCheckId !== checkId) return;
      this.activeCheckId += 1;
      this.inFlightCheck = null;
      this.checkTimeout = null;
      this.dispatch({ type: "CHECK_TIMEOUT", message: t("updater.check.interrupted") });
      logUpdate(null, "check_timeout", { checkId });
    }, UPDATE_CHECK_UI_TIMEOUT_MS);

    const request = (async (): Promise<UpdateCheckResult> => {
      try {
        const result = await this.deps.checkForPluginUpdate(currentVersion, options.force);
        if (generation !== this.generation || this.activeCheckId !== checkId) {
          return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
        }
        if (result.status !== "failed" && result.channel !== checkChannel) {
          logUpdate(null, "check_channel_mismatch", { channel: checkChannel, result_channel: result.channel });
          this.dispatch({ type: "CHECK_CANCELLED" });
          return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
        }
        const elapsedMs = Math.round(performance.now() - checkStarted);
        if (result.status === "failed") {
          const message = result.message
            ? translateBackendError(result.message)
            : t("updater.check.failed");
          logUpdate(null, "check_failed", {
            message: result.message || "unknown",
            elapsed_ms: elapsedMs,
          });
          this.dispatch({ type: "CHECK_FAILED", message, result });
          if (options.notify && options.force) {
            this.deps.toast({
              title: t("updater.check.failedTitle"),
              body: message,
              duration: 3000,
            });
          }
        } else if (result.status === "available") {
          const candidateVersion = result.candidate.version;
          const isStale = candidateVersion === currentVersion;
          if (isStale) {
            logUpdate(null, "check_success", {
              status: "current",
              stale_coerced: true,
              elapsed_ms: elapsedMs,
            });
            this.dispatch({
              type: "CHECK_SUCCESS_CURRENT",
              result: {
                status: "current",
                checked_at: result.checked_at,
                channel: checkChannel,
              },
            });
          } else {
            logUpdate(null, "check_success", {
              status: "available",
              version: candidateVersion,
              elapsed_ms: elapsedMs,
            });
            this.dispatch({
              type: "CHECK_SUCCESS_AVAILABLE",
              result,
              candidate: result.candidate,
            });
          }
        } else {
          logUpdate(null, "check_success", { status: "current", elapsed_ms: elapsedMs });
          this.dispatch({ type: "CHECK_SUCCESS_CURRENT", result });
        }
        return result;
      } catch (error) {
        if (generation !== this.generation || this.activeCheckId !== checkId) {
          return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
        }
        const elapsedMs = Math.round(performance.now() - checkStarted);
        const message = translateBackendError(error);
        logUpdate(null, "check_failed", { message, elapsed_ms: elapsedMs });
        this.dispatch({ type: "CHECK_FAILED", message });
        if (options.notify && options.force) {
          this.deps.toast({
            title: t("updater.check.failedTitle"),
            body: message,
            duration: 3000,
          });
        }
        return {
          status: "failed",
          checked_at: new Date().toISOString(),
          message,
        };
      } finally {
        if (
          generation === this.generation &&
          this.activeCheckId === checkId
        ) {
          this.inFlightCheck = null;
          this.clearCheckTimeout();
        }
      }
    })();
    this.inFlightCheck = request;
    return request;
  }

  private async handleHandoffSuccess(
    candidate: PluginUpdateCandidate,
    traceId: string,
    handoffStarted: number,
    generation: number
  ): Promise<void> {
    try {
      const result = await this.deps.confirmUpdateInstallHandoff(candidate.version);
      if (generation !== this.generation) return;
      if ("status" in result && (result.status === "failed" || result.status === "skipped")) {
        throw new Error(result.message || "Failed to confirm handoff");
      }
    } catch (error) {
      if (generation !== this.generation) return;
      logUpdate(traceId, "handoff_confirm_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (generation !== this.generation) return;
    logUpdate(traceId, "handoff_resolved", {
      status: "success",
      elapsed_ms: Math.round(performance.now() - handoffStarted),
    });
    this.installOwned = false;
    this.dispatch({ type: "INSTALL_HANDED_OFF", candidate });
    this.deps.toast({
      title: t("updater.installation.startedTitle"),
      body: t("updater.installation.startedBody", { version: candidate.version }),
      duration: 3000,
    });
  }

  private async finishPendingHandoff(
    installerPromise: Promise<unknown>,
    candidate: PluginUpdateCandidate,
    traceId: string,
    handoffStarted: number,
    generation: number
  ): Promise<void> {
    try {
      await installerPromise;
      if (generation !== this.generation) return;
      await this.handleHandoffSuccess(candidate, traceId, handoffStarted, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      logUpdate(traceId, "handoff_rejected", {
        message: translateBackendError(error),
        elapsed_ms: Math.round(performance.now() - handoffStarted),
      });
      await this.failInstall(error, candidate, traceId, generation);
    }
  }

  private async failInstall(
    error: unknown,
    candidate: PluginUpdateCandidate,
    traceId: string,
    generation: number
  ): Promise<void> {
    const message = translateBackendError(error);
    try {
      const result = await this.deps.clearPendingUpdateInstall(candidate.version);
      if (generation !== this.generation) return;
      if ("status" in result && (result.status === "failed" || result.status === "skipped")) {
        throw new Error(result.message || "Failed to clear pending install");
      }
    } catch (clearError) {
      if (generation !== this.generation) return;
      logUpdate(traceId, "pending_clear_failed", {
        message: clearError instanceof Error ? clearError.message : String(clearError),
      });
    }
    if (generation !== this.generation) return;
    // No follow-up check: it would replace the failure with a check result; the user can retry or press Check now.
    this.installOwned = false;
    this.dispatch({ type: "INSTALL_FAILED", message, candidate });
    this.deps.toast({
      title: t("updater.installation.failedTitle"),
      body: message,
      duration: 4000,
    });
  }

  private dispatch(action: Parameters<typeof updateReducer>[1]): void {
    this.state = updateReducer(this.state, action);
    this.publish();
  }

  private publish(): void {
    this.snapshot = {
      pluginVersion: this.pluginVersion,
      updateChannel: this.updateChannel,
      automaticUpdateChecks: this.automaticUpdateChecks,
      testingTabEnabled: this.testingTabEnabled,
      settingsLoaded: this.settingsLoaded,
      candidate: this.state.candidate,
      checkResult: this.state.checkResult,
      errorMessage: this.state.errorMessage,
      checkTimedOut: this.state.checkTimedOut,
      isChecking: this.state.phase === "checking",
      isInstalling: this.installOwned && this.state.phase !== "handoff_pending",
      isHandoffPending: this.state.phase === "handoff_pending",
      installedReleasePublishedAt: this.state.installedReleasePublishedAt,
    };
    for (const listener of this.listeners) listener();
  }

  private clearCheckTimeout(): void {
    if (this.checkTimeout !== null) {
      this.deps.clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
  }

  private clearHandoffTimeout(resolveWaiter = false): void {
    if (this.handoffTimeout !== null) {
      this.deps.clearTimeout(this.handoffTimeout);
      this.handoffTimeout = null;
    }
    const resolve = this.resolveHandoffTimeout;
    this.resolveHandoffTimeout = null;
    if (resolveWaiter) resolve?.();
  }
}

export const pluginUpdateController = new PluginUpdateControllerStore({
  getPluginVersion,
  getUpdateSettings,
  getUpdateCheckContext,
  checkForPluginUpdate,
  setUpdateChannel,
  setAutomaticUpdateChecks,
  setTestingTabEnabled,
  clearPendingUpdateInstall,
  confirmUpdateInstallHandoff,
  recordUpdateInstallRequested,
  revalidatePluginUpdate,
  invokeDeckyInstaller,
  toast: (options) => toaster.toast(options),
  toastError,
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
});

export function usePluginUpdateController(): PluginUpdateController {
  const [snapshot, setSnapshot] = useState(pluginUpdateController.getSnapshot());
  useEffect(() => {
    const refresh = () => setSnapshot(pluginUpdateController.getSnapshot());
    const unsubscribe = pluginUpdateController.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  return {
    ...snapshot,
    checkNow: pluginUpdateController.checkNow,
    install: pluginUpdateController.install,
    setUpdateChannel: pluginUpdateController.setUpdateChannel,
    setAutomaticUpdateChecks: pluginUpdateController.setAutomaticUpdateChecks,
    setTestingTabEnabled: pluginUpdateController.setTestingTabEnabled,
  };
}
