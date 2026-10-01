import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ route: "/library/app/570", row: undefined as unknown, document: undefined as unknown }));
vi.mock("@decky/api", () => ({ routerHook: {
  addPatch: (_route: string, patch: (props: unknown) => unknown) => patch,
  removePatch: vi.fn(),
} }));
vi.mock("@decky/ui", () => ({ afterPatch: (target: object, key: string,
  handler: (args: unknown[], result: unknown) => unknown) => {
  const original: unknown = Reflect.get(target, key);
  if (typeof original !== "function") throw new Error("missing render");
  Reflect.set(target, key, (...args: unknown[]) => handler(args, Reflect.apply(original, target, args)));
  return { unpatch: () => Reflect.set(target, key, original) };
} }));
vi.mock("../log", () => ({ warn: vi.fn() }));
vi.mock("../steam/core", () => ({
  GAME_DETAIL_ROUTES: ["/library/app/:appid"], currentRoutePath: () => native.route,
  isCurrentGameDetailRoute: (route: string, id: number) => route === `/library/app/${id}`,
}));
vi.mock("../steam/steamUiModules", () => ({ findSteamModulesBySource: (fragments: string[]) => {
  if (fragments.includes("tool-tip-source")) return [{ Tooltip: NativeTooltip }];
  if (fragments.includes("ControllerConfigButton")) return [{ MenuButton: "menu", ControllerConfigButton: "controller-style" }];
  return [{ AppButtons: "buttons", ActionButtonAndStatusPanel: "panel", PlaySection: "play" }];
} }));
vi.mock("../steam/steamUiHost", () => ({ steamUiDocuments: () => [native.document] }));
vi.mock("./Badges", () => ({ ProtonDbGameButton: "ProtonDbGameButton" }));

import { installProtonDbGameView } from "./gameView";

function NativeTooltip(props: Record<string, unknown>) {
  const tooltip = { toolTipContent: props.toolTipContent };
  return React.createElement("button", { className: "tool-tip-source", "data-stop": props.bNavStop, ...tooltip });
}
const classes = { AppButtons: "buttons", ActionButtonAndStatusPanel: "panel" };
const PrivateRow = React.forwardRef<unknown, { overview: { appid: number } }>(function Row(props) {
  return React.createElement("div", { className: classes.ActionButtonAndStatusPanel },
    React.createElement("div", { className: classes.AppButtons },
      React.createElement("button", { id: "controller" }, "Controller"),
      React.createElement("button", { id: "settings" }, "Settings")),
    React.createElement("span", null, props.overview.appid));
});
const owner = { forceUpdate: vi.fn() };
const OwnerType = class extends React.Component { render() { return null; } };
const observer = { observe: vi.fn(), disconnect: vi.fn() };
let notifyMutation: () => void;
let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  native.route = "/library/app/570";
  const document = { body: {}, querySelector: () => ({ ownerDocument: native.document }),
    querySelectorAll: () => native.row ? [native.row] : [] };
  native.document = document;
  native.row = {
    ownerDocument: document,
    __reactFiber$fixture: {
      type: "div", return: { type: PrivateRow, return: { type: OwnerType, stateNode: owner } },
    },
  };
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { notifyMutation = callback; }
    observe = observer.observe;
    disconnect = observer.disconnect;
  });
  owner.forceUpdate.mockClear();
});
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

function buttonsFor(id: number) {
  const render: unknown = Reflect.get(PrivateRow, "render");
  if (typeof render !== "function") throw new Error("missing native row");
  const result: unknown = Reflect.apply(render, PrivateRow, [{ overview: { appid: id } }, null]);
  if (!React.isValidElement<{ children: React.ReactNode[] }>(result)) throw new Error("invalid output");
  const row = result.props.children[0];
  if (!React.isValidElement<{ children: React.ReactNode[] }>(row)) throw new Error("invalid buttons");
  return React.Children.toArray(row.props.children);
}

describe("private native action-row capture", () => {
  it("finds a non-exported forwardRef and inserts the badge before existing controls", async () => {
    dispose = installProtonDbGameView();
    await vi.advanceTimersByTimeAsync(0);
    const buttons = buttonsFor(570);
    expect(React.isValidElement(buttons[0]) && buttons[0].type).toBe("ProtonDbGameButton");
    expect(buttons.slice(1).map(button => React.isValidElement<{ id: string }>(button) ? button.props.id : null))
      .toEqual(["controller", "settings"]);
    expect(owner.forceUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not add the old game's action when the native row is reused after navigation", async () => {
    dispose = installProtonDbGameView();
    await vi.advanceTimersByTimeAsync(0);
    native.route = "/library/app/571";
    expect(buttonsFor(570).map(button => React.isValidElement<{ id: string }>(button) ? button.props.id : null))
      .toEqual(["controller", "settings"]);
    const currentButton = buttonsFor(571)[0];
    expect(React.isValidElement(currentButton) && currentButton.type).toBe("ProtonDbGameButton");
  });

  it("captures a first game page whose action row appears after the initial retry burst", async () => {
    const row = native.row;
    native.row = undefined;
    dispose = installProtonDbGameView();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(buttonsFor(570).map(button => React.isValidElement<{ id: string }>(button) ? button.props.id : null))
      .toEqual(["controller", "settings"]);
    native.row = row;
    notifyMutation();
    await vi.advanceTimersByTimeAsync(0);
    const first = buttonsFor(570)[0];
    expect(React.isValidElement(first) && first.type).toBe("ProtonDbGameButton");
  });

  it("restores the native render and cancels capture on unload", async () => {
    dispose = installProtonDbGameView();
    await vi.advanceTimersByTimeAsync(0);
    dispose();
    expect(buttonsFor(570).map(button => React.isValidElement<{ id: string }>(button) ? button.props.id : null))
      .toEqual(["controller", "settings"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
