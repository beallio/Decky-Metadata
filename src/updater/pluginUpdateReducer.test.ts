import { describe, expect, it } from "vitest";

import {
  initialUpdateState,
  updateReducer,
  type UpdateAction,
  type UpdateState,
} from "./pluginUpdateReducer";

const current = { status: "current", checked_at: "now", channel: "stable" } as const;
const candidate = {
  version: "0.4.0",
  tag: "v0.4.0",
  channel: "stable" as const,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action: "update" as const,
};

describe("plugin update reducer", () => {
  it.each<[UpdateAction, UpdateState["phase"]]>([
    [{ type: "HYDRATION_COMPLETE", installedReleasePublishedAt: null }, "idle"],
    [{ type: "CHECK_START" }, "checking"],
    [{ type: "CHECK_TIMEOUT", message: "timeout" }, "failed"],
    [{ type: "CHECK_FAILED", message: "offline" }, "failed"],
    [{ type: "CHECK_SUCCESS_CURRENT", result: current }, "idle"],
    [
      { type: "CHECK_SUCCESS_AVAILABLE", result: { ...current, status: "available", candidate }, candidate },
      "available",
    ],
    [{ type: "INSTALL_START" }, "installing"],
    [{ type: "INSTALL_HANDOFF_PENDING" }, "handoff_pending"],
    [{ type: "INSTALL_HANDED_OFF", candidate }, "available"],
    [{ type: "INSTALL_FAILED", message: "failed", candidate }, "failed"],
  ])("handles $type", (action, phase) => {
    expect(updateReducer(initialUpdateState, action).phase).toBe(phase);
  });

  it("flags a check timeout so the UI never matches on the message text", () => {
    const timedOut = updateReducer(initialUpdateState, { type: "CHECK_TIMEOUT", message: "interrupted" });
    expect(timedOut.checkTimedOut).toBe(true);
    expect(updateReducer(timedOut, { type: "CHECK_START" }).checkTimedOut).toBe(false);
    expect(updateReducer(initialUpdateState, { type: "CHECK_FAILED", message: "offline" }).checkTimedOut).toBe(false);
  });
});
