import { PluginUpdateCandidate, UpdateCheckResult, UpdateChannel } from "../types";

export type UpdateStatePhase =
  | "hydrating"
  | "idle"
  | "checking"
  | "available"
  | "installing"
  | "handoff_pending"
  | "installed"
  | "failed";

export interface InstalledOverride {
  version: string;
  channel: UpdateChannel;
  preInstallVersion: string;
}

export interface UpdateState {
  phase: UpdateStatePhase;
  candidate: PluginUpdateCandidate | null;
  checkResult: UpdateCheckResult | null;
  errorMessage: string | null;
  checkTimedOut: boolean;
  installedReleasePublishedAt: string | null;
  installedOverride: InstalledOverride | null;
  pendingInstallVersion: string | null;
}

export const initialUpdateState: UpdateState = {
  phase: "hydrating",
  candidate: null,
  checkResult: null,
  errorMessage: null,
  checkTimedOut: false,
  installedReleasePublishedAt: null,
  installedOverride: null,
  pendingInstallVersion: null,
};

export type UpdateAction =
  | { type: "HYDRATION_COMPLETE"; installedReleasePublishedAt: string | null; pendingInstall?: { version: string; channel: UpdateChannel; preInstallVersion: string } }
  | { type: "CHECK_START" }
  | { type: "CHECK_TIMEOUT"; message: string }
  | { type: "CHECK_FAILED"; message: string; result?: UpdateCheckResult }
  | { type: "CHECK_SUCCESS_CURRENT"; result: UpdateCheckResult }
  | { type: "CHECK_SUCCESS_AVAILABLE"; result: UpdateCheckResult; candidate: PluginUpdateCandidate }
  | { type: "INSTALL_START" }
  | { type: "INSTALL_HANDOFF_PENDING" }
  | { type: "INSTALL_SUCCESS"; version: string; channel: UpdateChannel; preInstallVersion: string }
  | { type: "INSTALL_FAILED"; message: string; candidate: PluginUpdateCandidate }
  | { type: "CLEAR_INSTALLED_OVERRIDE" };

export function updateReducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case "HYDRATION_COMPLETE":
      if (action.pendingInstall) {
        return {
          ...state,
          phase: "installed",
          installedReleasePublishedAt: action.installedReleasePublishedAt,
          installedOverride: action.pendingInstall,
          pendingInstallVersion: action.pendingInstall.version,
          candidate: null,
          errorMessage: null,
          checkResult: { status: "current", checked_at: new Date().toISOString(), channel: action.pendingInstall.channel }
        };
      }
      return {
        ...state,
        phase: "idle",
        installedReleasePublishedAt: action.installedReleasePublishedAt,
      };

    case "CHECK_START":
      return {
        ...state,
        phase: "checking",
        errorMessage: null,
        checkTimedOut: false,
      };

    case "CHECK_TIMEOUT":
      return {
        ...state,
        phase: "failed",
        errorMessage: action.message,
        checkTimedOut: true,
        checkResult: {
          status: "failed",
          checked_at: new Date().toISOString(),
          message: action.message
        }
      };

    case "CHECK_FAILED":
      return {
        ...state,
        phase: "failed",
        errorMessage: action.message,
        checkTimedOut: false,
        checkResult: action.result || {
          status: "failed",
          checked_at: new Date().toISOString(),
          message: action.message
        }
      };

    case "CHECK_SUCCESS_CURRENT":
      return {
        ...state,
        phase: "idle",
        candidate: null,
        checkResult: action.result,
      };

    case "CHECK_SUCCESS_AVAILABLE":
      return {
        ...state,
        phase: "available",
        candidate: action.candidate,
        checkResult: action.result,
      };

    case "INSTALL_START":
      return {
        ...state,
        phase: "installing",
        errorMessage: null,
        checkTimedOut: false,
      };

    case "INSTALL_HANDOFF_PENDING":
      return {
        ...state,
        phase: "handoff_pending",
      };

    case "INSTALL_SUCCESS":
      return {
        ...state,
        phase: "installed",
        candidate: null,
        errorMessage: null,
        installedOverride: {
          version: action.version,
          channel: action.channel,
          preInstallVersion: action.preInstallVersion,
        },
        pendingInstallVersion: action.version,
        checkResult: {
          status: "current",
          checked_at: new Date().toISOString(),
          channel: action.channel
        }
      };

    case "INSTALL_FAILED":
      // Offer the same update again: INSTALL_SUCCESS cleared the candidate before the installer ran.
      return {
        ...state,
        phase: "failed",
        candidate: action.candidate,
        errorMessage: action.message,
        checkTimedOut: false,
        installedOverride: null,
        pendingInstallVersion: null,
      };

    case "CLEAR_INSTALLED_OVERRIDE":
      return {
        ...state,
        installedOverride: null,
        pendingInstallVersion: null,
        phase: state.phase === "installed" ? "idle" : state.phase,
      };

    default:
      return state;
  }
}
