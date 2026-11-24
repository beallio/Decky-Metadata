import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SettingsLayoutPage, SettingsLayoutProps } from "./settingsLayout";

const mocks = vi.hoisted(() => ({
  findModuleExport: vi.fn(),
  nativeComponent: vi.fn(),
  navigate: vi.fn(),
  memo: undefined as { dependencies: readonly unknown[]; value: unknown } | undefined,
}));
vi.mock("@decky/ui", () => ({
  DialogBody: "DialogBody",
  DialogHeader: "DialogHeader",
  ScrollPanelGroup: "ScrollPanelGroup",
  findModuleExport: mocks.findModuleExport,
  Navigation: { Navigate: mocks.navigate, NavigateBack: mocks.navigate },
}));
// Cache like React does so the test can check that page descriptors stay stable.
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

type NodeProps = { children?: ReactNode; value?: SettingsLayoutPage[] };
type NativePage = { identifier: string; title: ReactNode; visible: boolean; hideTitle: boolean; content: ReactNode };
type NativeProps = {
  pages: (NativePage | "separator")[];
  page: string;
  onPageRequested(identifier: string): void;
  showTitle?: boolean;
};

const icon = <span>icon</span>;
const pages: SettingsLayoutPage[] = [
  { id: "metadata", label: "Metadata", icon, content: <div>Scan</div> },
  { id: "logs", label: "Logs", icon, separatorBefore: true, content: <div>Logs body</div> },
];

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

const load = async (native: boolean) => {
  vi.resetModules();
  mocks.memo = undefined;
  mocks.findModuleExport.mockReturnValue(native ? mocks.nativeComponent : undefined);
  // The resolver runs at module load, so each case imports a fresh module.
  return (await import("./settingsLayout")).SettingsLayout;
};

const render = (layout: (props: SettingsLayoutProps) => JSX.Element, overrides: Partial<SettingsLayoutProps> = {}) =>
  nodes(layout({ pages, page: "metadata", onPageRequested: vi.fn(), ...overrides }));

describe("SettingsLayout", () => {
  it("gives Steam's native paged settings stable pages with no title, and changes page without a route call", async () => {
    const layout = await load(true);
    const onPageRequested = vi.fn();
    const native = render(layout, { onPageRequested }).find((node) => node.type === mocks.nativeComponent)!;
    const received = native.props as unknown as NativeProps;

    expect(received.showTitle).toBe(false);
    expect(received.pages.map((entry) => typeof entry === "string" ? entry : [entry.identifier, text(entry.title), entry.visible]))
      .toEqual([["metadata", "Metadata", true], "separator", ["logs", "Logs", true]]);
    const logsPage = received.pages[2] as NativePage;
    expect(text(nodes(logsPage.content).find((node) => node.type === "DialogHeader"))).toBe("Logs");

    received.onPageRequested("logs");
    expect(onPageRequested).toHaveBeenCalledExactlyOnceWith("logs");
    expect(mocks.navigate).not.toHaveBeenCalled();

    // A body re-render (for example scan progress) keeps the descriptors; the context carries the new node.
    const nextPages = pages.map((page) => page.id === "metadata" ? { ...page, content: <div>Scan 50%</div> } : page);
    const updated = render(layout, { pages: nextPages });
    expect((updated.find((node) => node.type === mocks.nativeComponent)!.props as unknown as NativeProps).pages)
      .toBe(received.pages);
    expect(updated.find((node) => node.props.value === nextPages)).toBeDefined();
  });

  it("renders every page in one scrolling list when Steam's component is not found", async () => {
    const layout = await load(false);
    const tree = render(layout);

    expect(tree[0].type).toBe("ScrollPanelGroup");
    expect(tree.filter((node) => node.type === "DialogHeader").map(text)).toEqual(["Metadata", "Logs"]);
    expect(text(tree)).toContain("Logs body");
  });
});
