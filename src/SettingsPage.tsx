import { DialogControlsSection, Focusable, Navigation } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaBars, FaClock, FaFileAlt, FaInfoCircle, FaPlayCircle, FaSyncAlt, FaTrophy } from "react-icons/fa";
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
import { VersionsBody } from "./components/qam/VersionsSection";
import { hltbController } from "./hltb/gameView";
import { currentSteamLanguage, refreshLanguage, useT } from "./i18n";
import { metadataScanStore, useMetadataScan } from "./metadataScan";
import { protonDbBadgeController } from "./protondb/controller";
import { ProtonDbIcon } from "./protondb/Icon";
import { useCompatibilityPolicy } from "./settings/useCompatibilityPolicy";
import { useLogsSettings } from "./settings/useLogsSettings";
import { useMetadataMaintenance } from "./settings/useMetadataMaintenance";
import { useVersions } from "./settings/useVersions";
import { scanView } from "./settings/scanView";
import { SettingsLayout, type SettingsLayoutPage } from "./settingsLayout";
import { miniAchievementsController } from "./steam/miniAchievementsController";
import { trailerController } from "./trailers/controller";
import { usePluginUpdateController } from "./updater/pluginUpdateController";
import { useNonSteamGames } from "./useNonSteamGames";

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
  versions: <FaInfoCircle />,
};

export function SettingsPage() {
  const t = useT();
  const [page, setPage] = useState("metadata");

  // Every container hook runs here, above the layout: the native layout mounts only the active page,
  // so state kept in a page body would reset on a tab switch.
  const { games } = useNonSteamGames();
  const scan = useMetadataScan();
  const maintenance = useMetadataMaintenance(games);
  const compatibility = useCompatibilityPolicy();
  const logs = useLogsSettings();
  const versions = useVersions();
  const updates = usePluginUpdateController();
  const [trailers, setTrailers] = useState(trailerController.getSnapshot());
  const [miniAchievements, setMiniAchievements] = useState(miniAchievementsController.getSnapshot());
  const [protonDb, setProtonDb] = useState(protonDbBadgeController.getSnapshot());
  const [hltb, setHltb] = useState(hltbController.getSnapshot());

  useEffect(() => {
    void refreshLanguage();
  }, []);
  useEffect(() => trailerController.subscribe(() => setTrailers(trailerController.getSnapshot())), []);
  useEffect(() => miniAchievementsController.subscribe(() => setMiniAchievements(miniAchievementsController.getSnapshot())), []);
  useEffect(() => {
    const unsubscribe = protonDbBadgeController.subscribe(() => setProtonDb(protonDbBadgeController.getSnapshot()));
    setProtonDb(protonDbBadgeController.getSnapshot());
    return unsubscribe;
  }, []);
  useEffect(() => {
    const unsubscribe = hltbController.subscribe(() => setHltb(hltbController.getSnapshot()));
    setHltb(hltbController.getSnapshot());
    return unsubscribe;
  }, []);
  useEffect(() => {
    void metadataScanStore.refreshCounts(games);
  }, [games]);

  const pages: SettingsLayoutPage[] = [
    {
      id: "metadata",
      label: t("qam.metadata.title"),
      icon: icons.metadata,
      content: (
        <DialogControlsSection>
          <MetadataScanBody
            {...scanView(scan)}
            detectedCount={games.length}
            savedCount={scan.savedCount}
            missingCount={scan.missingCount}
            onRefreshMetadata={() => void metadataScanStore.start(games, currentSteamLanguage)}
          />
          <MetadataMaintenanceBody scanBusy={scan.busy} {...maintenance} />
        </DialogControlsSection>
      ),
    },
    {
      id: "compat",
      label: t("qam.compat.title"),
      icon: icons.compat,
      content: (
        <DialogControlsSection>
          <CompatibilityBody {...compatibility} />
        </DialogControlsSection>
      ),
    },
    {
      id: "protondb",
      label: t("qam.protondb.title"),
      icon: icons.protondb,
      content: (
        <DialogControlsSection>
          <ProtonDbBadgesBody
            snapshot={protonDb}
            onSettingsChange={(update) => protonDbBadgeController.setSettings(update(protonDbBadgeController.getSnapshot().settings))}
            onCoverPositionChange={(coverPosition) => protonDbBadgeController.setSettings({
              ...protonDbBadgeController.getSnapshot().settings, coverPosition,
            })}
          />
        </DialogControlsSection>
      ),
    },
    {
      id: "hltb",
      label: t("qam.hltb.title"),
      icon: icons.hltb,
      content: (
        <DialogControlsSection>
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
        </DialogControlsSection>
      ),
    },
    {
      id: "trailers",
      label: t("qam.trailers.title"),
      icon: icons.trailers,
      content: (
        <DialogControlsSection>
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
        </DialogControlsSection>
      ),
    },
    {
      id: "miniAchievements",
      label: t("qam.miniAchievements.title"),
      icon: icons.miniAchievements,
      content: (
        <DialogControlsSection>
          <MiniAchievementsBody
            state={miniAchievements}
            onEnabledChange={(enabled) => void miniAchievementsController.setEnabled(enabled)}
          />
        </DialogControlsSection>
      ),
    },
    {
      id: "contextMenu",
      label: t("qam.contextMenu.title"),
      icon: icons.contextMenu,
      content: <DialogControlsSection><ContextMenuBody /></DialogControlsSection>,
    },
    {
      id: "logs",
      label: t("qam.logs.title"),
      icon: icons.logs,
      separatorBefore: true,
      content: <DialogControlsSection><LogsBody {...logs} /></DialogControlsSection>,
    },
    {
      id: "updates",
      label: t("qam.update.title"),
      icon: icons.updates,
      content: <DialogControlsSection><PluginUpdateBody /></DialogControlsSection>,
    },
    {
      id: "versions",
      label: t("qam.versions.title"),
      icon: icons.versions,
      content: (
        <DialogControlsSection>
          <VersionsBody pluginVersion={updates.pluginVersion} {...versions} />
        </DialogControlsSection>
      ),
    },
  ];

  return (
    <Focusable className={rootClassName} onCancelButton={() => Navigation.NavigateBack()}>
      <style>{css}</style>
      <SettingsLayout pages={pages} page={page} onPageRequested={setPage} />
    </Focusable>
  );
}
