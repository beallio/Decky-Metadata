import { routerHook } from "@decky/api";
import { definePlugin, staticClasses } from "@decky/ui";
import { FaDatabase } from "react-icons/fa";
import { Content } from "./ContentPanel";
import { MetadataPage } from "./MetadataPage";
import contextMenuPatch, { LibraryContextMenu } from "./contextMenuPatch";
import { getDebugLogging } from "./backend";
import * as log from "./log";
import {
  installSteamPatches,
  refreshMetadataCache,
  startMetadataBootstrap,
} from "./steam";

const METADATA_ROUTE = "/decky-metadata/:appid";

export default definePlugin(() => {
  void getDebugLogging()
    .then((enabled) => log.setVerboseLogging(enabled))
    .catch((error) => log.warn("bridge", "debug logging setting load failed", error));
  void refreshMetadataCache();

  let unpatchSteam: (() => void) | undefined;
  try {
    unpatchSteam = installSteamPatches();
  } catch (error) {
    log.warn("bridge", "installSteamPatches failed", error);
  }
  const stopMetadataBootstrap = startMetadataBootstrap();
  const menuPatch = contextMenuPatch(LibraryContextMenu);

  routerHook.addRoute(METADATA_ROUTE, () => <MetadataPage />, { exact: true });

  return {
    name: "Decky Metadata",
    titleView: <div className={staticClasses.Title}>{"Decky Metadata"}</div>,
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
      } catch (error) {
        log.error("patch", "route remove failed", error);
      }
    },
  };
});
