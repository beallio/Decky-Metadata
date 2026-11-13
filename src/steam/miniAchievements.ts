// Shows Steam's own mini achievement stat beside Play Time. The Gaming Mode game
// page passes no onSeek, and Valve's MiniAchievements row renders nothing without
// it (ValveSoftware/steam-for-linux#13540), so one is supplied here. See NOTICE.
import { routerHook } from "@decky/api";
import { afterPatch, findClassModule, findInReactTree } from "@decky/ui";
import * as log from "../log";
import { GAME_DETAIL_ROUTES } from "./core";
import { steamUiDocuments } from "./steamUiHost";

const CAPTURE_RETRY_DELAYS_MS = [0, 50, 250, 1000] as const;
const MAX_FIBER_DEPTH = 12;

type StatsInstance = {
  props?: unknown;
  forceUpdate?: () => void;
  BUserHasContentToClaim?: unknown;
};

type PatchedStats = { instance: WeakRef<StatsInstance>; raw: () => unknown };

// Valve's row only checks this for truthiness and opens My Achievements itself.
const NOOP_SEEK = (): void => {};

// The play bar's CSS module. It is looked up on use: the module may not be
// registered when the plugin loads.
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

// Repeated reads must return the same object so prop comparisons stay stable.
const seekProps = new WeakMap<object, object>();

// Shortcuts get the callback too: Valve's row hides itself when Steam has no
// achievements for the app, and a plugin such as Emuchievements can supply them.
const withSeek = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object") return raw;
  if (Reflect.get(raw, "onSeek")) return raw;
  const cached = seekProps.get(raw);
  if (cached) return cached;
  const injected = { ...(raw as Record<string, unknown>), onSeek: NOOP_SEEK };
  seekProps.set(raw, injected);
  return injected;
};

/** The mounted stats component that owns a rendered section, from its fiber. */
const ownerInstance = (section: unknown): StatsInstance | undefined => {
  if (!section || typeof section !== "object") return undefined;
  const key = Object.keys(section).find(
    (name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"),
  );
  let fiber: unknown = key ? Reflect.get(section, key) : undefined;
  for (let depth = 0; fiber && typeof fiber === "object" && depth < MAX_FIBER_DEPTH; depth += 1) {
    const stateNode: unknown = Reflect.get(fiber, "stateNode");
    if (
      stateNode &&
      typeof stateNode === "object" &&
      typeof Reflect.get(stateNode, "BUserHasContentToClaim") === "function" &&
      typeof Reflect.get(stateNode, "forceUpdate") === "function"
    ) {
      return stateNode as StatsInstance;
    }
    fiber = Reflect.get(fiber, "return");
  }
  return undefined;
};

const rerender = (instance: StatsInstance): void => {
  try {
    instance.forceUpdate?.();
  } catch (error) {
    log.debug("miniAchievements", "achievement stat rerender failed", error);
  }
};

/** Install the onSeek supply and return its disposer. */
export function installMiniAchievementsPatch(): () => void {
  const unpatchers: Array<() => void> = [];
  const patched = new WeakSet<StatsInstance>();
  const patchedStats = new Set<PatchedStats>();
  let observer: MutationObserver | undefined;
  let observedSection: unknown;
  let captureTimer: ReturnType<typeof setTimeout> | undefined;
  let captureAttempt = 0;
  let disposed = false;

  const patchInstance = (instance: StatsInstance): void => {
    if (patched.has(instance)) return;
    // React owns this property; if it is not reassignable the accessor cannot survive.
    const descriptor = Object.getOwnPropertyDescriptor(instance, "props");
    if (!descriptor || !("value" in descriptor) || !descriptor.configurable) {
      log.debug("miniAchievements", "achievement stat props are not patchable");
      return;
    }
    let raw = descriptor.value;
    try {
      Object.defineProperty(instance, "props", {
        configurable: true,
        enumerable: true,
        get: () => withSeek(raw),
        set: (value: unknown) => {
          raw = value;
        },
      });
    } catch (error) {
      log.debug("miniAchievements", "achievement stat props patch failed", error);
      return;
    }
    patched.add(instance);
    patchedStats.add({ instance: new WeakRef(instance), raw: () => raw });
    rerender(instance);
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
      const sectionClass = statsClasses().GameStatsSection;
      if (!sectionClass) return false;
      let found = false;
      let firstSection: unknown = undefined;
      for (const uiDocument of steamUiDocuments()) {
        let sections: ArrayLike<unknown>;
        try {
          sections = uiDocument.querySelectorAll(`.${sectionClass}`);
        } catch {
          continue;
        }
        const list = Array.from(sections);
        if (firstSection === undefined) firstSection = list[0];
        for (const section of list) {
          const instance = ownerInstance(section);
          if (!instance) continue;
          found = true;
          patchInstance(instance);
        }
      }
      observeSection(firstSection);
      for (const entry of patchedStats) if (!entry.instance.deref()) patchedStats.delete(entry);
      return found;
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
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    observer = undefined;
    observedSection = undefined;
    if (captureTimer !== undefined) {
      clearTimeout(captureTimer);
      captureTimer = undefined;
    }
    for (const entry of patchedStats) {
      const instance = entry.instance.deref();
      if (!instance) continue;
      try {
        // Hand the latest real props back so Valve's row hides without a reload.
        Object.defineProperty(instance, "props", {
          value: entry.raw(),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch (error) {
        log.debug("miniAchievements", "achievement stat props restore failed", error);
      }
      rerender(instance);
    }
    patchedStats.clear();
    for (const unpatch of unpatchers.splice(0)) {
      try {
        unpatch();
      } catch {
        // Steam may already have released the route.
      }
    }
  };
}
