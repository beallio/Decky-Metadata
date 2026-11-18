import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorLayout, type EditorLayoutPage, type EditorLayoutProps } from "./editorLayout";

const hooks = vi.hoisted(() => ({
  viewport: { scrollTop: 0, querySelector: vi.fn(() => hooks.focusTarget) },
  focusTarget: { focus: vi.fn() },
  layoutEffect: vi.fn<(effect: () => void, dependencies: readonly unknown[]) => void>(),
  memo: undefined as { dependencies: readonly unknown[]; value: unknown } | undefined,
  useMemo: vi.fn((factory: () => unknown, dependencies: readonly unknown[]) => {
    const cached = hooks.memo;
    if (!cached || dependencies.length !== cached.dependencies.length ||
      dependencies.some((dependency, index) => dependency !== cached.dependencies[index])) {
      hooks.memo = { dependencies: [...dependencies], value: factory() };
    }
    return hooks.memo.value;
  }),
}));
const mocks = vi.hoisted(() => ({
  findModuleExport: vi.fn(),
  nativeComponent: vi.fn(),
}));
vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  findModuleExport: mocks.findModuleExport,
  Focusable: "Focusable",
  ScrollPanel: "ScrollPanel",
  NavEntryPositionPreferences: { PREFERRED_CHILD: 4 },
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  useId: () => "editor-layout",
  useRef: () => ({ current: hooks.viewport }),
  useLayoutEffect: hooks.layoutEffect,
  useMemo: hooks.useMemo,
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
  focusable?: boolean;
  "aria-selected"?: boolean;
};
type NativePageEntry = "separator" | {
  identifier: string;
  title: ReactNode;
  icon?: ReactNode;
  visible: boolean;
  content: ReactNode;
};

type NativePagedSettingsProps = {
  pages: NativePageEntry[];
  page: string;
  onPageRequested(identifier: string): void;
  title: string;
  showTitle: boolean;
  bottomControls: ReactNode;
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

const renderWith = (
  component: (props: EditorLayoutProps) => JSX.Element,
  overrides: Partial<EditorLayoutProps> = {},
) => {
  const element = component({
    title: "Deadpool",
    pages,
    page: "details",
    onPageRequested: vi.fn(),
    saveLabel: "Save (1)",
    saveDisabled: false,
    onSave: vi.fn(),
    ...overrides,
  });
  const resolved = isValidElement(element) && typeof element.type === "function"
    ? (element.type as (props: EditorLayoutProps) => ReactNode)(element.props as EditorLayoutProps)
    : element;
  return nodes(resolved);
};

const render = (overrides: Partial<EditorLayoutProps> = {}) => renderWith(EditorLayout, overrides);

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
  it("uses Steam's native paged settings component when its source signature is found", async () => {
    mocks.findModuleExport.mockClear();
    vi.resetModules();
    hooks.memo = undefined;
    let matcher: ((moduleExport: unknown) => boolean) | undefined;
    mocks.findModuleExport.mockImplementation((predicate: (moduleExport: unknown) => boolean) => {
      matcher = predicate;
      return mocks.nativeComponent;
    });

    // Module resolution runs at import time, so load a fresh copy with a mocked Steam export.
    const { EditorLayout: NativeLayout } = await import("./editorLayout");
    expect(mocks.findModuleExport).toHaveBeenCalledOnce();
    // Mirrors the live Steam export: `function R(N){const K=(0,S.Zt)("PagedSettings",O);return(0,e.jsx)(K,{...N})}`.
    const matchingExport = function PagedSettingsAdapter(props: Record<string, unknown>) {
      const component = "PagedSettings";
      return [component, { ...props }];
    };
    const unrelatedExport = function OtherAdapter(props: Record<string, unknown>) {
      return { ...props };
    };
    expect(matcher?.(matchingExport)).toBe(true);
    expect(matcher?.(unrelatedExport)).toBe(false);

    const onPageRequested = vi.fn();
    const onSave = vi.fn();
    const tree = renderWith(NativeLayout, { page: "advanced", onPageRequested, onSave });
    const native = tree.find((node) => node.type === mocks.nativeComponent)!;
    const received = native.props as unknown as NativePagedSettingsProps;
    expect(received.pages.map((entry) =>
      typeof entry === "string" ? entry : [entry.identifier, entry.title, entry.visible]))
      .toEqual([
        ["details", "Details", true],
        "separator",
        ["shortcut-name", "Shortcut Name", false],
        "separator",
        ["advanced", "Advanced", true],
      ]);
    expect(received.pages.every((entry) =>
      typeof entry === "string" || typeof entry.visible === "boolean")).toBe(true);
    const detailsPage = received.pages.find((entry): entry is Exclude<NativePageEntry, "separator"> =>
      typeof entry !== "string")!;
    expect(detailsPage.icon).toBeDefined();
    expect(nodes(detailsPage.icon).some((node) => node.props.className?.includes(dirtyDot))).toBe(true);
    expect(detailsPage.title).toBe("Details");
    expect(received.page).toBe("advanced");
    expect(received.title).toBe("Deadpool");
    expect(received.showTitle).toBe(true);
    received.onPageRequested("advanced");
    expect(onPageRequested).toHaveBeenCalledExactlyOnceWith("advanced");

    const save = received.bottomControls as ReactElement<NodeProps>;
    expect(save.type).toBe("DialogButton");
    expect(text(save)).toBe("Save (1)");
    expect(save.props.disabled).toBe(false);
    save.props.onClick!();
    expect(onSave).toHaveBeenCalledOnce();
    const disabledTree = renderWith(NativeLayout, { saveDisabled: true });
    const disabledNative = disabledTree.find((node) => node.type === mocks.nativeComponent)!;
    const disabledSave = (disabledNative.props as unknown as NativePagedSettingsProps).bottomControls as ReactElement<NodeProps>;
    expect(disabledSave.props.disabled).toBe(true);
    expect(disabledSave.props.focusable).toBe(false);

    const nextContent = <input defaultValue="Updated title" />;
    const nextPages = pages.map((editorPage) => editorPage.id === "details"
      ? { ...editorPage, content: nextContent }
      : editorPage);
    const updatedTree = renderWith(NativeLayout, { pages: nextPages });
    const updatedNative = updatedTree.find((node) => node.type === mocks.nativeComponent)!;
    expect((updatedNative.props as unknown as NativePagedSettingsProps).pages).toBe(received.pages);
    const contentProvider = updatedTree.find(
      (node): node is ReactElement<NodeProps & { value: EditorLayoutPage[] }> =>
        "value" in node.props && node.props.value === nextPages,
    );
    expect(contentProvider?.props.value[0].content).toBe(nextContent);
  });
});
