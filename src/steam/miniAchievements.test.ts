import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  addPatch: vi.fn(),
  removePatch: vi.fn(),
  documents: [] as unknown[],
}));

const classes = vi.hoisted(() => ({
  GameStat: "game-stat",
  GameStatsSection: "stats-section",
  Playtime: "playtime",
  PlayBar: "play-bar",
}));

vi.mock("@decky/ui", async () => {
  // The factory runs before this file's imports initialise, so the real patcher
  // cannot be a static import here.
  const { afterPatch } = await import("@decky/ui/dist/utils/patcher");
  const findNode = (node: unknown, filter: (candidate: unknown) => unknown): unknown => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findNode(child, filter);
        if (found) return found;
      }
      return undefined;
    }
    if (!node || typeof node !== "object") return undefined;
    if (filter(node)) return node;
    for (const key of ["props", "children"]) {
      const found = findNode(Reflect.get(node, key), filter);
      if (found) return found;
    }
    return undefined;
  };
  return {
    afterPatch,
    findInReactTree: findNode,
    findClassModule: () => classes,
  };
});

vi.mock("@decky/api", () => ({
  routerHook: { addPatch: mocks.addPatch, removePatch: mocks.removePatch },
}));

vi.mock("../log", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

vi.mock("./steamUiHost", () => ({ steamUiDocuments: () => mocks.documents }));

import { installMiniAchievementsPatch } from "./miniAchievements";

const APP_ID = 1942280;
const SHORTCUT_APP_ID = 228980;

type DetailPatch = { route: string; callback: (tree: unknown) => unknown };
type StatsInstance = {
  props: unknown;
  forceUpdate: Mock;
  BUserHasContentToClaim(): void;
};
type FakeDocument = {
  sections: unknown[];
  querySelectorAll(selector: string): unknown[];
  defaultView: { MutationObserver: unknown };
};

let detailPatches: DetailPatch[] = [];
let dispose: (() => void) | undefined;
let document: FakeDocument;

const makeInstance = (props: unknown): StatsInstance => ({
  props,
  forceUpdate: vi.fn(),
  BUserHasContentToClaim() {
    // Valve's component method; the fiber walk only checks that it exists.
  },
});

const makeSection = (instance: StatsInstance, ownerDocument: FakeDocument) => ({
  __reactFiber$test: {
    stateNode: { render: () => null },
    return: { stateNode: instance, return: null },
  },
  ownerDocument,
  closest: () => null,
});

const makeDocument = (): FakeDocument => {
  class FakeMutationObserver {
    observe() {
      // The tests drive sync through the retry timers instead.
    }
    disconnect() {
      // Nothing to release in the fake document.
    }
  }
  const doc: FakeDocument = {
    sections: [],
    querySelectorAll: (selector) => (selector === `.${classes.GameStatsSection}` ? doc.sections : []),
    defaultView: { MutationObserver: FakeMutationObserver },
  };
  return doc;
};

const steamProps = () => ({ details: { unAppID: APP_ID }, overview: { appid: APP_ID, installed: true } });

const mountSection = (props: unknown = steamProps(), target: FakeDocument = document) => {
  const instance = makeInstance(props);
  target.sections.push(makeSection(instance, target));
  return { instance };
};

const install = () => {
  vi.useFakeTimers();
  dispose = installMiniAchievementsPatch();
  vi.advanceTimersByTime(0);
};

const applyDetailPatch = (routeProps: { renderFunc: () => unknown }) => {
  detailPatches.find((candidate) => candidate.route === "/library/app/:appid")?.callback({ props: routeProps });
};

beforeEach(() => {
  detailPatches = [];
  mocks.documents.length = 0;
  mocks.addPatch.mockReset();
  mocks.removePatch.mockReset();
  mocks.addPatch.mockImplementation((route: string, callback: DetailPatch["callback"]) => {
    const record = { route, callback };
    detailPatches.push(record);
    return record;
  });
  mocks.removePatch.mockImplementation((_route: string, record: DetailPatch) => {
    detailPatches = detailPatches.filter((candidate) => candidate !== record);
  });
  document = makeDocument();
  mocks.documents.push(document);
  dispose = undefined;
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

describe("mini achievements onSeek supply", () => {
  it("gives Steam's own row an onSeek while keeping the other props", () => {
    const props = steamProps();
    const { instance } = mountSection(props);
    install();

    const patched = instance.props as Record<string, unknown>;
    expect(typeof patched.onSeek).toBe("function");
    expect(patched.details).toBe(props.details);
    expect(patched.overview).toBe(props.overview);
    expect(instance.forceUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps supplying one onSeek after React assigns new props", () => {
    const { instance } = mountSection();
    install();
    const first = instance.props;
    expect(instance.props).toBe(first);

    const next = { details: { unAppID: APP_ID }, overview: { appid: APP_ID } };
    instance.props = next;

    const patched = instance.props as Record<string, unknown>;
    expect(typeof patched.onSeek).toBe("function");
    // A fresh object every read would remount Valve's row.
    expect(instance.props).toBe(patched);
    expect(instance.props).not.toBe(next);
    expect((next as Record<string, unknown>).onSeek).toBeUndefined();
  });

  it("leaves props that already have an onSeek untouched", () => {
    const props = { details: { unAppID: APP_ID }, overview: { appid: APP_ID }, onSeek: () => undefined };
    const { instance } = mountSection(props);
    install();

    expect(instance.props).toBe(props);
  });

  it("gives a non-Steam shortcut's row an onSeek so Steam's own data decides", () => {
    const props = {
      details: { unAppID: SHORTCUT_APP_ID },
      overview: { appid: SHORTCUT_APP_ID, app_type: 1073741824, BIsShortcut: () => true },
    };
    const { instance } = mountSection(props);
    install();

    const patched = instance.props as Record<string, unknown>;
    expect(typeof patched.onSeek).toBe("function");
    expect(patched.details).toBe(props.details);
    expect(patched.overview).toBe(props.overview);
  });

  it("patches the section in every Steam document, such as a sticky header", () => {
    const sticky = makeDocument();
    mocks.documents.push(sticky);
    const page = mountSection();
    const header = mountSection(steamProps(), sticky);
    install();

    expect(typeof (page.instance.props as Record<string, unknown>).onSeek).toBe("function");
    expect(typeof (header.instance.props as Record<string, unknown>).onSeek).toBe("function");
  });

  it("skips props that React will not let it reassign", () => {
    const instance = makeInstance(undefined);
    Object.defineProperty(instance, "props", {
      value: { overview: { appid: APP_ID } },
      writable: false,
      configurable: false,
    });
    document.sections.push(makeSection(instance, document));

    expect(() => install()).not.toThrow();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(instance, "props")?.get).toBeUndefined();
    expect(instance.forceUpdate).not.toHaveBeenCalled();
  });

  it("patches the instance once the stats section appears", () => {
    mocks.documents.length = 0;
    install();
    expect(mocks.documents).toHaveLength(0);

    mocks.documents.push(document);
    const { instance } = mountSection();
    expect(instance.forceUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(typeof (instance.props as Record<string, unknown>).onSeek).toBe("function");
    expect(instance.forceUpdate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(instance.forceUpdate).toHaveBeenCalledTimes(1);
  });

  it("retries after a route render until the page's stats section exists", () => {
    mocks.documents.length = 0;
    install();
    mocks.documents.push(document);
    const { instance } = mountSection();
    expect(instance.forceUpdate).not.toHaveBeenCalled();

    applyDetailPatch({ renderFunc: () => null });
    vi.runOnlyPendingTimers();

    expect(typeof (instance.props as Record<string, unknown>).onSeek).toBe("function");
  });

  it("restores the latest raw props on dispose and tolerates a second call", () => {
    const { instance } = mountSection();
    install();
    const next = { details: { unAppID: APP_ID }, overview: { appid: APP_ID } };
    instance.props = next;
    expect(instance.forceUpdate).toHaveBeenCalledTimes(1);

    const disposePatch = dispose as () => void;
    dispose = undefined;
    disposePatch();

    const descriptor = Object.getOwnPropertyDescriptor(instance, "props");
    expect(descriptor).toMatchObject({ writable: true, configurable: true, enumerable: true });
    expect(descriptor && "value" in descriptor).toBe(true);
    expect(instance.props).toBe(next);
    expect((instance.props as Record<string, unknown>).onSeek).toBeUndefined();
    expect(instance.forceUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.removePatch).toHaveBeenCalledTimes(3);
    expect(detailPatches).toHaveLength(0);

    expect(() => disposePatch()).not.toThrow();
    expect(instance.forceUpdate).toHaveBeenCalledTimes(2);
  });
});
