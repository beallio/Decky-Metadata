import { useCallback, useEffect, useState } from "react";
import { allNonSteamGames } from "./steam";
import { GameOption } from "./types";

export const useNonSteamGames = () => {
  const [games, setGames] = useState<GameOption[]>([]);
  const loadGames = useCallback(async () => {
    const loadedGames = await allNonSteamGames();
    setGames(loadedGames);
    return loadedGames;
  }, []);
  useEffect(() => {
    void loadGames();
  }, [loadGames]);
  return { games, loadGames };
};
