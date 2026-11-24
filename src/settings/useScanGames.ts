import { useEffect, useRef } from "react";
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

  // Shortcuts can change while the QAM stays mounted; reload them after each scan that finishes while mounted.
  // A scan that finished before mount needs nothing: the mount already loads the list.
  const seenRevision = useRef(scan.completedRevision);
  useEffect(() => {
    if (scan.completedRevision === seenRevision.current) return;
    seenRevision.current = scan.completedRevision;
    void loadGames();
  }, [scan.completedRevision]);

  return { games, scan };
}
