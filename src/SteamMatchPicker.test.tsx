import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as I18n from "./i18n";

const backend = vi.hoisted(() => ({ searchSteamMatches: vi.fn() }));
const hooks = vi.hoisted(() => ({
  values: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0,
  setup: null as (() => (() => void)) | null, cleanup: null as (() => void) | null,
}));
vi.mock("./backend", () => backend);
vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection", Field: "Field", TextField: "TextField",
}));
vi.mock("react", () => ({
  createContext: () => ({}),
  useState: (initial: any) => {
    const slot = hooks.cursor++;
    if (hooks.values[slot] === undefined) hooks.values[slot] = initial;
    return [hooks.values[slot], (next: any) => { hooks.values[slot] = typeof next === "function" ? next(hooks.values[slot]) : next; }];
  },
  useRef: (initial: any) => {
    const slot = hooks.refCursor++;
    if (hooks.refs[slot] === undefined) hooks.refs[slot] = { current: initial };
    return hooks.refs[slot];
  },
  useEffect: (setup: () => (() => void)) => {
    if (!hooks.setup) { hooks.setup = setup; hooks.cleanup = setup(); }
  },
}));
// Components are rendered by hand here with a partial React mock, so use the
// module-level translator instead of react-i18next's hook.
vi.mock("./i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof I18n>();
  return { ...actual, useT: () => actual.t };
});

import { SteamMatchPicker } from "./SteamMatchPicker";
import type { SteamSearchSnapshot } from "./SteamMatchPicker";
import type { SteamMatchCandidate } from "./types";

const portal: SteamMatchCandidate = { steam_appid: 400, title: "Portal", cover_url: "https://cdn.example/portal.jpg" };
const portal2: SteamMatchCandidate = { steam_appid: 620, title: "Portal 2", cover_url: null };
const hades: SteamMatchCandidate = { steam_appid: 1145360, title: "Hades", cover_url: null };
const applying = vi.fn();
const onSearchChange = vi.fn();
const renderPicker = (overrides: Partial<Parameters<typeof SteamMatchPicker>[0]> = {}) => {
  hooks.cursor = 0;
  hooks.refCursor = 0;
  return SteamMatchPicker({
    initialQuery: "Portal",
    matchedSteamAppId: null,
    disabled: false,
    savedSearch: null,
    onSearchChange,
    onApply: applying,
    ...overrides,
  });
};
const walk = (node: any, predicate: (value: any) => boolean): any[] => {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(value => walk(value, predicate));
  const children = node.props?.children;
  const values = Array.isArray(children) ? children : [children];
  return (predicate(node) ? [node] : []).concat(...values.flatMap(value => walk(value, predicate)));
};
const text = (node: any): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return `${text(node.props?.label)}${text(node.props?.children)}`;
};
const button = (tree: any, label: string) => walk(tree, node => typeof node.props?.onClick === "function" && text(node) === label)[0];
const candidate = (tree: any, id: number) =>
  walk(tree, node => node.type === "Field" && typeof node.props?.onClick === "function" && text(node.props?.children).includes(`Steam App ID: ${id}`))[0];
const changeQuery = (tree: any, query: string) => walk(tree, node => node.type === "TextField")[0].props.onChange({ target: { value: query } });
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const searchOnce = async () => {
  button(renderPicker(), "Search Steam").props.onClick();
  await flush();
};

beforeEach(() => {
  hooks.values = [];
  hooks.refs = [];
  hooks.setup = null;
  hooks.cleanup = null;
  vi.resetAllMocks();
  applying.mockResolvedValue(undefined);
  backend.searchSteamMatches.mockResolvedValue({ items: [portal2, portal], error: null });
});

describe("Steam match browsing ownership", () => {
  it("ignores an old search response after the user searches another title", async () => {
    const oldSearch = deferred<{ items: SteamMatchCandidate[]; error: null }>();
    backend.searchSteamMatches.mockReturnValueOnce(oldSearch.promise)
      .mockResolvedValueOnce({ items: [hades], error: null });
    button(renderPicker(), "Search Steam").props.onClick();
    changeQuery(renderPicker(), "Hades");
    button(renderPicker(), "Search Steam").props.onClick();
    await flush();
    oldSearch.resolve({ items: [portal], error: null });
    await flush();

    expect(text(renderPicker())).toContain("Hades");
    expect(text(renderPicker())).not.toContain("Steam App ID: 400");
    expect(applying).not.toHaveBeenCalled();
  });

  it("applies a clicked result and keeps the results listed", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
    try {
      await searchOnce();
      candidate(renderPicker(), 400).props.onClick();
      await flush();

      expect(applying).toHaveBeenCalledWith(400, "https://cdn.example/portal.jpg");
      expect(text(renderPicker())).toContain("Steam App ID: 400");
      expect(text(renderPicker())).toContain("Portal 2");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not apply a result captured before the query changed", async () => {
    await searchOnce();
    const staleRow = candidate(renderPicker(), 400);
    changeQuery(renderPicker(), "Hades");
    staleRow.props.onClick();
    await flush();

    expect(applying).not.toHaveBeenCalled();
  });

  it("does not apply a result while the picker is disabled", async () => {
    const snapshot: SteamSearchSnapshot = { query: "Portal", items: [portal], status: "results", error: null };
    candidate(renderPicker({ savedSearch: snapshot, disabled: true }), 400).props.onClick();
    await flush();

    expect(applying).not.toHaveBeenCalled();
  });

  it("reports the completed search and restores it on a fresh mount", async () => {
    await searchOnce();
    const snapshot: SteamSearchSnapshot = { query: "Portal", items: [portal2, portal], status: "results", error: null };
    expect(onSearchChange).toHaveBeenLastCalledWith(snapshot);

    hooks.values = [];
    hooks.refs = [];
    hooks.setup = null;
    hooks.cleanup = null;
    const restored = renderPicker({ savedSearch: snapshot });

    expect(backend.searchSteamMatches).toHaveBeenCalledTimes(1);
    expect(text(restored)).toContain("Portal 2");
    expect(text(restored)).toContain("Steam App ID: 400");
    expect(walk(restored, node => node.type === "TextField")[0].props.value).toBe("Portal");
  });
});
