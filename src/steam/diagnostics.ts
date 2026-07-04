import { Navigation } from "@decky/ui";
import { frontendLog } from "../backend";
import {
  Unpatch,
  historyPathFromArgs,
  historyStateFromArgs,
  patchMethod,
  rewriteSteamwebNavState,
  steamAppIdForApp,
  steamLinkTarget,
} from "./core";

const NAVIGATION_TRACE_NOISE_PATTERN = /cached|registerfor|getlaunch|getgameaction|appdetails|appdata|appoverview|appachievement/i;
const NAVIGATION_TRACE_METHOD_PATTERN = /store|community|hub|forum|discuss|guide|workshop|market|navigate|openurl|executesteamurl|browser|web|overlay|showstore|link/i;
const NAVIGATION_TRACE_CLICK_PATTERN = /store|community|hub|discuss|guide|market|support/i;

const truncateTraceValue = (value: string, limit = 80): string => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 3))}...` : normalized;
};

const safeStringifyTrace = (value: any, max = 500): string => {
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (_key, item) => {
      if (typeof item === "function") return "[fn]";
      if (typeof item === "bigint") return String(item);
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
    return truncateTraceValue(serialized === undefined ? String(value) : serialized, max);
  } catch (_error) {
    try {
      return truncateTraceValue(String(value), max);
    } catch (_innerError) {
      return "[unserializable]";
    }
  }
};

const navigationTraceArg = (value: any): number | string => {
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return truncateTraceValue(value);
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "function") return "Function";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return "Symbol";
  return value?.constructor?.name || "Object";
};

const shouldTraceNavigationCall = (methodName: string, args: any[]): boolean => {
  if (NAVIGATION_TRACE_NOISE_PATTERN.test(methodName)) return false;
  if (NAVIGATION_TRACE_METHOD_PATTERN.test(methodName)) return true;
  return args.some((arg) => typeof arg === "number" && steamAppIdForApp(arg) > 0);
};

export const installClickTrace = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__deckyClickTrace) {
    unpatchers.push(() => undefined);
    return;
  }
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
    unpatchers.push(() => undefined);
    return;
  }

  globalState.__deckyClickTrace = { installed: true };

  const isActionableTraceElement = (element: Element): boolean => {
    const tag = element.tagName.toLowerCase();
    return (
      tag === "button" ||
      tag === "a" ||
      element.getAttribute("role") === "button" ||
      element.hasAttribute("onclick") ||
      element.hasAttribute("href")
    );
  };

  const actionableElement = (target: EventTarget | null): Element | null => {
    let current = target instanceof Element ? target : null;
    for (let depth = 0; current && depth < 6; depth += 1) {
      if (isActionableTraceElement(current)) return current;
      current = current.parentElement;
    }
    return null;
  };

  const dataAttributes = (element: Element): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(element.attributes || [])) {
      if (attr.name.startsWith("data-")) {
        attrs[attr.name] = truncateTraceValue(attr.value, 60);
      }
    }
    return attrs;
  };

  const handler = (event: MouseEvent) => {
    try {
      const element = actionableElement(event.target);
      if (!element) return;

      const text = truncateTraceValue(element.textContent || "", 60);
      const ariaLabel = truncateTraceValue(element.getAttribute("aria-label") || "", 60);
      if (!NAVIGATION_TRACE_CLICK_PATTERN.test(`${text} ${ariaLabel}`)) return;

      const href =
        element instanceof HTMLAnchorElement
          ? element.href
          : element.getAttribute("href") || undefined;
      const descriptor = {
        tag: element.tagName.toLowerCase(),
        text,
        href: href ? truncateTraceValue(href, 120) : undefined,
        role: element.getAttribute("role") || undefined,
        "aria-label": ariaLabel || undefined,
        data: dataAttributes(element),
      };
      void frontendLog("trace", "click", descriptor).catch(() => undefined);
    } catch (_error) {
      // Passive diagnostics must never affect click behavior.
    }
  };

  try {
    document.addEventListener("click", handler, true);
  } catch (_error) {
    delete globalState.__deckyClickTrace;
    unpatchers.push(() => undefined);
    return;
  }
  unpatchers.push(() => {
    try {
      document.removeEventListener("click", handler, true);
    } catch (_error) {
      // Best effort teardown.
    }
    delete globalState.__deckyClickTrace;
  });
};

export const installNavigationTrace = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__deckyNavTrace) {
    unpatchers.push(() => undefined);
    return;
  }

  const traceUnpatchers: Unpatch[] = [];
  const seenTargets = new Set<any>();
  globalState.__deckyNavTrace = { installed: true };

  const collectMethodNames = (obj: any): string[] => {
    const names = new Set<string>();
    let cur = obj;
    let depth = 0;

    while (cur && cur !== Object.prototype && depth < 6) {
      for (const name of Object.getOwnPropertyNames(cur)) {
        if (name === "constructor") continue;
        try {
          if (typeof obj[name] === "function") {
            names.add(name);
          }
        } catch (_error) {
          // Some Steam getters throw outside their expected runtime path.
        }
      }
      cur = Object.getPrototypeOf(cur);
      depth += 1;
    }

    return [...names];
  };

  const patchTraceTarget = (target: any, objLabel: string): number => {
    try {
      if (!target || seenTargets.has(target)) return 0;
      seenTargets.add(target);

      let wrapped = 0;
      for (const name of collectMethodNames(target)) {
        const original = target[name];
        if (typeof original !== "function") continue;

        const patched = function deckyNavigationTrace(this: any, ...args: any[]) {
          try {
            if (shouldTraceNavigationCall(name, args)) {
              void frontendLog("trace", `${objLabel}.${name}`, { args: args.map(navigationTraceArg) }).catch(() => undefined);
            }
          } catch (_error) {
            // Diagnostic tracing must never affect Steam navigation.
          }
          return original.apply(this, args);
        };

        try {
          target[name] = patched;
        } catch (_error) {
          continue;
        }
        wrapped += 1;

        traceUnpatchers.push(() => {
          try {
            if (target?.[name] === patched) {
              target[name] = original;
            }
          } catch (_error) {
            // Best effort teardown.
          }
        });
      }
      return wrapped;
    } catch (_error) {
      return 0;
    }
  };

  const counts: Record<string, number> = {
    "SteamClient.Apps": patchTraceTarget((window as any)?.SteamClient?.Apps, "SteamClient.Apps"),
    Navigation: patchTraceTarget(Navigation as any, "Navigation"),
    Router: 0,
    "SteamClient.URL": patchTraceTarget((window as any)?.SteamClient?.URL, "SteamClient.URL"),
    "SteamClient.System": patchTraceTarget((window as any)?.SteamClient?.System, "SteamClient.System"),
    "SteamClient.Overlay": patchTraceTarget((window as any)?.SteamClient?.Overlay, "SteamClient.Overlay"),
    MainWindowBrowserManager: patchTraceTarget((window as any)?.MainWindowBrowserManager, "MainWindowBrowserManager"),
  };
  counts.Router += patchTraceTarget((window as any)?.SteamClient?.Router, "SteamClient.Router");
  counts.Router += patchTraceTarget(globalState.Router, "Router");

  try {
    const history = window?.history;
    for (const methodName of ["pushState", "replaceState"] as const) {
      const original = history?.[methodName];
      if (typeof original !== "function") continue;
      const patched = function deckyHistoryTrace(this: History, ...args: Parameters<History[typeof methodName]>) {
        try {
          const url = String(args[2] ?? "");
          void frontendLog("trace", "history", {
            method: methodName,
            url: truncateTraceValue(url, 120),
          }).catch(() => undefined);
          if (url.toLowerCase().includes("steamweb")) {
            void frontendLog("trace", "history-state", {
              method: methodName,
              url: truncateTraceValue(url, 120),
              state: safeStringifyTrace(args[0]),
            }).catch(() => undefined);
            const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);
            if (rewrote) {
              void frontendLog("nav", "steamweb rewrite", { method: methodName }).catch(() => undefined);
              return original.apply(this, [newState, args[1], args[2]] as any);
            }
          }
        } catch (_error) {
          // Diagnostic tracing must never affect Steam navigation.
        }
        return original.apply(this, args);
      };
      history[methodName] = patched as History[typeof methodName];
      traceUnpatchers.push(() => {
        try {
          if (history?.[methodName] === patched) {
            history[methodName] = original;
          }
        } catch (_error) {
          // Best effort teardown.
        }
      });
    }
  } catch (_error) {
    // History tracing is diagnostic-only.
  }

  try {
    void frontendLog("trace", "nav trace installed", { counts }).catch(() => undefined);
  } catch (_error) {
    // Diagnostic tracing must never affect Steam navigation.
  }

  unpatchers.push(() => {
    traceUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__deckyNavTrace;
  });
};

type HistoryInstanceTraceTarget = {
  label: string;
  history: any;
};

const HISTORY_INSTANCE_TRACE_KEY_PATTERN = /window|instance|store|history|nav|main|browser|gamepad|overlay/i;

const safeTraceProperty = (obj: any, key: string): any => {
  try {
    return obj?.[key];
  } catch (_error) {
    return undefined;
  }
};

const safeTraceOwnPropertyNames = (obj: any): string[] => {
  try {
    return Object.getOwnPropertyNames(obj);
  } catch (_error) {
    return [];
  }
};

const isHistoryInstanceTraceTarget = (value: any): boolean => {
  try {
    if (!value || typeof value !== "object") return false;
    if (typeof value.push !== "function" || typeof value.replace !== "function") return false;
    const location = safeTraceProperty(value, "location");
    const entries = safeTraceProperty(value, "entries");
    const length = safeTraceProperty(value, "length");
    return (
      (!!location && typeof location === "object") ||
      Array.isArray(entries) ||
      typeof length === "number"
    );
  } catch (_error) {
    return false;
  }
};

const hasTraceableHistoryMethods = (value: any): boolean => {
  try {
    return !!value && typeof value.push === "function" && typeof value.replace === "function";
  } catch (_error) {
    return false;
  }
};

const collectHistoryInstanceTraceTargets = (): HistoryInstanceTraceTarget[] => {
  const globalState = globalThis as any;
  const windowState = typeof window !== "undefined" ? (window as any) : undefined;
  const roots: HistoryInstanceTraceTarget[] = [
    { label: "Router", history: safeTraceProperty(globalState, "Router") },
    { label: "Router.WindowStore", history: safeTraceProperty(safeTraceProperty(globalState, "Router"), "WindowStore") },
    { label: "SteamUIStore", history: safeTraceProperty(windowState, "SteamUIStore") },
    { label: "App", history: safeTraceProperty(windowState, "App") },
  ];
  const instances: HistoryInstanceTraceTarget[] = [];
  const seenNodes = new WeakSet<object>();
  let scannedNodes = 0;
  const maxDepth = 4;
  const maxNodes = 400;

  const recordInstance = (label: string, history: any, requireShape = true) => {
    if (!history || typeof history !== "object") return;
    if (requireShape ? !isHistoryInstanceTraceTarget(history) : !hasTraceableHistoryMethods(history)) return;
    instances.push({ label, history });
  };

  const queue = roots
    .filter(({ history }) => !!history && typeof history === "object")
    .map(({ label, history }) => ({ label, value: history, depth: 0 }));

  for (let index = 0; index < queue.length && scannedNodes < maxNodes; index += 1) {
    const { label, value, depth } = queue[index];
    if (!value || typeof value !== "object") continue;
    if (seenNodes.has(value)) continue;
    seenNodes.add(value);
    scannedNodes += 1;

    recordInstance(label, value);
    recordInstance(`${label}.m_history`, safeTraceProperty(value, "m_history"), false);

    if (depth >= maxDepth) continue;

    for (const key of safeTraceOwnPropertyNames(value)) {
      if (scannedNodes + queue.length >= maxNodes * 2) break;
      if (!HISTORY_INSTANCE_TRACE_KEY_PATTERN.test(key)) continue;
      const next = safeTraceProperty(value, key);
      if (!next || typeof next !== "object") continue;
      queue.push({ label: `${label}.${key}`, value: next, depth: depth + 1 });
    }
  }

  return instances;
};

export const installHistoryInstanceTrace = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__deckyHistoryInstanceTrace) {
    unpatchers.push(() => undefined);
    return;
  }

  const traceUnpatchers: Unpatch[] = [];
  const wrappedHistories = new WeakSet<object>();
  globalState.__deckyHistoryInstanceTrace = { installed: true };

  const instances = collectHistoryInstanceTraceTargets();
  try {
    void frontendLog("trace", "history instances", {
      labels: instances.map(({ label }) => label),
      count: instances.length,
    }).catch(() => undefined);
  } catch (_error) {
    // Passive diagnostics must never affect Steam navigation.
  }

  const shouldTraceHistoryInstanceCall = (path: string, state: any): boolean => {
    if (String(path || "").toLowerCase().includes("steamweb")) return true;
    const url = typeof state?.url === "string" ? state.url : "";
    return !!url && !!steamLinkTarget(url);
  };

  for (const { label, history } of instances) {
    try {
      if (!history || typeof history !== "object" || wrappedHistories.has(history)) continue;
      wrappedHistories.add(history);

      for (const methodName of ["push", "replace"] as const) {
        const original = history[methodName];
        if (typeof original !== "function") continue;

        const patched = function deckyHistoryInstanceTrace(this: any, ...args: any[]) {
          try {
            const path = historyPathFromArgs(args);
            const state = historyStateFromArgs(args);
            if (shouldTraceHistoryInstanceCall(path, state)) {
              void frontendLog("trace", "history call", {
                instance: label,
                method: methodName,
                path: truncateTraceValue(path, 120),
                url: typeof state?.url === "string" ? truncateTraceValue(state.url, 160) : "",
              }).catch(() => undefined);
            }
          } catch (_error) {
            // Diagnostic tracing must never affect Steam navigation.
          }
          return original.apply(this, args);
        };

        try {
          history[methodName] = patched;
        } catch (_error) {
          continue;
        }

        traceUnpatchers.push(() => {
          try {
            if (history?.[methodName] === patched) {
              history[methodName] = original;
            }
          } catch (_error) {
            // Best effort teardown.
          }
        });
      }
    } catch (_error) {
      // Keep scanning and patching other history instances.
    }
  }

  unpatchers.push(() => {
    traceUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__deckyHistoryInstanceTrace;
  });
};
