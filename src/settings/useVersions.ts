import { useEffect, useState } from "react";

import { getSystemVersions } from "../backend";
import * as log from "../log";
import { getConnectedControllerTypes } from "../steam";

export const useVersions = () => {
  const [deckyVersion, setDeckyVersion] = useState("");
  const [steamosVersion, setSteamosVersion] = useState("");
  const [controllerTypes, setControllerTypes] = useState<number[]>([]);

  useEffect(() => {
    setControllerTypes(getConnectedControllerTypes());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSystemVersions()
      .then((versions) => {
        if (!cancelled) {
          setDeckyVersion(versions.decky || "");
          setSteamosVersion(versions.steamos || "");
        }
      })
      .catch((error) => log.warn("bridge", "system versions load failed", error));
    return () => { cancelled = true; };
  }, []);

  return { deckyVersion, steamosVersion, controllerTypes };
};
