import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findModuleExport: vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: mocks.findModuleExport }));

describe("resolveNativePagedSettings", () => {
  beforeEach(() => mocks.findModuleExport.mockReset());

  it("matches Steam's paged settings adapter source signature", async () => {
    let matcher: ((moduleExport: unknown) => boolean) | undefined;
    mocks.findModuleExport.mockImplementation((predicate: (moduleExport: unknown) => boolean) => {
      matcher = predicate;
      return undefined;
    });

    const { resolveNativePagedSettings } = await import("./nativePagedSettings");
    expect(resolveNativePagedSettings()).toBeNull();
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
  });
});
