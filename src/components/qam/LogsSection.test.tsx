import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  PanelSectionRow: "PanelSectionRow",
  ToggleField: "ToggleField",
}));
vi.mock("./CollapsibleSection", () => ({ CollapsibleSection: "CollapsibleSection" }));
vi.mock("../../styles", () => ({ ButtonLabel: "ButtonLabel" }));
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { t: (key: string) => string }>();
  return { ...actual, useT: () => actual.t };
});

import { LogsBody } from "./LogsSection";

type ToggleProps = { children?: ReactNode; onChange?: (checked: boolean) => void };

const nodes = (node: ReactNode): ReactElement<ToggleProps>[] => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<ToggleProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
};

describe("LogsSection debug logging toggle", () => {
  it("passes the new value to onToggleDebugLogging", () => {
    const onToggleDebugLogging = vi.fn();
    const tree = LogsBody({
      logsBusy: false,
      debugLogging: false,
      debugLoggingLoaded: true,
      debugLoggingBusy: false,
      onViewLogs: vi.fn(),
      onToggleDebugLogging,
    });
    const toggle = nodes(tree).find((node) => node.type === "ToggleField");

    toggle?.props.onChange?.(true);

    expect(onToggleDebugLogging).toHaveBeenCalledWith(true);
  });
});
