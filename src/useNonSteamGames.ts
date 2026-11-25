import { useCallback, useEffect, useState } from "react";
import { allNonSteamGames } from "./steam";
import { GameOption } from "./types";

// Decky remounts the QAM page each time it opens from the plugin list. Start from the last list so the
// detected count shows at once; `loaded` stays false until this mount's fresh list arrives.
let lastGames: GameOption[] = [];

let pendingLoad: Promise<GameOption[]> | null = null;

/**
 * Loads the list and keeps it for the next mount; plugin load calls it so the first QAM open has data.
 * Callers share an in-flight load, so the startup preload and a mount count the same list.
 */
export const loadNonSteamGames = () =>
  (pendingLoad ??= allNonSteamGames()
    .then((games) => (lastGames = games))
    .finally(() => { pendingLoad = null; }));

export const useNonSteamGames = () => {
  const [games, setGames] = useState<GameOption[]>(lastGames);
  const [loaded, setLoaded] = useState(false);
  const loadGames = useCallback(async () => {
    const loadedGames = await loadNonSteamGames();
    setGames(loadedGames);
    setLoaded(true);
    return loadedGames;
  }, []);
  useEffect(() => {
    void loadGames();
  }, [loadGames]);
  return { games, loaded, loadGames };
};
