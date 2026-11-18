import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorLayout, type EditorLayoutPage, type EditorLayoutProps } from "./editorLayout";

const hooks = vi.hoisted(() => ({
  viewport: { scrollTop: 0, querySelector: vi.fn(() => hooks.focusTarget) },
  focusTarget: { focus: vi.fn() },
  layoutEffect: vi.fn<(effect: () => void, dependencies: readonly unknown[]) => void>(),
}));
vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  Focusable: "Focusable",
  ScrollPanel: "ScrollPanel",
  NavEntryPositionPreferences: { PREFERRED_CHILD: 4 },
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  useId: () => "editor-layout",
  useRef: () => ({ current: hooks.viewport }),
  useLayoutEffect: hooks.layoutEffect,
}));

const detailsContent = <input defaultValue="Draft title" />;
const advancedContent = <div>Advanced settings</div>;
const pages: EditorLayoutPage[] = [
  { id: "details", label: "Details", visible: true, dirty: true, content: detailsContent },
  { id: "shortcut-name", label: "Shortcut Name", visible: false, dirty: true, separatorBefore: true, content: null },
  { id: "advanced", label: "Advanced", visible: true, dirty: false, separatorBefore: true, content: advancedContent },
];

type NodeProps = {
  children?: ReactNode;
  role?: string;
  className?: string;
  disabled?: boolean;
  onActivate?: () => void;
  onClick?: () => void;
  "aria-selected"?: boolean;
};

function nodes(node: ReactNode): ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
}

function text(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<NodeProps>(node) ? text(node.props.children) : "";
}

const render = (overrides: Partial<EditorLayoutProps> = {}) => nodes(EditorLayout({
  title: "Deadpool",
  pages,
  page: "details",
  onPageRequested: vi.fn(),
  saveLabel: "Save (1)",
  saveDisabled: false,
  onSave: vi.fn(),
  ...overrides,
}));

const dirtyDot = "decky-metadata-editor-layout__dirty-dot";
const separator = "decky-metadata-editor-layout__separator";

describe("EditorLayout", () => {
  it("shows the title and only visible tabs, with a dirty dot and separator in their places", () => {
    const tree = render();
    expect(text(tree.find((node) => node.type === "h1"))).toBe("Deadpool");

    const rail = nodes(tree.find((node) => node.props.role === "tablist"));
    const items = rail.filter((node) => node.props.role === "tab" || node.props.className === separator);
    expect(items.map((node) => node.props.className === separator ? "separator" : text(node)))
      .toEqual(["Details", "separator", "Advanced"]);
    expect(rail.filter((node) => node.props.className === dirtyDot)).toHaveLength(1);
    expect(nodes(items[0]).some((node) => node.props.className === dirtyDot)).toBe(true);
  });

  it("mounts only the selected page's content under its label", () => {
    const tree = render({ page: "advanced" });
    const pane = nodes(tree.find((node) => node.props.role === "tabpanel"));
    expect(text(pane.find((node) => node.type === "h2"))).toBe("Advanced");
    expect(pane).toContain(advancedContent);
    expect(tree).not.toContain(detailsContent);
    expect(text(tree.find((node) => node.props.role === "tab" && node.props["aria-selected"]))).toBe("Advanced");
  });

  it("requests a page on tab activation without moving focus into the pane", () => {
    const onPageRequested = vi.fn();
    hooks.focusTarget.focus.mockClear();
    hooks.viewport.querySelector.mockClear();
    const tab = render({ onPageRequested }).find((node) => node.props.role === "tab" && text(node) === "Advanced")!;
    expect(onPageRequested).not.toHaveBeenCalled();
    tab.props.onActivate!();
    expect(onPageRequested).toHaveBeenCalledExactlyOnceWith("advanced");
    expect(hooks.viewport.querySelector).not.toHaveBeenCalled();
    expect(hooks.focusTarget.focus).not.toHaveBeenCalled();
  });
  it("moves focus into the pane when activating the selected tab", () => {
    const onPageRequested = vi.fn();
    hooks.focusTarget.focus.mockClear();
    hooks.viewport.querySelector.mockClear();
    const tab = render({ onPageRequested }).find((node) => node.props.role === "tab" && node.props["aria-selected"])!;

    tab.props.onActivate!();

    expect(onPageRequested).not.toHaveBeenCalled();
    expect(hooks.viewport.querySelector).toHaveBeenCalledOnce();
    expect(hooks.focusTarget.focus).toHaveBeenCalledOnce();
  });


  it("passes the label and disabled state to the native Save button, and wires Save", () => {
    const onSave = vi.fn();
    const saveLabel = "Speichern (1)";
    const [disabled, enabled] = [true, false].map((saveDisabled) =>
      render({ onSave, saveDisabled, saveLabel }).find((node) => node.type === "DialogButton")!);
    expect(text(disabled)).toBe(saveLabel);
    expect(disabled.props.disabled).toBe(true);
    expect(enabled.props.disabled).toBe(false);
    enabled.props.onClick!();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("resets scrolling on a page change, not on other prop changes", () => {
    render();
    const [, initialDeps] = hooks.layoutEffect.mock.lastCall!;
    render({ saveLabel: "Save (2)" });
    expect(hooks.layoutEffect.mock.lastCall![1]).toEqual(initialDeps);

    hooks.viewport.scrollTop = 120;
    render({ page: "advanced" });
    const [resetScroll, nextDeps] = hooks.layoutEffect.mock.lastCall!;
    expect(nextDeps).not.toEqual(initialDeps);
    resetScroll();
    expect(hooks.viewport.scrollTop).toBe(0);
  });
});
