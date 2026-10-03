// Native restoration adapted from Decky UI Restored (GPL-3.0-or-later).
// See NOTICE for source attribution.
import { routerHook } from "@decky/api";
import { afterPatch } from "@decky/ui";
import * as log from "../log";

const APP_ROUTE = "/library/app/:appid";
const MAX_ANCESTOR_DEPTH = 2_000;
const MAX_FIBER_NODES = 300_000;
const MAX_FIBER_ANCHORS = 2_000;
const INSTANCE_PATCH_FLAG = "__deckyMetadataMiniAchievementsRestore";
const CAPTURE_RETRY_DELAYS_MS = [0, 50, 250, 1_000] as const;

type SteamObject = Record<string, unknown>;
type SeekHandler = (section: string) => void;
type SeekFunction = (this: SteamObject, section: string) => void;
type PrototypePatch = { unpatch: () => void };
type MiniAchievementsClass = Function & { prototype: SteamObject };
type MiniAchievementsCapture = {
  MiniClass: MiniAchievementsClass | undefined;
  instances: SteamObject[];
};
type AfterPatch = (
  target: object,
  method: string,
  handler: (this: unknown, args: unknown[], result: unknown) => unknown,
) => PrototypePatch;
// Decky's declaration is broader than the native afterPatch callback used here.
const patchAfter = afterPatch as unknown as AfterPatch;

interface WindowWithPopupManager extends Window {
  g_PopupManager?: unknown;
}

function isSteamObject(value: unknown): value is SteamObject {
  return typeof value === "object" && value !== null;
}

function safeDebug(message: string, ...args: unknown[]): void {
  try {
    log.debug("miniAchievements", message, ...args);
  } catch {
    // Logging must never escape into Steam's render path.
  }
}

function safeInfo(message: string, ...args: unknown[]): void {
  try {
    log.info("miniAchievements", message, ...args);
  } catch {
    // Logging must never make installation or cleanup fail.
  }
}

function safeWarn(message: string, ...args: unknown[]): void {
  try {
    log.warn("miniAchievements", message, ...args);
  } catch {
    // Logging must never escape into Steam's render path.
  }
}

function hasMiniAchievementsSignature(type: unknown): type is MiniAchievementsClass {
  if (typeof type !== "function") return false;

  try {
    const prototype = type.prototype;
    if (!isSteamObject(prototype)) return false;
    const source = type.toString();
    return (
      source.includes('onSeek("achievements")') ||
      source.includes("onSeek('achievements')")
    );
  } catch {
    return false;
  }
}

function withAchievementSeek(props: unknown, handler: SeekHandler): unknown {
  if (!isSteamObject(props)) return props;

  try {
    if (props.onSeek != null) return props;
    return { ...props, onSeek: handler };
  } catch {
    return props;
  }
}

function findAncestorStateNode(
  fiber: unknown,
  predicate: (stateNode: SteamObject) => boolean,
): SteamObject | undefined {
  try {
    let current = isSteamObject(fiber) ? fiber : undefined;
    for (let depth = 0; current && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
      const stateNode = current.stateNode;
      if (isSteamObject(stateNode) && predicate(stateNode)) return stateNode;
      current = isSteamObject(current.return) ? current.return : undefined;
    }
  } catch {
    // Fibers are Steam internals and may change while the tree is inspected.
  }

  return undefined;
}

function resolveSeekController(instance: SteamObject): SteamObject | undefined {
  try {
    const fiber = instance._reactInternals ?? instance._reactInternalFiber;
    return findAncestorStateNode(
      fiber,
      (stateNode) => typeof stateNode.SeekToSection === "function",
    );
  } catch {
    return undefined;
  }
}

function getFiberFromElement(element: unknown): SteamObject | undefined {
  if (!isSteamObject(element)) return undefined;

  try {
    const key = Object.keys(element).find(
      (candidate) =>
        candidate.startsWith("__reactFiber$") ||
        candidate.startsWith("__reactContainer$"),
    );
    const fiber = key ? element[key] : undefined;
    return isSteamObject(fiber) ? fiber : undefined;
  } catch {
    return undefined;
  }
}

function getFiberFromDocument(document: unknown): SteamObject | undefined {
  if (!isSteamObject(document)) return undefined;

  try {
    const bodyFiber = getFiberFromElement(document.body);
    if (bodyFiber) return bodyFiber;

    const querySelectorAll = document.querySelectorAll;
    if (typeof querySelectorAll !== "function") return undefined;
    const elements = querySelectorAll.call(
      document,
      "*",
    ) as ArrayLike<unknown>;
    const inspectedLimit = Math.min(elements.length, MAX_FIBER_ANCHORS);
    for (let inspected = 0; inspected < inspectedLimit; inspected += 1) {
      const fiber = getFiberFromElement(elements[inspected]);
      if (fiber) return fiber;
    }
  } catch {
    // Popup documents can disappear during navigation.
  }

  return undefined;
}

function popupValues(collection: unknown): unknown[] {
  try {
    if (Array.isArray(collection)) return collection;
    if (!isSteamObject(collection)) return [];

    const values = collection.values;
    if (typeof values === "function") {
      return Array.from(values.call(collection) as Iterable<unknown>);
    }

    let iterator: unknown;
    if (Symbol.iterator in collection) iterator = collection[Symbol.iterator];
    if (typeof iterator === "function") {
      return Array.from(collection as unknown as Iterable<unknown>);
    }
  } catch {
    // Treat malformed popup collections as empty.
  }

  return [];
}

function isBigPicturePopup(popup: unknown, document: unknown): boolean {
  try {
    const popupObject = isSteamObject(popup) ? popup : undefined;
    const popupData = isSteamObject(popupObject?.m_popup)
      ? popupObject.m_popup
      : undefined;
    const documentObject = isSteamObject(document) ? document : undefined;
    const titles = [
      popupObject?.m_strTitle,
      popupObject?.title,
      popupData?.name,
      documentObject?.title,
    ];
    return titles.some((title) => title === "Steam Big Picture Mode");
  } catch {
    return false;
  }
}

function getBigPictureDocument(popupManager: unknown): unknown {
  try {
    if (!isSteamObject(popupManager)) return undefined;
    const getPopups = popupManager.GetPopups;
    const collection =
      popupManager.m_rgPopups ??
      (typeof getPopups === "function" ? getPopups.call(popupManager) : undefined);
    const candidates: Array<{ document: unknown; isBigPicture: boolean }> = [];

    for (const popup of popupValues(collection)) {
      try {
        const popupObject = isSteamObject(popup) ? popup : undefined;
        const popupData = isSteamObject(popupObject?.m_popup)
          ? popupObject.m_popup
          : undefined;
        const document = popupData?.document;
        if (!document || !getFiberFromDocument(document)) continue;
        candidates.push({
          document,
          isBigPicture: isBigPicturePopup(popup, document),
        });
      } catch {
        // Skip individual popups that are closing or malformed.
      }
    }

    return (
      candidates.find((candidate) => candidate.isBigPicture)?.document ??
      candidates[0]?.document
    );
  } catch {
    return undefined;
  }
}

function captureMiniAchievements(popupManager: unknown): MiniAchievementsCapture {
  try {
    const document = getBigPictureDocument(popupManager);
    let rootFiber = getFiberFromDocument(document);
    if (!rootFiber) return { MiniClass: undefined, instances: [] };

    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth += 1) {
      const parent = rootFiber.return;
      if (!isSteamObject(parent)) break;
      rootFiber = parent;
    }

    const stack = [rootFiber];
    const instances: SteamObject[] = [];
    const seenInstances = new Set<SteamObject>();
    let MiniClass: MiniAchievementsClass | undefined;
    let visited = 0;

    while (stack.length > 0 && visited < MAX_FIBER_NODES) {
      const fiber = stack.pop();
      if (!fiber) continue;
      visited += 1;

      const type = fiber.elementType || fiber.type;
      if (hasMiniAchievementsSignature(type)) {
        MiniClass ??= type;
        const instance = fiber.stateNode;
        if (isSteamObject(instance) && !seenInstances.has(instance)) {
          seenInstances.add(instance);
          instances.push(instance);
        }
      }

      // Push sibling first so the child is visited first.
      if (isSteamObject(fiber.sibling)) stack.push(fiber.sibling);
      if (isSteamObject(fiber.child)) stack.push(fiber.child);
    }

    return { MiniClass, instances };
  } catch {
    return { MiniClass: undefined, instances: [] };
  }
}

/** Install the native mini-achievements restoration and return its disposer. */
export function installMiniAchievementsPatch(): () => void {
  safeInfo("installing mini-achievements patch");

  let routePatch: Parameters<typeof routerHook.removePatch>[1] | undefined;
  let routePatchRegistered = false;
  let routeRenderOwner: SteamObject | undefined;
  let routeRenderPatch: PrototypePatch | undefined;
  let prototypePatch: PrototypePatch | undefined;
  let captureBurstActive = false;
  let captureAttemptIndex = 0;
  let captureTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const restoredInstances = new Map<SteamObject, () => void>();
  const refreshTimers = new Map<SteamObject, ReturnType<typeof setTimeout>>();

  const finishCaptureBurst = (): void => {
    captureTimer = undefined;
    captureBurstActive = false;
    captureAttemptIndex = 0;
  };

  const cancelCaptureBurst = (): void => {
    if (captureTimer !== undefined) {
      try {
        clearTimeout(captureTimer);
      } catch (error) {
        safeWarn("capture timer cleanup failed", error);
      }
    }
    finishCaptureBurst();
  };

  const cancelRefreshTimers = (): void => {
    for (const timer of refreshTimers.values()) {
      try {
        clearTimeout(timer);
      } catch (error) {
        safeWarn("instance refresh timer cleanup failed", error);
      }
    }
    refreshTimers.clear();
  };

  const scheduleRefresh = (instance: SteamObject): void => {
    try {
      if (refreshTimers.has(instance)) return;
      let timer: ReturnType<typeof setTimeout>;
      timer = setTimeout(() => {
        if (refreshTimers.get(instance) === timer) refreshTimers.delete(instance);
        try {
          const forceUpdate = instance.forceUpdate;
          if (typeof forceUpdate === "function") forceUpdate.call(instance);
        } catch {
          // A detached instance is harmless; never throw into Steam.
        }
      }, 0);
      refreshTimers.set(instance, timer);
    } catch {
      // Refreshing is best-effort; never fail the native render path.
    }
  };

  const restoreInstance = (instance: SteamObject): (() => void) | undefined => {
    try {
      const existing = instance[INSTANCE_PATCH_FLAG];
      if (typeof existing === "function") return existing as () => void;
      if (existing != null) return undefined;

      const originalDescriptor = Object.getOwnPropertyDescriptor(instance, "props");
      let rawProps = instance.props;
      const onSeek: SeekHandler = (section) => {
        try {
          const controller = resolveSeekController(instance);
          const seek = controller?.SeekToSection;
          if (typeof seek === "function") {
            (seek as SeekFunction).call(controller, section);
          }
        } catch {
          // Native currently has no achievements target; activation no-ops.
        }
      };
      let wrappedProps = withAchievementSeek(rawProps, onSeek);
      let cleaned = false;

      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;

        try {
          if (originalDescriptor && "value" in originalDescriptor) {
            Object.defineProperty(instance, "props", {
              ...originalDescriptor,
              value: rawProps,
            });
          } else if (originalDescriptor) {
            Object.defineProperty(instance, "props", originalDescriptor);
            originalDescriptor.set?.call(instance, rawProps);
          } else {
            delete instance.props;
            let prototype = Object.getPrototypeOf(instance);
            let inheritedDescriptor: PropertyDescriptor | undefined;
            while (prototype) {
              inheritedDescriptor = Object.getOwnPropertyDescriptor(
                prototype,
                "props",
              );
              if (inheritedDescriptor) break;
              prototype = Object.getPrototypeOf(prototype);
            }

            if (inheritedDescriptor?.set) {
              inheritedDescriptor.set.call(instance, rawProps);
            } else if (
              inheritedDescriptor &&
              "value" in inheritedDescriptor &&
              inheritedDescriptor.writable
            ) {
              instance.props = rawProps;
            } else if (rawProps !== undefined) {
              Object.defineProperty(instance, "props", {
                configurable: true,
                enumerable: true,
                writable: true,
                value: rawProps,
              });
            }
          }
        } catch (error) {
          safeWarn("instance props restoration failed", error);
        }

        try {
          if (instance[INSTANCE_PATCH_FLAG] === cleanup) {
            delete instance[INSTANCE_PATCH_FLAG];
          }
        } catch (error) {
          safeWarn("instance ownership marker cleanup failed", error);
        }

        scheduleRefresh(instance);
      };

      Object.defineProperty(instance, INSTANCE_PATCH_FLAG, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: cleanup,
      });
      try {
        Object.defineProperty(instance, "props", {
          configurable: true,
          enumerable: originalDescriptor?.enumerable ?? false,
          get: () => wrappedProps,
          set: (value: unknown) => {
            rawProps = value;
            wrappedProps = withAchievementSeek(rawProps, onSeek);
          },
        });
      } catch (error) {
        try {
          delete instance[INSTANCE_PATCH_FLAG];
        } catch {
          // Preserve the original props-definition failure.
        }
        throw error;
      }

      scheduleRefresh(instance);
      return cleanup;
    } catch {
      // A malformed or detached instance must never break the Steam UI.
      return undefined;
    }
  };

  const registerRestoredInstance = (instance: SteamObject): void => {
    const cleanup = restoreInstance(instance);
    if (cleanup) restoredInstances.set(instance, cleanup);
  };

  const disposeRouteRenderPatch = (): boolean => {
    if (!routeRenderPatch) {
      routeRenderOwner = undefined;
      return true;
    }

    try {
      routeRenderPatch.unpatch();
      routeRenderPatch = undefined;
      routeRenderOwner = undefined;
      return true;
    } catch (error) {
      safeWarn("route render trigger unpatch failed", error);
      return false;
    }
  };

  let scheduleNextCaptureAttempt: () => void;

  const attemptCaptureAndPatch = (): void => {
    try {
      if (disposed || prototypePatch) {
        finishCaptureBurst();
        return;
      }

      let popupManager: unknown;
      if (typeof window !== "undefined") {
        const browserWindow = window as WindowWithPopupManager;
        popupManager = browserWindow.g_PopupManager;
      }
      const { MiniClass, instances } = captureMiniAchievements(popupManager);
      if (!MiniClass) {
        safeDebug("MiniAchievements is not mounted; capture will retry if scheduled");
        scheduleNextCaptureAttempt();
        return;
      }

      if (typeof MiniClass.prototype.render !== "function") {
        finishCaptureBurst();
        return;
      }

      const patch = patchAfter(
        MiniClass.prototype,
        "render",
        function (this: unknown, _args: unknown[], result: unknown): unknown {
          if (!disposed && isSteamObject(this)) registerRestoredInstance(this);
          return result;
        },
      );
      if (!patch || typeof patch.unpatch !== "function") {
        finishCaptureBurst();
        return;
      }

      prototypePatch = patch;
      for (const instance of instances) registerRestoredInstance(instance);
      finishCaptureBurst();
      safeInfo(
        "native MiniAchievements class captured and patched",
        `${instances.length} mounted instance(s) refreshed`,
      );
    } catch (error) {
      finishCaptureBurst();
      safeWarn("MiniAchievements capture failed", error);
    }
  };

  scheduleNextCaptureAttempt = (): void => {
    try {
      if (disposed || prototypePatch) {
        finishCaptureBurst();
        return;
      }

      const delay = CAPTURE_RETRY_DELAYS_MS[captureAttemptIndex];
      if (delay === undefined) {
        finishCaptureBurst();
        return;
      }

      captureAttemptIndex += 1;
      captureTimer = setTimeout(() => {
        captureTimer = undefined;
        attemptCaptureAndPatch();
      }, delay);
    } catch (error) {
      finishCaptureBurst();
      safeWarn("MiniAchievements capture scheduling failed", error);
    }
  };

  const scheduleCaptureBurst = (): void => {
    try {
      if (disposed || prototypePatch || captureBurstActive) return;
      captureBurstActive = true;
      captureAttemptIndex = 0;
      scheduleNextCaptureAttempt();
    } catch (error) {
      finishCaptureBurst();
      safeWarn("MiniAchievements capture burst failed", error);
    }
  };

  try {
    routePatch = routerHook.addPatch(APP_ROUTE, (props: unknown) => {
      try {
        const children = isSteamObject(props) ? props.children : undefined;
        const ownerCandidate = isSteamObject(children) ? children.props : undefined;
        const owner = isSteamObject(ownerCandidate) ? ownerCandidate : undefined;

        if (owner !== routeRenderOwner && !disposeRouteRenderPatch()) {
          return props;
        }

        if (typeof owner?.renderFunc !== "function") {
          safeDebug("app-details route renderFunc is unavailable");
          return props;
        }

        if (!routeRenderPatch) {
          routeRenderPatch = patchAfter(
            owner,
            "renderFunc",
            (_args: unknown[], renderedTree: unknown): unknown => {
              scheduleCaptureBurst();
              return renderedTree;
            },
          );
          routeRenderOwner = owner;
        }

        // Cover enabling while an app-details page is already committed.
        scheduleCaptureBurst();
      } catch (error) {
        safeWarn("app-details capture trigger installation failed", error);
      }

      return props;
    });
    routePatchRegistered = true;
  } catch (error) {
    safeWarn("app-details route hook registration failed", error);
  }

  return () => {
    if (disposed) return;
    disposed = true;
    cancelCaptureBurst();
    cancelRefreshTimers();

    if (!disposeRouteRenderPatch()) {
      safeWarn("route render trigger could not be fully removed");
    }

    if (routePatchRegistered) {
      try {
        routerHook.removePatch(APP_ROUTE, routePatch);
      } catch (error) {
        safeWarn("app-details route hook removal failed", error);
      }
      routePatchRegistered = false;
    }

    if (prototypePatch) {
      const patch = prototypePatch;
      prototypePatch = undefined;
      try {
        patch.unpatch();
      } catch (error) {
        safeWarn("MiniAchievements render patch removal failed", error);
      }
    }

    for (const cleanup of restoredInstances.values()) {
      try {
        cleanup();
      } catch (error) {
        safeWarn("instance props cleanup failed", error);
      }
    }
    restoredInstances.clear();

    safeInfo("mini-achievements patch removed");
  };
}
