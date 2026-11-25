import { Focusable, Navigation } from "@decky/ui";
import { useEffect, useState, type ComponentProps } from "react";
import { FaBars, FaClock, FaFileAlt, FaFlask, FaInfoCircle, FaPlayCircle, FaSyncAlt, FaTrophy } from "react-icons/fa";
import { FaTags } from "react-icons/fa6";
import { SiSteamdeck } from "react-icons/si";
import { CompatibilityBody } from "./components/qam/CompatibilitySection";
import { ContextMenuBody } from "./components/qam/ContextMenuSection";
import { GameTrailersBody } from "./components/qam/GameTrailersSection";
import { HltbBody } from "./components/qam/HltbSection";
import { LogsBody } from "./components/qam/LogsSection";
import { MetadataMaintenanceBody, MetadataScanBody } from "./components/qam/MetadataSection";
import { MiniAchievementsBody } from "./components/qam/MiniAchievementsSection";
import { PluginUpdateBody } from "./components/qam/PluginUpdateSection";
import { ProtonDbBadgesBody } from "./components/qam/ProtonDbBadgesSection";
import { TestingBody } from "./components/qam/TestingSection";
import { VersionsBody } from "./components/qam/VersionsSection";
import { hltbController } from "./hltb/gameView";
import { currentSteamLanguage, refreshLanguage, useT } from "./i18n";
import { metadataScanStore } from "./metadataScan";
import { protonDbBadgeController } from "./protondb/controller";
import { ProtonDbIcon } from "./protondb/Icon";
import { useCompatibilityPolicy } from "./settings/useCompatibilityPolicy";
import { useContextMenuSettings } from "./settings/useContextMenuSettings";
import { useLogsSettings } from "./settings/useLogsSettings";
import { useMetadataMaintenance } from "./settings/useMetadataMaintenance";
import { useVersions } from "./settings/useVersions";
import { useScanGames } from "./settings/useScanGames";
import { scanView } from "./settings/scanView";
import { SettingsLayout, type SettingsLayoutPage } from "./settingsLayout";
import { miniAchievementsController } from "./steam/miniAchievementsController";
import { trailerController } from "./trailers/controller";
import { usePluginUpdateController } from "./updater/pluginUpdateController";

const rootClassName = "decky-metadata-settings";
// Steam's settings wrapper fills the route host; without this the page stops short of the footer.
const css = `.${rootClassName} { height: 100%; }`;

// Module constants so page descriptors stay stable across renders.
const icons = {
  metadata: <FaTags />,
  compat: <SiSteamdeck />,
  protondb: <ProtonDbIcon />,
  hltb: <FaClock />,
  trailers: <FaPlayCircle />,
  miniAchievements: <FaTrophy />,
  contextMenu: <FaBars />,
  logs: <FaFileAlt />,
  updates: <FaSyncAlt />,
  testing: <FaFlask />,
  versions: <FaInfoCircle />,
};

type SnapshotStore<T> = { subscribe(listener: () => void): () => void; getSnapshot(): T };

/** Subscribe in the tab that shows the snapshot: a change re-renders that tab, not the whole page. */
function useStoreSnapshot<T>(store: SnapshotStore<T>): T {
  const [snapshot, setSnapshot] = useState(store.getSnapshot());
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setSnapshot(store.getSnapshot()));
    setSnapshot(store.getSnapshot());
    return unsubscribe;
  }, [store]);
  return snapshot;
}

// The feature controllers are module singletons, so their state survives a tab switch without a page-level hook.
function ProtonDbTab() {
  const protonDb = useStoreSnapshot(protonDbBadgeController);
  return (
    <ProtonDbBadgesBody
      snapshot={protonDb}
      onSettingsChange={(update) => protonDbBadgeController.setSettings(update(protonDbBadgeController.getSnapshot().settings))}
      onCoverPositionChange={(coverPosition) => protonDbBadgeController.setSettings({
        ...protonDbBadgeController.getSnapshot().settings, coverPosition,
      })}
    />
  );
}

function HltbTab() {
  const hltb = useStoreSnapshot(hltbController);
  return (
    <HltbBody
      settings={hltb.settings}
      settingsLoaded={hltb.settingsLoaded}
      conflict={hltb.conflict}
      settingsError={hltb.settingsError}
      cacheStatus={hltb.cacheStatus}
      onSettingsChange={(update) => hltbController.setSettings(update(hltbController.getSnapshot().settings))}
      onClearCache={() => hltbController.clearCache()}
      onStyleChange={(style) => hltbController.setSettings({ ...hltbController.getSnapshot().settings, style })}
      onBlurChange={(blur) => {
        const current = hltbController.getSnapshot().settings;
        return hltbController.setSettings({ ...current, appearance: { ...current.appearance, blur } });
      }}
    />
  );
}

function TrailersTab() {
  const trailers = useStoreSnapshot(trailerController);
  // The tab shows live trailer status, so the controller checks Steam every 2 s while it is open.
  useEffect(() => {
    trailerController.setPanelVisible(true);
    return () => trailerController.setPanelVisible(false);
  }, []);
  return (
    <GameTrailersBody
      state={trailers}
      onEnabledChange={(enabled) => void trailerController.setEnabled(enabled)}
      onDetailEnabledChange={(enabled) => void trailerController.setDetailEnabled(enabled)}
      onHomeEnabledChange={(enabled) => void trailerController.setHomeEnabled(enabled)}
      onAudioChange={(enabled) => void trailerController.setAudioEnabled(enabled)}
      onHideLogoChange={(hide) => void trailerController.setHideLogoDuringTrailer(hide)}
      onDetailFadeInDelayChange={(seconds) => void trailerController.setDetailFadeInDelaySeconds(seconds)}
      onHomeFadeInDelayChange={(seconds) => void trailerController.setHomeFadeInDelaySeconds(seconds)}
      onQualityChange={(quality) => trailerController.setQuality(quality)}
    />
  );
}

function MiniAchievementsTab() {
  const miniAchievements = useStoreSnapshot(miniAchievementsController);
  return (
    <MiniAchievementsBody
      state={miniAchievements}
      onEnabledChange={(enabled) => void miniAchievementsController.setEnabled(enabled)}
    />
  );
}

function VersionsTab(props: Omit<ComponentProps<typeof VersionsBody>, "pluginVersion">) {
  const { pluginVersion } = usePluginUpdateController();
  return <VersionsBody pluginVersion={pluginVersion} {...props} />;
}

export function SettingsPage() {
  const t = useT();
  const [page, setPage] = useState("metadata");

  // Hooks with page-local state run here, above the layout: the native layout mounts only the active page,
  // so state kept in a page body would reset on a tab switch.
  const { games, loaded, scan } = useScanGames();
  const maintenance = useMetadataMaintenance(games, loaded);
  const compatibility = useCompatibilityPolicy();
  const logs = useLogsSettings();
  const versions = useVersions();
  const contextMenu = useContextMenuSettings();
  const { testingTabEnabled } = usePluginUpdateController();

  useEffect(() => {
    void refreshLanguage();
  }, []);

  // Each body renders its own Steam settings sections.
  const pages: SettingsLayoutPage[] = [
    {
      id: "metadata",
      label: t("qam.metadata.title"),
      icon: icons.metadata,
      content: (
        <>
          <MetadataScanBody
            inline
            {...scanView(scan)}
            detectedCount={games.length}
            savedCount={scan.savedCount}
            missingCount={scan.missingCount}
            onRefreshMetadata={() => void metadataScanStore.start(games, currentSteamLanguage)}
            listReady={loaded}
          />
          <MetadataMaintenanceBody scanBusy={scan.busy} listReady={loaded} {...maintenance} />
        </>
      ),
    },
    { id: "compat", label: t("qam.compat.title"), icon: icons.compat, content: <CompatibilityBody {...compatibility} /> },
    { id: "protondb", label: t("qam.protondb.title"), icon: icons.protondb, content: <ProtonDbTab /> },
    { id: "hltb", label: t("qam.hltb.title"), icon: icons.hltb, content: <HltbTab /> },
    { id: "trailers", label: t("qam.trailers.title"), icon: icons.trailers, content: <TrailersTab /> },
    {
      id: "miniAchievements",
      label: t("qam.miniAchievements.title"),
      icon: icons.miniAchievements,
      content: <MiniAchievementsTab />,
    },
    { id: "contextMenu", label: t("qam.contextMenu.title"), icon: icons.contextMenu, content: <ContextMenuBody {...contextMenu} /> },
    { id: "logs", label: t("qam.logs.title"), icon: icons.logs, separatorBefore: true, content: <LogsBody {...logs} /> },
    { id: "updates", label: t("qam.update.title"), icon: icons.updates, content: <PluginUpdateBody /> },
    ...(testingTabEnabled
      ? [{ id: "testing", label: t("qam.testing.title"), icon: icons.testing, content: <TestingBody /> }]
      : []),
    { id: "versions", label: t("qam.versions.title"), icon: icons.versions, content: <VersionsTab {...versions} /> },
  ];
  const activePage = !testingTabEnabled && page === "testing" ? "updates" : page;

  return (
    <Focusable className={rootClassName} onCancelButton={() => Navigation.NavigateBack()}>
      <style>{css}</style>
      <SettingsLayout pages={pages} page={activePage} onPageRequested={setPage} />
    </Focusable>
  );
}
