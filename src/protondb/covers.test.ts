import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ findClassModule: vi.fn() }));
vi.mock("@decky/ui", () => ({
  afterPatch: vi.fn(),
  createModuleMapping: () => new Map(),
  findClassModule: native.findClassModule,
  findInReactTree: vi.fn(),
  Router: {},
}));
vi.mock("@decky/api", () => ({ fetchNoCors: vi.fn() }));
vi.mock("../backend", () => ({
  getProtonDbBadgeSettings: vi.fn(),
  getProviderCache: vi.fn(),
  putProtonDbCache: vi.fn(),
  setProtonDbBadgeSettings: vi.fn(),
}));
vi.mock("../steam/nativeCssClasses", () => ({ getNativeCssClass: () => undefined, subscribeNativeCssClasses: () => () => {} }));

import { buildCoverSelectors } from "./covers";

beforeEach(() => native.findClassModule.mockReset());

describe("ProtonDB cover selectors", () => {
  it("keeps classic selectors on a miss and retries when the library classes appear", () => {
    native.findClassModule.mockReturnValueOnce(undefined).mockReturnValue({
      LibraryItemBox: "_8yMpZzQWXLQ-",
      Draggable: "E6FHi-jyiIw-",
      LibraryItemIcons: "Hlk3M-NVptM-",
      LibraryItemOverlayInnerArea: "_2lU-ntI3l8M-",
    });

    const classic = buildCoverSelectors();
    expect(classic.cover).toBe("._1pwP4eeP1zQD7PEgmsep0W");
    expect(classic.footer).toBe("._3BPFqWN5T-x8njyrRYM1CX");
    expect(classic.overlay).toBe("._2GRcKrPZsMSF6glMPRMZei");

    const resolved = buildCoverSelectors();
    expect(native.findClassModule).toHaveBeenCalledTimes(2);
    expect(resolved.cover).toBe(".E6FHi-jyiIw-, ._1pwP4eeP1zQD7PEgmsep0W");
    expect(resolved.footer).toBe(".Hlk3M-NVptM-, ._3BPFqWN5T-x8njyrRYM1CX");
    expect(resolved.overlay).toBe("._2lU-ntI3l8M-, ._2GRcKrPZsMSF6glMPRMZei");
    expect(resolved.css).toContain("._8yMpZzQWXLQ-.gpfocus");
  });
});
