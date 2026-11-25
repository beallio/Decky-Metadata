import type { UpdateRpcResult, UpdateSettings } from "../types";

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  update_channel: "stable",
  automatic_update_checks: true,
  testing_tab_enabled: false,
};

export const resolveLoadedUpdateSettings = (
  result: UpdateRpcResult<UpdateSettings>
): UpdateSettings =>
  "status" in result
    ? DEFAULT_UPDATE_SETTINGS
    : {
        ...DEFAULT_UPDATE_SETTINGS,
        ...result,
        testing_tab_enabled: Boolean(result.testing_tab_enabled),
      };
