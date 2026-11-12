// Shows a mini achievement stat beside Play Time. Steam's November 2026 client
// removed its own bar and gates the replacement behind a client feature flag, so
// the row is drawn here from Steam's achievement progress. See NOTICE.
import { routerHook } from "@decky/api";
import { afterPatch, findClassModule, findInReactTree, Navigation } from "@decky/ui";
import * as log from "../log";
import { GAME_DETAIL_ROUTES, getNativeOverview, isNativeNonSteamShortcut, steamInternals } from "./core";
import { findSteamUiDocumentMatch } from "./steamUiHost";

const ROW_CLASS = "decky-metadata-mini-achievements";
const LABEL = "Achievements";
// Steam fills the progress cache from an RPC that can outlast one poll.
const CACHE_RETRY_DELAYS_MS = [500, 1500, 3000, 6000, 12000] as const;
const CAPTURE_RETRY_DELAYS_MS = [0, 50, 250, 1000] as const;
const MAX_FIBER_DEPTH = 12;
const TROPHY_PATH =
  "M7 2h10v4a5 5 0 0 1-4 4.9V14h3v2H6v-2h3v-3.1A5 5 0 0 1 5 6V2h2Zm2 2v2a3 3 0 0 0 6 0V4H9Z";

type AchievementTotals = { unlocked: number; total: number; percentage: number };

type AchievementProgressCache = {
  BGameHasAchievements?: (appId: number) => unknown;
  QueueCacheUpdate?: (appId: number) => unknown;
  m_achievementProgress?: { mapCache?: { get?: (appId: number) => unknown } };
};

type AchievementsService = {
  RegisterForAchievementChanges?: (listener: (appId?: unknown) => void) => unknown;
};

type RowParts = { row: HTMLElement; count: HTMLElement; fill: HTMLElement };

// Steam publishes its achievement progress cache on the global object.
const cacheHost = globalThis as unknown as { appAchievementProgressCache?: unknown };

// The play bar's CSS module, so the row inherits Steam's stat layout. It is
// looked up on use: the module may not be registered when the plugin loads.
let statsClassesCache: Record<string, string> | undefined;
const statsClasses = (): Record<string, string> => {
  if (!statsClassesCache?.GameStatsSection) {
    try {
      const found: unknown = findClassModule((module) => module.GameStat && module.Playtime);
      if (found && typeof found === "object") statsClassesCache = found as Record<string, string>;
    } catch {
      // A failed lookup keeps the previous classes and retries on the next use.
    }
  }
  return statsClassesCache ?? {};
};

const progressCache = (): AchievementProgressCache | undefined => {
  const cache = cacheHost.appAchievementProgressCache;
  return cache && typeof cache === "object" ? (cache as AchievementProgressCache) : undefined;
};

const achievementsService = (): AchievementsService => {
  try {
    return (steamInternals().SteamClient?.Apps ?? {}) as AchievementsService;
  } catch {
    return {};
  }
};

/** Counts Steam shows: owned achievements only, unlike the raw RPC list. */
const totalsFor = (appId: number): AchievementTotals | null => {
  if (!Number.isSafeInteger(appId) || appId <= 0) return null;
  try {
    const cache = progressCache();
    if (!cache) return null;
    if (typeof cache.BGameHasAchievements === "function" && cache.BGameHasAchievements(appId) === false) return null;
    const entry = cache.m_achievementProgress?.mapCache?.get?.(appId);
    if (!entry || typeof entry !== "object" || !("unlocked" in entry) || !("total" in entry)) return null;
    const unlocked = Number(entry.unlocked);
    const total = Number(entry.total);
    if (!Number.isFinite(unlocked) || !Number.isFinite(total) || total <= 0) return null;
    const reported = "percentage" in entry ? Number(entry.percentage) : NaN;
    const percentage = Number.isFinite(reported) ? reported : (unlocked / total) * 100;
    return { unlocked, total, percentage: Math.min(100, Math.max(0, percentage)) };
  } catch {
    return null;
  }
};

const appIdFromProps = (props: unknown): number => {
  if (!props || typeof props !== "object") return 0;
  const overview = Reflect.get(props, "overview");
  const details = Reflect.get(props, "details");
  const fromOverview = Number(overview && typeof overview === "object" ? Reflect.get(overview, "appid") : NaN);
  const fromDetails = Number(details && typeof details === "object" ? Reflect.get(details, "unAppID") : NaN);
  const appId = Number.isSafeInteger(fromOverview) && fromOverview > 0 ? fromOverview : fromDetails;
  return Number.isSafeInteger(appId) && appId > 0 ? appId : 0;
};

/** The game a mounted stats section belongs to, from the fiber that rendered it. */
const appIdFromSection = (section: unknown): number => {
  if (!section || typeof section !== "object") return 0;
  const key = Object.keys(section).find(
    (name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"),
  );
  let fiber = key ? Reflect.get(section, key) : undefined;
  for (let depth = 0; fiber && typeof fiber === "object" && depth < MAX_FIBER_DEPTH; depth += 1) {
    const appId = appIdFromProps(Reflect.get(fiber, "memoizedProps"));
    if (appId > 0) return appId;
    fiber = Reflect.get(fiber, "return");
  }
  return 0;
};

const statsSection = () => {
  const sectionClass = statsClasses().GameStatsSection;
  if (!sectionClass) return undefined;
  return findSteamUiDocumentMatch((document) => document.querySelector(`.${sectionClass}`) ?? undefined);
};

const buildRow = (document: Document): RowParts => {
  const classes = statsClasses();
  const row = document.createElement("div");
  row.className = [ROW_CLASS, classes.GameStat].filter(Boolean).join(" ");
  const icon = document.createElement("div");
  icon.className = classes.GameStatIcon ?? "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.style.cssText = "display:block;width:16px;height:16px";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", TROPHY_PATH);
  svg.append(path);
  icon.append(svg);
  const right = document.createElement("div");
  right.className = classes.GameStatRight ?? "";
  const label = document.createElement("div");
  label.className = classes.PlayBarLabel ?? "";
  label.textContent = LABEL;
  const progressRow = document.createElement("div");
  progressRow.className = classes.AchievementProgressRow ?? "";
  const count = document.createElement("div");
  count.className = [classes.PlayBarDetailLabel, classes.AchievementCountLabel].filter(Boolean).join(" ");
  const bar = document.createElement("div");
  bar.style.cssText = "height:2px;margin-top:3px;border-radius:1px;overflow:hidden;background:rgba(255,255,255,.2)";
  const fill = document.createElement("div");
  fill.style.cssText = "height:100%;width:0;background:#67c1f5";
  bar.append(fill);
  progressRow.append(count, bar);
  right.append(label, progressRow);
  row.append(icon, right);
  return { row, count, fill };
};

/** Install the achievement stat row and return its disposer. */
export function installMiniAchievementsPatch(): () => void {
  const unpatchers: Array<() => void> = [];
  const attemptedAppIds = new Set<number>();
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let parts: RowParts | undefined;
  let rowAppId = 0;
  let observer: MutationObserver | undefined;
  let observedSection: unknown;
  let captureTimer: ReturnType<typeof setTimeout> | undefined;
  let captureAttempt = 0;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;

  const removeRow = (): void => {
    try {
      parts?.row.remove();
    } catch {
      // The row's document may already be gone.
    }
    parts = undefined;
    rowAppId = 0;
  };

  const setTimer = (callback: () => void, delay: number): void => {
    const timer = setTimeout(() => {
      retryTimers.delete(timer);
      callback();
    }, delay);
    retryTimers.add(timer);
  };

  /** Ask Steam to fill a cold cache entry; the row re-reads while it stays empty. */
  const queueCacheUpdate = (appId: number): void => {
    if (attemptedAppIds.has(appId)) return;
    const cache = progressCache();
    const queueUpdate = cache?.QueueCacheUpdate;
    if (!cache || typeof queueUpdate !== "function") return;
    attemptedAppIds.add(appId);
    try {
      queueUpdate.call(cache, appId);
      for (const delay of CACHE_RETRY_DELAYS_MS) setTimer(sync, delay);
    } catch (error) {
      log.debug("miniAchievements", "achievement progress queue failed", appId, error);
    }
  };

  const observeSection = (section: unknown): void => {
    if (section === observedSection) return;
    observer?.disconnect();
    observedSection = section;
    if (!section || typeof section !== "object") return;
    const ownerDocument = Reflect.get(section, "ownerDocument");
    const view = ownerDocument && typeof ownerDocument === "object" ? Reflect.get(ownerDocument, "defaultView") : undefined;
    const Constructor = view ? Reflect.get(view, "MutationObserver") : undefined;
    if (typeof Constructor !== "function") return;
    const classes = statsClasses();
    const closest = Reflect.get(section, "closest");
    const playBar = classes.PlayBar && typeof closest === "function" ? closest.call(section, `.${classes.PlayBar}`) : null;
    const scope = playBar ?? Reflect.get(section, "parentElement") ?? section;
    observer = new Constructor(() => requestSync());
    try {
      // A subtree watch survives Steam replacing the stats section itself.
      (observer as MutationObserver).observe(scope as Node, { childList: true, subtree: true });
    } catch {
      observer = undefined;
    }
  };

  const sync = (): boolean => {
    if (disposed) return true;
    try {
      const section = statsSection();
      observeSection(section);
      if (!section || typeof section !== "object") return false;
      const classes = statsClasses();
      const playtime = classes.Playtime ? Reflect.get(section, "querySelector")?.call(section, `.${classes.Playtime}`) : null;
      if (!playtime || typeof playtime !== "object") return false;
      const appId = appIdFromSection(section);
      const overview = appId > 0 ? getNativeOverview(appId) : null;
      const totals = overview && !isNativeNonSteamShortcut(overview) ? totalsFor(appId) : null;
      if (!overview || !totals) {
        removeRow();
        if (overview && appId > 0) queueCacheUpdate(appId);
        return true;
      }
      const document = Reflect.get(playtime, "ownerDocument");
      if (!document || typeof document !== "object") return false;
      // Steam's own bar is still present on clients that have not updated yet.
      const nativeBar = classes.MiniAchievements
        ? Reflect.get(section, "querySelector")?.call(section, `.${classes.MiniAchievements}`)
        : null;
      if (nativeBar) {
        removeRow();
        return true;
      }
      const current = Reflect.get(section, "querySelector")?.call(section, `.${ROW_CLASS}`);
      if (!parts || current !== parts.row || rowAppId !== appId) {
        removeRow();
        parts = buildRow(document as Document);
        rowAppId = appId;
        parts.row.addEventListener("click", () => {
          Navigation.Navigate(`/library/app/${appId}/achievements/my/individual`);
        });
        const after = Reflect.get(playtime, "after");
        if (typeof after === "function") after.call(playtime, parts.row);
        else Reflect.get(playtime, "parentNode")?.append?.(parts.row);
      }
      const countText = `${totals.unlocked} / ${totals.total}`;
      const width = `${Math.round(totals.percentage)}%`;
      if (parts.count.textContent !== countText) parts.count.textContent = countText;
      if (parts.fill.style.width !== width) parts.fill.style.width = width;
      return true;
    } catch (error) {
      log.warn("miniAchievements", "achievement stat sync failed", error);
      return true;
    }
  };

  const scheduleSync = (): void => {
    if (disposed || captureTimer !== undefined) return;
    const delay = CAPTURE_RETRY_DELAYS_MS[captureAttempt];
    if (delay === undefined) return;
    captureTimer = setTimeout(() => {
      captureTimer = undefined;
      if (sync() || disposed) return;
      captureAttempt += 1;
      scheduleSync();
    }, delay);
  };

  /** A route render replaces the page, so its retry burst starts over at once. */
  const requestSync = (): void => {
    if (disposed) return;
    captureAttempt = 0;
    if (captureTimer !== undefined) {
      clearTimeout(captureTimer);
      captureTimer = undefined;
    }
    scheduleSync();
  };

  const onAchievementsChanged = (appId?: unknown): void => {
    const changed = Number(appId);
    if (Number.isSafeInteger(changed) && changed > 0) attemptedAppIds.delete(changed);
    else attemptedAppIds.clear();
    requestSync();
  };

  try {
    const service = achievementsService();
    const register = service.RegisterForAchievementChanges;
    const cleanup = typeof register === "function" ? register.call(service, onAchievementsChanged) : undefined;
    if (typeof cleanup === "function") unsubscribe = cleanup as () => void;
  } catch (error) {
    log.warn("miniAchievements", "achievement change subscription failed", error);
  }

  requestSync();

  for (const route of GAME_DETAIL_ROUTES) {
    try {
      const patch = routerHook.addPatch(route, (tree) => {
        try {
          const routeProps = findInReactTree(tree, (node) => node?.renderFunc);
          if (typeof routeProps?.renderFunc === "function") {
            const renderPatch = afterPatch(routeProps, "renderFunc", (_args: unknown[], rendered: unknown) => {
              requestSync();
              return rendered;
            });
            unpatchers.push(() => renderPatch.unpatch());
          }
        } catch (error) {
          log.warn("miniAchievements", "achievement stat patch failed", error);
        }
        return tree;
      });
      unpatchers.push(() => routerHook.removePatch(route, patch));
    } catch (error) {
      log.warn("miniAchievements", "achievement stat route hook failed", error);
    }
  }

  return () => {
    disposed = true;
    removeRow();
    observer?.disconnect();
    observer = undefined;
    observedSection = undefined;
    if (captureTimer !== undefined) {
      clearTimeout(captureTimer);
      captureTimer = undefined;
    }
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    attemptedAppIds.clear();
    if (unsubscribe) {
      const release = unsubscribe;
      unsubscribe = undefined;
      try {
        release();
      } catch (error) {
        log.warn("miniAchievements", "achievement change unsubscription failed", error);
      }
    }
    for (const unpatch of unpatchers.splice(0)) {
      try {
        unpatch();
      } catch {
        // Steam may already have released the route.
      }
    }
  };
}
