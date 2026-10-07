import { currentRoutePath, getNativeOverview, isCurrentGameInfoRoute, isNativeNonSteamShortcut, metadataCache } from "./core";
import { findSteamUiDocumentMatch } from "./steamUiHost";
import { findLiveModuleChild } from "./steamUiModules";

/** Refresh the mounted native date owner, without wrapping its lazy MobX render. */
export const refreshNativeReleaseDateView = (appId: number): boolean => {
  if (!isCurrentGameInfoRoute(currentRoutePath(), appId) ||
      !isNativeNonSteamShortcut(getNativeOverview(appId)) ||
      metadataCache[String(appId)]?.release_date === undefined) return false;
  const className = findLiveModuleChild((module: unknown) => {
    if (!module || typeof module !== "object") return undefined;
    if ("GameDescription" in module && typeof module.GameDescription === "string" &&
        "DescriptionStatsCtn" in module && typeof module.DescriptionStatsCtn === "string" &&
        "InnerContainer" in module && typeof module.InnerContainer === "string") return module.InnerContainer;
    return undefined;
  });
  if (typeof className !== "string" || !/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(className)) return false;
  return findSteamUiDocumentMatch(document => {
    for (const element of document.querySelectorAll<HTMLElement>(`.${className}`)) {
      if (!element.isConnected || element.getClientRects().length === 0) continue;
      const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
      let fiber: unknown = key ? Reflect.get(element, key) : undefined;
      for (let depth = 0; fiber && typeof fiber === "object" && depth < 20; depth++) {
        const owner = "stateNode" in fiber ? fiber.stateNode : undefined;
        if (owner && typeof owner === "object" && "forceUpdate" in owner && typeof owner.forceUpdate === "function" &&
            "props" in owner && owner.props && typeof owner.props === "object" &&
            "overview" in owner.props && owner.props.overview && typeof owner.props.overview === "object" &&
            "appid" in owner.props.overview && Number(owner.props.overview.appid) === appId &&
            owner.constructor.toString().includes("GetCanonicalReleaseDate")) {
          owner.forceUpdate();
          return true;
        }
        // Read only the confirmed overview prop; never traverse store instances.
        fiber = "return" in fiber ? fiber.return : undefined;
      }
    }
    return undefined;
  }) ?? false;
};
