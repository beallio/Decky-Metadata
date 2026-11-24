import { useCallback, useEffect, useState } from "react";
import { allNonSteamGames } from "./steam";
import { GameOption } from "./types";

// Decky remounts the QAM page each time it opens from the plugin list. Start from the last list so the
// detected count shows at once; `loaded` stays false until this mount's fresh list arrives.
let lastGames: GameOption[] = [];

export const useNonSteamGames = () => {
  const [games, setGames] = useState<GameOption[]>(lastGames);
  const [loaded, setLoaded] = useState(false);
  const loadGames = useCallback(async () => {
    const loadedGames = await allNonSteamGames();
    lastGames = loadedGames;
    setGames(loadedGames);
    setLoaded(true);
    return loadedGames;
  }, []);
  useEffect(() => {
    void loadGames();
  }, [loadGames]);
  return { games, loaded, loadGames };
};
