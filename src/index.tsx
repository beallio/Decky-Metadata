import { routerHook } from "@decky/api";
import { definePlugin, staticClasses } from "@decky/ui";
import { FaDatabase } from "react-icons/fa";
import { Content, MetadataPage } from "./components";
import contextMenuPatch, { LibraryContextMenu } from "./contextMenuPatch";
import { t } from "./i18n";
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
  void refreshMetadataCache();
  void refreshRaSettings();

  const unpatchSteam = installSteamPatches();
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
        console.error("[Playhub Metadata] context menu unpatch failed", error);
      }
      try {
        stopMetadataBootstrap?.();
      } catch (error) {
        console.error("[Playhub Metadata] metadata bootstrap stop failed", error);
      }
      try {
        unpatchSteam?.();
      } catch (error) {
        console.error("[Playhub Metadata] Steam unpatch failed", error);
      }
      try {
        routerHook.removeRoute(METADATA_ROUTE);
        routerHook.removeRoute(PLAYHUB_ACHIEVEMENTS_ROUTE);
      } catch (error) {
        console.error("[Playhub Metadata] route remove failed", error);
      }
    },
  };
});
