import { useCallback, useEffect, useState } from "react";
import { allNonSteamGames } from "./steam";
import { GameOption } from "./types";

export const useNonSteamGames = () => {
  const [games, setGames] = useState<GameOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadGames = useCallback(async () => {
    const loadedGames = await allNonSteamGames();
    setGames(loadedGames);
    setLoaded(true);
    return loadedGames;
  }, []);
  useEffect(() => {
    void loadGames();
  }, [loadGames]);
  return { games, loaded, loadGames };
};
