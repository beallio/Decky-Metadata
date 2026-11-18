import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorLayout, type EditorLayoutPage, type EditorLayoutProps } from "./editorLayout";

const mocks = vi.hoisted(() => ({
  findModuleExport: vi.fn(),
  nativeComponent: vi.fn(),
  memo: undefined as { dependencies: readonly unknown[]; value: unknown } | undefined,
}));
vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  Focusable: "Focusable",
  findModuleExport: mocks.findModuleExport,
}));
vi.mock("./i18n", () => ({
  useT: () => (key: string) => key === "editor.unsupportedSteam"
    ? "This Steam version is not supported yet. Update Decky Metadata to edit metadata."
    : key,
}));
// Cache like React does so the test can assert that page descriptors stay stable across edits.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  useMemo: (factory: () => unknown, dependencies: readonly unknown[]) => {
    const cached = mocks.memo;
    if (!cached || dependencies.length !== cached.dependencies.length ||
      dependencies.some((dependency, index) => dependency !== cached.dependencies[index])) {
      mocks.memo = { dependencies: [...dependencies], value: factory() };
    }
    return mocks.memo.value;
  },
}));
const detailsContent = <input defaultValue="Draft title" />;
const advancedContent = <div>Advanced settings</div>;
const pageIcon = <span>Page icon</span>;
const pages: EditorLayoutPage[] = [
  { id: "details", label: "Details", icon: pageIcon, visible: true, dirty: true, content: detailsContent },
  { id: "shortcut-name", label: "Shortcut Name", icon: pageIcon, visible: false, dirty: true, separatorBefore: true, content: null },
  { id: "advanced", label: "Advanced", icon: pageIcon, visible: true, dirty: false, separatorBefore: true, content: advancedContent },
];

type NodeProps = {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  focusable?: boolean;
};
type NativePageEntry = "separator" | {
  identifier: string;
  title: ReactNode;
  icon: ReactNode;
  visible: boolean;
  hideTitle: boolean;
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
const tabLabel = "decky-metadata-editor-layout__tab-label";

describe("EditorLayout", () => {
  it("shows an unsupported Steam notice without page content when no native component is found", () => {
    expect(mocks.findModuleExport).toHaveBeenCalledOnce();
    const tree = render();
    expect(text(tree)).toBe("This Steam version is not supported yet. Update Decky Metadata to edit metadata.");
    expect(tree).not.toContain(detailsContent);
    expect(tree).not.toContain(advancedContent);
    // B must still reach the editor root, so the notice itself takes gamepad focus.
    expect(tree[0].type).toBe("Focusable");
  });

  it("uses Steam's native paged settings component when its source signature is found", async () => {
    mocks.findModuleExport.mockClear();
    vi.resetModules();
    let matcher: ((moduleExport: unknown) => boolean) | undefined;
    mocks.findModuleExport.mockImplementation((predicate: (moduleExport: unknown) => boolean) => {
      matcher = predicate;
      return mocks.nativeComponent;
    });

    const { EditorLayout: NativeLayout } = await import("./editorLayout");
    expect(mocks.findModuleExport).toHaveBeenCalledOnce();
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
      typeof entry === "string" ? entry : [entry.identifier, text(entry.title), entry.visible]))
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
    expect(detailsPage.icon).toBe(pageIcon);
    expect(text(detailsPage.title)).toBe("Details");
    const titleNodes = nodes(detailsPage.title);
    expect(titleNodes.findIndex((node) => node.props.className === dirtyDot))
      .toBeGreaterThan(titleNodes.findIndex((node) => node.props.className === tabLabel));
    expect(detailsPage.hideTitle).toBe(true);
    const advancedPage = received.pages.find((entry) =>
      typeof entry !== "string" && entry.identifier === "advanced") as Exclude<NativePageEntry, "separator">;
    expect(text(nodes(advancedPage.content).find((node) => node.type === "h2"))).toBe("Advanced");
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
