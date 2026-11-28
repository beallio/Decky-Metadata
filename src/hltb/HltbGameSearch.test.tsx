import { describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.slots.length) hooks.slots.push(initial);
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.slots.length) hooks.slots.push({ current: initial });
    return hooks.slots[index];
  },
}));
vi.mock("@decky/ui", () => ({ Field: "Field", TextField: "TextField" }));
vi.mock("../backend", () => ({ searchHltbGames: vi.fn() }));
vi.mock("../i18n", () => ({
  formatHours: String,
  translateBackendError: String,
  useT: () => (key: string) => key,
}));
vi.mock("../metadataEditorStyles", () => ({
  editorFocusTargetClassName: "focus",
  editorSearchButtonStyle: {},
  editorSearchRowStyle: {},
  editorSearchInputStyle: {},
}));
vi.mock("../styles", () => ({ fieldStyle: {}, FocusableButton: "FocusableButton" }));

import { searchHltbGames } from "../backend";
import { HltbGameSearch } from "./HltbGameSearch";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

type Element = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };
const nodes = (node: unknown): Element[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const element = node as Element;
  return [element, ...nodes(element.props?.children)];
};
const render = () => {
  hooks.cursor = 0;
  return HltbGameSearch({ initialQuery: "Old title", disabled: false, onApply: vi.fn(async () => undefined) });
};

describe("HltbGameSearch", () => {
  it("hides and ignores results for a query changed during an in-flight search", async () => {
    const pending = deferred<{ game_id: number; game_name: string; main_seconds: number; count: number }[]>();
    vi.mocked(searchHltbGames).mockReturnValueOnce(pending.promise);
    hooks.slots = [];

    const initial = nodes(render());
    const searchButton = initial.find((node) => node.type === "FocusableButton")!;
    void (searchButton.props!.onClick as () => void)();
    const queryField = initial.find((node) => node.type === "TextField")!;
    (queryField.props!.onChange as (event: { target: { value: string } }) => void)({ target: { value: "New title" } });
    pending.resolve([{ game_id: 17, game_name: "Old title", main_seconds: 3600, count: 1 }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(nodes(render()).some((node) => node.props?.label === "Old title")).toBe(false);
  });
});
