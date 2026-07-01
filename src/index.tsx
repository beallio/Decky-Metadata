import { routerHook } from "@decky/api";
import { definePlugin, staticClasses } from "@decky/ui";
import { FaDatabase } from "react-icons/fa";
import { Content, MetadataPage } from "./components";
import contextMenuPatch, { LibraryContextMenu } from "./contextMenuPatch";
import { t } from "./i18n";
import { getDebugLogging } from "./backend";
import * as log from "./log";
import {
  installSteamPatches,
  refreshMetadataCache,
  refreshRaSettings,
  startMetadataBootstrap,
  PLAYHUB_ACHIEVEMENTS_ROUTE,
  PlayhubAchievementsRoute,
} from "./steam";

const METADATA_ROUTE = "/playhub-metadata/:appid";

export default definePlugin(() => {
  void getDebugLogging()
    .then((enabled) => log.setVerboseLogging(enabled))
    .catch((error) => log.warn("bridge", "debug logging setting load failed", error));
  void refreshMetadataCache();
  void refreshRaSettings();

  let unpatchSteam: (() => void) | undefined;
  try {
    unpatchSteam = installSteamPatches();
  } catch (error) {
    log.warn("bridge", "installSteamPatches failed", error);
  }
  const stopMetadataBootstrap = startMetadataBootstrap();
  const menuPatch = contextMenuPatch(LibraryContextMenu);

  routerHook.addRoute(METADATA_ROUTE, () => <MetadataPage />, { exact: true });
  routerHook.addRoute(PLAYHUB_ACHIEVEMENTS_ROUTE, () => <PlayhubAchievementsRoute />, { exact: true });

  return {
    name: t("pluginName"),
    titleView: <div className={staticClasses.Title}>{t("pluginName")}</div>,
    content: <Content />,
    icon: <FaDatabase />,
    onDismount() {
      try {
        menuPatch?.unpatch?.();
      } catch (error) {
        log.error("patch", "context menu unpatch failed", error);
      }
      try {
        stopMetadataBootstrap?.();
      } catch (error) {
        log.error("patch", "metadata bootstrap stop failed", error);
      }
      try {
        unpatchSteam?.();
      } catch (error) {
        log.error("patch", "Steam unpatch failed", error);
      }
      try {
        routerHook.removeRoute(METADATA_ROUTE);
        routerHook.removeRoute(PLAYHUB_ACHIEVEMENTS_ROUTE);
      } catch (error) {
        log.error("patch", "route remove failed", error);
      }
    },
  };
});
