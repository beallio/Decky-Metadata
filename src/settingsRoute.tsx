import { DialogButton, Focusable, Navigation, staticClasses } from "@decky/ui";
import { FaGear } from "react-icons/fa6";
import { useT } from "./i18n";

// Not "/decky-metadata/settings": that matches the editor route "/decky-metadata/:appid".
export const SETTINGS_ROUTE = "/decky-metadata-settings";
// The QAM panel gives this button the first focus when it opens.
export const SETTINGS_BUTTON_CLASS = "decky-metadata-settings-button";

const RELOAD_TAB_GLOBAL_KEY = "__DECKY_METADATA_SETTINGS_RELOAD_TAB__";
const RELOAD_TAB_MAX_AGE_MS = 15_000;

type HistoryLocation = { pathname?: string; search?: string; hash?: string; state?: unknown };
type SteamHistory = {
  location?: HistoryLocation;
  replace?: (location: HistoryLocation) => void;
};
type WindowStore = { GamepadUIMainWindowInstance?: { m_history?: SteamHistory } };
type RouteRegistry = {
  addRoute(path: string, component: () => JSX.Element | null, props?: { exact?: boolean }): void;
  removeRoute(path: string): void;
};

type SavedReloadTab = { tab: string; savedAt: number };

let activeSettingsTab: string | null = null;

export const setActiveSettingsTab = (tab: string | null) => {
  activeSettingsTab = tab;
};

export const rememberSettingsTabForReload = () => {
  if (!activeSettingsTab || !isSettingsRouteOpen()) return;
  const host = globalThis as Record<string, unknown>;
  host[RELOAD_TAB_GLOBAL_KEY] = { tab: activeSettingsTab, savedAt: Date.now() } satisfies SavedReloadTab;
};

export const consumeReloadSettingsTab = (): string | null => {
  const host = globalThis as Record<string, unknown>;
  const saved = host[RELOAD_TAB_GLOBAL_KEY] as SavedReloadTab | undefined;
  delete host[RELOAD_TAB_GLOBAL_KEY];
  if (!saved || typeof saved.tab !== "string" || typeof saved.savedAt !== "number") return null;
  if (Date.now() - saved.savedAt > RELOAD_TAB_MAX_AGE_MS) return null;
  return saved.tab;
};

const getSteamHistory = (): SteamHistory | undefined => {
  // Current Steam has SteamUIStore and no Router global; older builds have Router.
  const host = globalThis as {
    SteamUIStore?: { WindowStore?: WindowStore; m_WindowStore?: WindowStore };
    Router?: { WindowStore?: WindowStore };
  };
  const windowStore = host.SteamUIStore?.WindowStore ?? host.SteamUIStore?.m_WindowStore ?? host.Router?.WindowStore;
  return windowStore?.GamepadUIMainWindowInstance?.m_history;
};

// Some route contexts report Steam's "/routes" prefix; both forms are the open Settings page.
const normalizeRoutePath = (pathname?: string): string | undefined => pathname?.replace(/^\/routes(?=\/)/, "");

export const isSettingsRouteOpen = (): boolean => normalizeRoutePath(getSteamHistory()?.location?.pathname) === SETTINGS_ROUTE;

/**
 * Decky's router wrapper only rebuilds its route list when `routes.size` changes and returns
 * the same Switch element reference, so an in-place plugin reload while Settings is open leaves
 * the old SettingsPage mounted. Briefly adding a sentinel route forces the route list rebuild,
 * and `history.replace` on the same path makes React Router swap in the new SettingsPage without
 * adding a duplicate history entry.
 */
export const refreshOpenSettingsRoute = (routes: RouteRegistry): (() => void) => {
  const history = getSteamHistory();
  const loc = history?.location;
  if (normalizeRoutePath(loc?.pathname) !== SETTINGS_ROUTE || typeof history?.replace !== "function") {
    return () => undefined;
  }

  const sentinel = `${SETTINGS_ROUTE}-reload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let sentinelRegistered = true;
  let replaceTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

  const removeSentinel = () => {
    if (!sentinelRegistered) return;
    sentinelRegistered = false;
    try {
      routes.removeRoute(sentinel);
    } catch {
      // Ignore cleanup errors during dismount.
    }
  };

  routes.addRoute(sentinel, () => null, { exact: true });
  replaceTimer = setTimeout(() => {
    replaceTimer = undefined;
    const latestHistory = getSteamHistory();
    const latestLoc = latestHistory?.location;
    if (normalizeRoutePath(latestLoc?.pathname) === SETTINGS_ROUTE && typeof latestHistory?.replace === "function") {
      latestHistory.replace({
        pathname: latestLoc?.pathname ?? SETTINGS_ROUTE,
        search: latestLoc?.search ?? "",
        hash: latestLoc?.hash ?? "",
        state: latestLoc?.state,
      });
    }
    cleanupTimer = setTimeout(() => {
      cleanupTimer = undefined;
      removeSentinel();
    }, 50);
  }, 50);

  return () => {
    if (replaceTimer !== undefined) clearTimeout(replaceTimer);
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    removeSentinel();
  };
};

export const openSettings = (tab?: string) => {
  if (tab) {
    const host = globalThis as Record<string, unknown>;
    host[RELOAD_TAB_GLOBAL_KEY] = { tab, savedAt: Date.now() } satisfies SavedReloadTab;
  }
  Navigation.CloseSideMenus();
  // A second Navigate to the open route pushes a duplicate history entry, and one B would not leave.
  if (!isSettingsRouteOpen()) Navigation.Navigate(SETTINGS_ROUTE);
};

// QAM header: the Decky display name plus a gear that opens Settings.
export function SettingsTitleView() {
  const t = useT();
  return (
    <Focusable
      className={staticClasses.Title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: 0,
        boxShadow: "none",
        ...(staticClasses.Title
          ? {}
          : { fontSize: "22px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }),
      }}
    >
      <div>{"Decky Metadata"}</div>
      <DialogButton
        className={SETTINGS_BUTTON_CLASS}
        aria-label={t("settings.open")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "28px",
          width: "40px",
          minWidth: 0,
          padding: 0,
        }}
        onClick={() => openSettings()}
      >
        <FaGear />
      </DialogButton>
    </Focusable>
  );
}
