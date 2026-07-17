import type { UpdateRpcResult, UpdateSettings } from "../types";

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  update_channel: "stable",
  automatic_update_checks: true,
};

export const resolveLoadedUpdateSettings = (
  result: UpdateRpcResult<UpdateSettings>
): UpdateSettings => ("status" in result ? DEFAULT_UPDATE_SETTINGS : result);

export const resolveSavedUpdateSettings = (
  previous: UpdateSettings,
  result: UpdateRpcResult<UpdateSettings>
): UpdateSettings => ("status" in result ? previous : result);
