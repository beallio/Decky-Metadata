import { useEffect } from "react";
import * as log from "../log";
import { metadataScanStore, useMetadataScan } from "../metadataScan";
import { useNonSteamGames } from "../useNonSteamGames";

/** Detected games plus the shared scan snapshot, with counts kept current for both QAM and Settings. */
export function useScanGames() {
  const { games, loaded, loadGames } = useNonSteamGames();
  const scan = useMetadataScan();

  // Wait for the real list: counting [] would show 0 missing until the shortcuts load.
  useEffect(() => {
    if (!loaded) return;
    metadataScanStore.refreshCounts(games).catch((error) => log.warn("bridge", "metadata count refresh failed", error));
  }, [games, loaded]);

  // Shortcuts can change while the QAM stays mounted; reload them after each scan, as the QAM did before.
  useEffect(() => {
    if (scan.completedRevision > 0) void loadGames();
  }, [scan.completedRevision]);

  return { games, scan };
}
