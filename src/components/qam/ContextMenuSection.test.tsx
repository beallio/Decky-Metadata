import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection",
  Field: "Field",
  ToggleField: "ToggleField",
}));
vi.mock("../../styles", () => ({ inlineStatusStyle: () => ({}) }));
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...actual, useT: () => actual.t };
});

import { ContextMenuBody } from "./ContextMenuSection";

const nodes = (node: ReactNode): ReactElement<any>[] => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<any>(node)) return [];
  return [node, ...nodes(node.props.children)];
};

describe("ContextMenuBody", () => {
  it("passes each option and value to the callback", () => {
    const onChange = vi.fn();
    const toggles = nodes(ContextMenuBody({
      settings: { gameIcon: true, steamIconFallback: false },
      error: "",
      onChange,
    })).filter((node) => node.type === "ToggleField");

    toggles[0].props.onChange(false);
    toggles[1].props.onChange(true);

    expect(onChange).toHaveBeenNthCalledWith(1, "gameIcon", false);
    expect(onChange).toHaveBeenNthCalledWith(2, "steamIconFallback", true);
  });

  it("disables options when settings are unavailable or the game icon is off", () => {
    const unavailable = nodes(ContextMenuBody({ settings: null, error: "", onChange: vi.fn() }))
      .filter((node) => node.type === "ToggleField");
    expect(unavailable.map((node) => node.props.disabled)).toEqual([true, true]);

    const gameIconOff = nodes(ContextMenuBody({
      settings: { gameIcon: false, steamIconFallback: true },
      error: "",
      onChange: vi.fn(),
    })).filter((node) => node.type === "ToggleField");
    expect(gameIconOff.map((node) => node.props.disabled)).toEqual([false, true]);
  });
});
