import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({
  callable: vi.fn(() => vi.fn()),
  routerHook: { addPatch: vi.fn(), removePatch: vi.fn() },
}));
vi.mock("@decky/ui", () => ({
  findModuleChild: vi.fn(),
  createReactTreePatcher: vi.fn(),
  findInReactTree: vi.fn(),
}));

import { guardNativeArtworkIdentity } from "./artworkIdentity";
import { decideBIsModOrShortcut } from "./spoofDecision";

const missingJpg = "/customimages/2312439508p.jpg";
const workingPng = "/customimages/2312439508p.png";
const nativeSources = [missingJpg, workingPng, "/images/defaultappimage.png"];
const steamSources = [missingJpg, workingPng, "/assets/2312439508/library_600x900.jpg", "/images/defaultappimage.png"];

type App = { appid: number; BIsModOrShortcut: () => boolean };
type Props = { app: App; rgSources?: string[]; eAssetType?: number };

const fixture = (inheritedProps = false) => {
  const state = { bypassCounter: 2, detail: false, failLookup: false };
  const app = (appid = 2312439508, shortcut = true): App => ({
    appid,
    BIsModOrShortcut: () => {
      const decision = decideBIsModOrShortcut({
        isPatchedNonSteam: shortcut,
        originalRet: shortcut,
        hasCache: true,
        bypassCounter: state.bypassCounter,
        isCurrentMatchedRenderRoute: state.detail,
        consumeShield: () => false,
      });
      state.bypassCounter = decision.nextBypassCounter;
      return decision.finalRet;
    },
  });
  class NativeArtwork {
    declare props: Props;
    declare GetSourcesForAsset: () => string[];
    refresh?: () => void;
    constructor(props: Props) { this.props = props; }
    forceUpdate() { this.refresh?.(); }
    render() { return this.props.rgSources || this.GetSourcesForAsset(); }
  }
  const lookup = function(this: NativeArtwork) {
    if (state.failLookup) throw new Error("native lookup failure");
    return this.props.app.BIsModOrShortcut() ? [...nativeSources] : [...steamSources];
  };
  Object.defineProperty(NativeArtwork.prototype, "GetSourcesForAsset", {
    configurable: true,
    get() {
      const bound = lookup.bind(this);
      if (!Object.prototype.hasOwnProperty.call(this, "GetSourcesForAsset")) Object.defineProperty(this, "GetSourcesForAsset", { value: bound });
      return bound;
    },
  });
  if (inheritedProps) {
    const values = new WeakMap<NativeArtwork, Props>();
    Object.defineProperty(NativeArtwork.prototype, "props", {
      configurable: true,
      enumerable: true,
      get() { return values.get(this); },
      set(next: Props) {
        // Like an observable props setter, this reads its native old value.
        if (this.props !== values.get(this)) throw new Error("native props identity changed");
        values.set(this, next);
      },
    });
  }
  const originalGetter = Object.getOwnPropertyDescriptor(NativeArtwork.prototype, "GetSourcesForAsset");
  return { state, app, NativeArtwork, originalGetter };
};

/** Native-like source reset: a changed candidate list restarts at the JPG. */
const loadedCover = (owner: { render: () => string[]; refresh?: () => void }) => {
  let candidates: string[] = [];
  let index = 0;
  const render = () => {
    const next = owner.render();
    if (JSON.stringify(next) !== JSON.stringify(candidates)) index = 0;
    candidates = next;
  };
  render();
  index = 1;
  owner.refresh = render;
  return {
    render,
    visibleImage: () => candidates[index],
    brokenImageVisible: () => candidates[index] === missingJpg,
  };
};

describe("native artwork identity", () => {
  it("keeps a loaded cover stable through detail and Back when the owner predates installation", () => {
    const { state, app, NativeArtwork } = fixture();
    const owner = new NativeArtwork(Object.freeze({ app: app(), eAssetType: 0 }));
    const cover = loadedCover(owner);
    expect(Object.getOwnPropertyDescriptor(owner, "GetSourcesForAsset")?.configurable).toBe(false);
    const cleanup = guardNativeArtworkIdentity(NativeArtwork, state, [owner]);
    try {
      state.detail = true;
      cover.render();
      expect(cover.visibleImage()).toBe(workingPng);
      expect(cover.brokenImageVisible()).toBe(false);
      expect(owner.props.app.BIsModOrShortcut()).toBe(false);
      state.detail = false;
      cover.render();
      expect(cover.visibleImage()).toBe(workingPng);
    } finally { cleanup(); }
  });

  it("guards new native autobind instances without changing rich-detail shortcut decisions", () => {
    const { state, app, NativeArtwork } = fixture();
    const cleanup = guardNativeArtworkIdentity(NativeArtwork, state);
    try {
      const owner = new NativeArtwork({ app: app() });
      const cover = loadedCover(owner);
      state.detail = true;
      cover.render();
      expect(cover.visibleImage()).toBe(workingPng);
      expect(owner.render()).toEqual(nativeSources);
      expect(owner.props.app.BIsModOrShortcut()).toBe(false);
      expect(state.bypassCounter).toBe(2);
    } finally { cleanup(); }
  });

  it("preserves explicit artwork, including an intentionally empty source list", () => {
    const { state, app, NativeArtwork } = fixture();
    const owner = new NativeArtwork({ app: app() });
    owner.GetSourcesForAsset();
    const cleanup = guardNativeArtworkIdentity(NativeArtwork, state, [owner]);
    try {
      state.detail = true;
      state.failLookup = true;
      owner.props = { app: app(), rgSources: ["/custom/selected-cover.webp"] };
      expect(owner.render()).toEqual(["/custom/selected-cover.webp"]);
      owner.props = { app: app(), rgSources: [] };
      expect(owner.render()).toEqual([]);
    } finally { cleanup(); }
  });

  it("handles observable props replacement and restores the latest native app on unload", () => {
    const { state, app, NativeArtwork, originalGetter } = fixture(true);
    const shortcut = app();
    const official = app(55150, false);
    const owner = new NativeArtwork(Object.freeze({ app: shortcut }));
    owner.GetSourcesForAsset();
    const cleanup = guardNativeArtworkIdentity(NativeArtwork, state, [owner]);
    state.detail = true;
    expect(owner.render()).toEqual(nativeSources);
    owner.props = Object.freeze({ app: official });
    expect(owner.render()).toEqual(steamSources);
    cleanup();
    expect(owner.props.app).toBe(official);
    expect(owner.render()).toEqual(steamSources);
    expect(Object.prototype.hasOwnProperty.call(owner, "props")).toBe(false);
    expect(Object.getOwnPropertyDescriptor(NativeArtwork.prototype, "GetSourcesForAsset")).toEqual(originalGetter);
  });

  it("restores the native resolver after errors and a guarded reload of a cached owner", () => {
    const { state, app, NativeArtwork } = fixture();
    const owner = new NativeArtwork({ app: app() });
    owner.GetSourcesForAsset();
    let cleanup = guardNativeArtworkIdentity(NativeArtwork, state, [owner]);
    state.detail = true;
    state.failLookup = true;
    expect(() => owner.render()).toThrow("native lookup failure");
    expect(state.bypassCounter).toBe(2);
    state.failLookup = false;
    expect(owner.render()).toEqual(nativeSources);
    cleanup();
    expect(owner.render()).toEqual(steamSources);
    cleanup = guardNativeArtworkIdentity(NativeArtwork, state, [owner]);
    expect(owner.render()).toEqual(nativeSources);
    cleanup();
    expect(owner.render()).toEqual(steamSources);
  });

  it("makes retained new-instance callbacks native again after unload", () => {
    const { state, app, NativeArtwork } = fixture();
    const cleanup = guardNativeArtworkIdentity(NativeArtwork, state);
    const owner = new NativeArtwork({ app: app() });
    const retainedLookup = owner.GetSourcesForAsset;
    state.detail = true;
    expect(retainedLookup()).toEqual(nativeSources);
    cleanup();
    expect(retainedLookup()).toEqual(steamSources);
    expect(owner.GetSourcesForAsset()).toEqual(steamSources);
    expect(Object.getOwnPropertyDescriptor(owner, "GetSourcesForAsset")?.configurable).toBe(false);
  });

  it("keeps configurable peer source methods on their native instance receiver", () => {
    const { state, app, NativeArtwork } = fixture();
    const owner = new NativeArtwork({ app: app() });
    Object.defineProperty(owner, "GetSourcesForAsset", {
      configurable: true,
      writable: true,
      value: function() {
        return [...(this.props.app.BIsModOrShortcut() ? nativeSources : steamSources), "/peer/fallback.png"];
      },
    });
    const cleanup = guardNativeArtworkIdentity(NativeArtwork, state, [owner]);
    state.detail = true;
    expect(owner.render()).toEqual([...nativeSources, "/peer/fallback.png"]);
    cleanup();
    expect(owner.render()).toEqual([...steamSources, "/peer/fallback.png"]);
  });
});
