import { routerHook } from "@decky/api";
import { afterPatch } from "@decky/ui";
import { cloneElement, createElement, isValidElement } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";
import * as log from "../log";
import { GAME_DETAIL_ROUTES, currentRoutePath, isCurrentGameDetailRoute } from "../steam/core";
import { findSteamModulesBySource } from "../steam/steamUiModules";
import { findSteamUiDocumentMatch } from "../steam/steamUiHost";
import { ProtonDbGameButton } from "./Badges";
import type { NativeProtonDbButtonProps } from "./Badges";
import { steamUiDocuments } from "../steam/steamUiHost";
type RecordValue = Record<string, unknown>;
type CardProps = { className?: string; children?: ReactNode };
type NativeTargets = {
  appButtons: string;
  buttonClass: string;
  Button: ComponentType<NativeProtonDbButtonProps>;
};
type Patch = { unpatch: () => void };
type CaptureTimer = number | NodeJS.Timeout;
type NativeAfterPatch = (target: object, method: string,
  handler: (args: unknown[], result: unknown) => unknown) => Patch;
// Decky's generic declaration cannot express the native render callback boundary.
const patchNative = afterPatch as unknown as NativeAfterPatch;
const BUTTON_KEY = "decky-metadata-protondb-game-view";
const CAPTURE_DELAYS = [0, 50, 250, 1_000] as const;
const recordValue = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function moduleValues(fragments: string[]): unknown[] {
  const values: unknown[] = [];
  for (const module of findSteamModulesBySource(fragments)) {
    values.push(module);
    if (recordValue(module)) values.push(...Object.values(module));
  }
  return values;
}

function resolveNativeTargets(): NativeTargets | undefined {
  const actionStyles = moduleValues(["AppButtons", "ActionButtonAndStatusPanel", "PlaySection"])
    .find(value => recordValue(value) && typeof value.AppButtons === "string");
  const controllerStyles = moduleValues(["MenuButton", "ControllerConfigButton"])
    .find(value => recordValue(value) && typeof value.MenuButton === "string" && typeof value.ControllerConfigButton === "string");
  const tooltip = moduleValues(["tool-tip-source", "bNavStop", "toolTipContent:"])
    .find(value => typeof value === "function" &&
      ["tool-tip-source", "bNavStop", "toolTipContent:"].every(fragment => value.toString().includes(fragment)));
  if (!recordValue(actionStyles) || typeof actionStyles.AppButtons !== "string" ||
      !recordValue(controllerStyles) || typeof controllerStyles.MenuButton !== "string" ||
      typeof controllerStyles.ControllerConfigButton !== "string" || typeof tooltip !== "function") return;
  // The fingerprinted native tooltip export supplies Steam's focusable button shell.
  const Button = tooltip as unknown as ComponentType<NativeProtonDbButtonProps>;
  return { appButtons: actionStyles.AppButtons,
    buttonClass: `${controllerStyles.MenuButton} ${controllerStyles.ControllerConfigButton}`, Button };
}

function prependBadge(node: ReactNode, appButtonsClass: string, badge: ReactElement): ReactNode {
  if (Array.isArray(node)) {
    const children = node.map(child => prependBadge(child, appButtonsClass, badge));
    return children.every((child, index) => child === node[index]) ? node : children;
  }
  if (!isValidElement<CardProps>(node)) return node;
  const original = node.props.children;
  if (node.props.className === appButtonsClass) {
    const children = Array.isArray(original) ? original : [original];
    if (children.some(child => isValidElement(child) && child.key === BUTTON_KEY)) return node;
    return cloneElement(node, { children: [badge, ...children] });
  }
  if (original === undefined) return node;
  const children = prependBadge(original, appButtonsClass, badge);
  return children === original ? node : cloneElement(node, { children });
}

function fiberOf(element: Element): RecordValue | undefined {
  for (const key of Object.keys(element)) {
    if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactContainer$")) continue;
    const fiber: unknown = Reflect.get(element, key);
    if (recordValue(fiber)) return recordValue(fiber.current) ? fiber.current : fiber;
  }
}

function actionRowType(fiber: RecordValue): object | undefined {
  const type = fiber.elementType ?? fiber.type;
  if (!recordValue(type) || type.$$typeof !== Symbol.for("react.forward_ref") || typeof type.render !== "function") return;
  const source = type.render.toString();
  return source.includes(".AppButtons") && source.includes(".ActionButtonAndStatusPanel") ? type : undefined;
}

/** Capture the private forwardRef from its real DOM fiber; it is not a webpack export. */
export function installProtonDbGameView(): () => void {
  let stopped = false;
  let targets: NativeTargets | undefined;
  const observers = new Map<Document, MutationObserver>();
  let scheduled: CaptureTimer | undefined;
  let generation = 0;
  const captureTimers = new Set<CaptureTimer>();
  const patches = new Map<object, Patch>();
  const refreshTargets = new Set<RecordValue>();
  const routeCleanups: Array<() => void> = [];

  const capture = () => {
    if (stopped) return;
    const documents = steamUiDocuments();
    for (const document of documents) {
      const body = document.querySelector("body");
      const owner = body?.ownerDocument;
      if (!owner || observers.has(owner)) continue;
      const observer = new MutationObserver(() => {
        if (stopped || scheduled !== undefined) return;
        scheduled = setTimeout(() => { scheduled = undefined; capture(); }, 0);
      });
      observer.observe(body, { childList: true, subtree: true });
      observers.set(owner, observer);
    }
    targets ??= resolveNativeTargets();
    if (!targets) return;
    const resolved = targets;
    const selector = resolved.appButtons.split(/\s+/).filter(Boolean)
      .map(token => `[class~=${JSON.stringify(token)}]`).join("");
    if (!selector) return;
    for (const document of documents) {
      const rows = document.querySelectorAll(selector);
      for (const row of Array.from(rows)) {
        let fiber = fiberOf(row);
        let foundType: object | undefined;
        let parentToRefresh: RecordValue | undefined;
        for (let depth = 0; fiber && depth < 128; depth += 1) {
          foundType ??= actionRowType(fiber);
          const state = fiber.stateNode;
          if (foundType && recordValue(state) && typeof state.forceUpdate === "function") {
            parentToRefresh = state;
            break;
          }
          fiber = recordValue(fiber.return) ? fiber.return : undefined;
        }
        if (!foundType || patches.has(foundType)) continue;
        const patch = patchNative(foundType, "render", (args, result) => {
          if (stopped || !recordValue(args[0]) || !recordValue(args[0].overview)) return result;
          const overview = args[0].overview;
          if (typeof overview.appid !== "number" || !isCurrentGameDetailRoute(currentRoutePath(), overview.appid)) return result;
          const button = createElement(ProtonDbGameButton, {
            key: BUTTON_KEY, displayedAppId: overview.appid, overview,
            Button: resolved.Button, className: resolved.buttonClass,
          });
          // Steam supplies a rendered React tree here, not external input.
          const rendered = result as ReactNode;
          return prependBadge(rendered, resolved.appButtons, button);
        });
        patches.set(foundType, patch);
        if (parentToRefresh) {
          refreshTargets.add(parentToRefresh);
          const refresh = parentToRefresh.forceUpdate;
          if (typeof refresh === "function") refresh.call(parentToRefresh);
        }
      }
    }
  };

  const scheduleCapture = () => {
    if (stopped) return;
    generation += 1;
    const current = generation;
    for (const timer of captureTimers) clearTimeout(timer);
    captureTimers.clear();
    for (const delay of CAPTURE_DELAYS) {
      const timer = setTimeout(() => {
        captureTimers.delete(timer);
        if (!stopped && current === generation) {
          try { capture(); } catch (error) { log.warn("protondb", "game button capture failed", error); }
        }
      }, delay);
      captureTimers.add(timer);
    }
  };
  for (const route of GAME_DETAIL_ROUTES) {
    const patch = routerHook.addPatch(route, props => { scheduleCapture(); return props; });
    routeCleanups.push(() => routerHook.removePatch(route, patch));
  }
  scheduleCapture();
  return () => {
    if (stopped) return;
    stopped = true;
    generation += 1;
    for (const observer of observers.values()) observer.disconnect();
    clearTimeout(scheduled);
    for (const timer of captureTimers) clearTimeout(timer);
    captureTimers.clear();
    for (const dispose of routeCleanups) dispose();
    for (const patch of patches.values()) patch.unpatch();
    patches.clear();
    for (const target of refreshTargets) {
      const refresh = target.forceUpdate;
      if (typeof refresh === "function") {
        try { refresh.call(target); } catch { /* A closed game view has no owner to refresh. */ }
      }
    }
    refreshTargets.clear();
  };
}
