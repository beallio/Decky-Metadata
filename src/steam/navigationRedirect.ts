import { Navigation } from "@decky/ui";
import { frontendLog } from "../backend";
import * as log from "../log";
import {
  Unpatch,
  historyPathFromArgs,
  historyStateFromArgs,
  patchMethod,
  rewriteSteamLinkToMatchedApp,
  steamAppIdForApp,
  steamLinkTarget,
} from "./core";

const firstUrlishArgIndex = (args: any[], firstOnly = false): number => {
  const limit = firstOnly ? Math.min(args.length, 1) : args.length;
  for (let index = 0; index < limit; index += 1) {
    const value = args[index];
    if (typeof value === "string") return index;
    if (typeof URL !== "undefined" && value instanceof URL) return index;
  }
  return -1;
};

const logSteamLinkNavigation = (kind: string, original: string, rewritten: string) => {
  void frontendLog("nav", "steam link", { kind, original, rewritten }).catch(() => undefined);
};

export const installSteamNavigationRedirect = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__deckyNavRedirect) {
    unpatchers.push(() => undefined);
    return;
  }

  const redirectUnpatchers: Unpatch[] = [];
  globalState.__deckyNavRedirect = { installed: true };

  const patchUrlOpener = (target: any, methodName: string, firstOnly = false) => {
    if (typeof target?.[methodName] !== "function") return;
    const original = target[methodName];
    const patched = function deckySteamNavigationRedirect(this: any, ...args: any[]) {
      try {
        const index = firstUrlishArgIndex(args, firstOnly);
        if (index < 0) return original.apply(this, args);
        const originalUrl = String(args[index] || "");
        const targetInfo = steamLinkTarget(originalUrl);
        if (!targetInfo) return original.apply(this, args);
        const rewritten = rewriteSteamLinkToMatchedApp(originalUrl);
        logSteamLinkNavigation(targetInfo.kind, originalUrl, rewritten.url);
        if (!rewritten.rewrote) return original.apply(this, args);
        const nextArgs = [...args];
        nextArgs[index] = rewritten.url;
        return original.apply(this, nextArgs);
      } catch (_error) {
        return original.apply(this, args);
      }
    };
    target[methodName] = patched;
    redirectUnpatchers.push(() => {
      if (target?.[methodName] === patched) {
        target[methodName] = original;
      }
    });
  };

  const patchAppIdOpener = (target: any, methodName: string, argIndex = 0) => {
    if (typeof target?.[methodName] !== "function") return;
    const original = target[methodName];
    const patched = function deckySteamAppIdNavigationRedirect(this: any, ...args: any[]) {
      try {
        const originalAppId = Number(args[argIndex]);
        const mapped = steamAppIdForApp(originalAppId);
        if (mapped > 0 && mapped !== originalAppId) {
          const nextArgs = [...args];
          nextArgs[argIndex] = mapped;
          logSteamLinkNavigation("store", String(args[argIndex]), String(mapped));
          return original.apply(this, nextArgs);
        }
        return original.apply(this, args);
      } catch (_error) {
        return original.apply(this, args);
      }
    };
    target[methodName] = patched;
    redirectUnpatchers.push(() => {
      if (target?.[methodName] === patched) {
        target[methodName] = original;
      }
    });
  };

  patchUrlOpener(Navigation as any, "NavigateToSteamWeb");
  patchUrlOpener(Navigation as any, "NavigateToExternalWeb");
  patchUrlOpener((window as any)?.SteamClient?.System, "OpenInSystemBrowser");
  patchUrlOpener((window as any)?.SteamClient?.Overlay, "OpenExternalBrowserURL");
  patchUrlOpener(window, "open", true);
  patchAppIdOpener((window as any)?.SteamClient?.Apps, "ShowStore", 0);

  unpatchers.push(() => {
    redirectUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__deckyNavRedirect;
  });
};

export const installMainWindowHistoryRedirect = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__deckyMainWindowHistoryRedirect) {
    unpatchers.push(() => undefined);
    return;
  }

  const redirectUnpatchers: Unpatch[] = [];
  let cancelled = false;
  let retryId: number | undefined;
  let attempts = 0;
  globalState.__deckyMainWindowHistoryRedirect = { installed: true };

  const clearRetry = () => {
    if (retryId !== undefined) {
      window.clearTimeout(retryId);
      retryId = undefined;
    }
  };

  const mainWindowHistory = () =>
    (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ??
    (globalThis as any)?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;

  const patchHistoryMethod = (history: any, methodName: "push" | "replace") => {
    const unpatch = patchMethod(history, methodName, (_thisValue, original, args) => {
      try {
        const path = historyPathFromArgs(args);
        const state = historyStateFromArgs(args);
        if (
          String(path || "").toLowerCase().includes("steamweb") &&
          state &&
          typeof state === "object" &&
          typeof state.url === "string"
        ) {
          const rewritten = rewriteSteamLinkToMatchedApp(state.url);
          if (rewritten.rewrote) {
            state.url = rewritten.url;
            void frontendLog("nav", "mainwindow steamweb rewrite", {
              method: methodName,
              from: rewritten.fromAppId,
              to: rewritten.toAppId,
            }).catch(() => undefined);
          }
        }
      } catch (_error) {
        // Steam navigation must continue even if the redirect probe fails.
      }
      return original(...args);
    });
    const patched = history?.[methodName];
    redirectUnpatchers.push(() => {
      try {
        if (history?.[methodName] === patched) {
          unpatch();
        }
      } catch (_error) {
        // Best effort teardown.
      }
    });
  };

  const tryInstall = () => {
    if (cancelled) return;
    const history = mainWindowHistory();
    if (history && typeof history.push === "function" && typeof history.replace === "function") {
      clearRetry();
      patchHistoryMethod(history, "push");
      patchHistoryMethod(history, "replace");
      return;
    }
    attempts += 1;
    if (attempts < 30) {
      retryId = window.setTimeout(tryInstall, 500);
    }
  };

  tryInstall();

  unpatchers.push(() => {
    cancelled = true;
    clearRetry();
    redirectUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__deckyMainWindowHistoryRedirect;
  });
};
