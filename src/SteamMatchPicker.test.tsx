import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ searchSteamMatches: vi.fn(), getSteamMatchPreview: vi.fn() }));
const hooks = vi.hoisted(() => ({
  values: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0,
  setup: null as (() => (() => void)) | null, cleanup: null as (() => void) | null,
}));
vi.mock("./backend", () => backend);
vi.mock("@decky/ui", () => ({
  PanelSection: "PanelSection", PanelSectionRow: "PanelSectionRow", TextField: "TextField",
  DialogButton: "DialogButton", Spinner: "Spinner",
}));
vi.mock("react", () => ({
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

import { SteamMatchPicker } from "./SteamMatchPicker";
import type { SteamMatchCandidate, SteamMatchPreview } from "./types";

const portal: SteamMatchCandidate = { steam_appid: 400, title: "Portal", cover_url: null };
const portal2: SteamMatchCandidate = { steam_appid: 620, title: "Portal 2", cover_url: null };
const hades: SteamMatchCandidate = { steam_appid: 1145360, title: "Hades", cover_url: null };
const portalPreview: SteamMatchPreview = {
  ...portal, developers: ["Valve"], release_date_label: "Oct 9, 2007", app_type: "game",
};
const portal2Preview: SteamMatchPreview = {
  ...portal2, developers: ["Valve"], release_date_label: "Apr 18, 2011", app_type: "game",
};
const applying = vi.fn(async (_steamAppId: number) => {});
const renderPicker = () => {
  hooks.cursor = 0;
  hooks.refCursor = 0;
  return SteamMatchPicker({ initialQuery: "Portal", matchedSteamAppId: null, disabled: false, onApply: applying }) as any;
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
  return text(node.props?.children);
};
const button = (tree: any, label: string) => walk(tree, node => typeof node.props?.onClick === "function" && text(node) === label)[0];
const candidate = (tree: any, id: number) => walk(tree, node => typeof node.props?.onClick === "function" && text(node).includes(`Steam App ID: ${id}`))[0];
const changeQuery = (tree: any, query: string) => walk(tree, node => node.type === "TextField")[0].props.onChange({ target: { value: query } });
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  hooks.values = [];
  hooks.refs = [];
  hooks.setup = null;
  hooks.cleanup = null;
  vi.resetAllMocks();
  backend.searchSteamMatches.mockResolvedValue({ items: [portal2, portal], error: null });
  backend.getSteamMatchPreview.mockResolvedValue({ preview: portalPreview, error: null });
});

describe("Steam match browsing ownership", () => {
  it("shows identifying details for a non-first candidate without applying a match", async () => {
    button(renderPicker(), "Search Steam").props.onClick();
    await flush();
    candidate(renderPicker(), 400).props.onClick();
    await flush();

    const shown = text(renderPicker());
    expect(shown).toContain("Valve");
    expect(shown).toContain("Oct 9, 2007");
    expect(applying).not.toHaveBeenCalled();
  });

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

  it("keeps the new candidate's release details when an older preview completes", async () => {
    const oldPreview = deferred<{ preview: SteamMatchPreview; error: null }>();
    backend.getSteamMatchPreview.mockReturnValueOnce(oldPreview.promise)
      .mockResolvedValueOnce({ preview: portal2Preview, error: null });
    button(renderPicker(), "Search Steam").props.onClick();
    await flush();
    candidate(renderPicker(), 400).props.onClick();
    candidate(renderPicker(), 620).props.onClick();
    await flush();
    oldPreview.resolve({ preview: portalPreview, error: null });
    await flush();

    expect(text(renderPicker())).toContain("Apr 18, 2011");
    expect(text(renderPicker())).not.toContain("Oct 9, 2007");
    expect(applying).not.toHaveBeenCalled();
  });

  it("cannot apply a previously selected result after the query changes", async () => {
    button(renderPicker(), "Search Steam").props.onClick();
    await flush();
    candidate(renderPicker(), 400).props.onClick();
    await flush();
    const retiredConfirm = button(renderPicker(), "Use this Steam match");
    changeQuery(renderPicker(), "Hades");
    retiredConfirm.props.onClick();
    await flush();

    expect(applying).not.toHaveBeenCalled();
    expect(text(renderPicker())).not.toContain("Oct 9, 2007");
  });

  it("rejects confirmation from an unmounted picker", async () => {
    button(renderPicker(), "Search Steam").props.onClick();
    await flush();
    candidate(renderPicker(), 400).props.onClick();
    await flush();
    const retiredConfirm = button(renderPicker(), "Use this Steam match");
    hooks.cleanup!();
    retiredConfirm.props.onClick();
    await flush();

    expect(applying).not.toHaveBeenCalled();
  });
});

it("rejects an old confirmation when the same row is selected again and its new preview is pending", async () => {
  const newPreview = deferred<{ preview: SteamMatchPreview; error: null }>();
  backend.getSteamMatchPreview.mockResolvedValueOnce({ preview: portalPreview, error: null })
    .mockResolvedValueOnce({ preview: portal2Preview, error: null })
    .mockReturnValueOnce(newPreview.promise);
  button(renderPicker(), "Search Steam").props.onClick();
  await flush();
  candidate(renderPicker(), 400).props.onClick();
  await flush();
  const retiredConfirm = button(renderPicker(), "Use this Steam match");
  candidate(renderPicker(), 620).props.onClick();
  await flush();
  candidate(renderPicker(), 400).props.onClick();
  retiredConfirm.props.onClick();
  await flush();

  expect(applying).not.toHaveBeenCalled();
  newPreview.resolve({ preview: portalPreview, error: null });
  await flush();
});
