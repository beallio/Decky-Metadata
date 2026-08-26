import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AFFLICTED_CONTROLLER_TYPES,
  formatConnectedControllerTypes,
  LEGION_GO_S_CONTROLLER_TYPE,
  STEAM_DECK_CONTROLLER_TYPE,
  controllerTypeForIndex,
  getConnectedControllerTypes,
  sourceFilterForControllerType,
} from "./controllerTypes";

describe("controllerTypeForIndex", () => {
  const makeStore = (getControllers: () => unknown) => ({
    ControllerStore: { GetControllers: vi.fn(getControllers) },
  });

  beforeEach(() => {
    vi.stubGlobal(
      "ControllerStore",
      undefined,
    );
    vi.stubGlobal("controllerStore", undefined);
  });

  it("resolves type 4 and 102 from the queried controller index", () => {
    const store = makeStore(() => [
      { nControllerIndex: 0, eControllerType: STEAM_DECK_CONTROLLER_TYPE },
      { nControllerIndex: 1, eControllerType: LEGION_GO_S_CONTROLLER_TYPE },
    ]);
    expect(controllerTypeForIndex(0, store)).toBe(STEAM_DECK_CONTROLLER_TYPE);
    expect(controllerTypeForIndex(1, store)).toBe(LEGION_GO_S_CONTROLLER_TYPE);
  });

  it("prefers uppercase ControllerStore before fallback controllerStore", () => {
    const upper = makeStore(() => [
      { nControllerIndex: 7, eControllerType: LEGION_GO_S_CONTROLLER_TYPE },
    ]);
    const lower = {
      controllerStore: {
        GetControllers: vi.fn(() => [{ nControllerIndex: 7, eControllerType: STEAM_DECK_CONTROLLER_TYPE }]),
      },
    };
    const result = controllerTypeForIndex(7, { ...upper, ...lower });
    expect(result).toBe(LEGION_GO_S_CONTROLLER_TYPE);
  });

  it("returns null for malformed query inputs or missing values", () => {
    const store = makeStore(() => [{ nControllerIndex: 0, eControllerType: STEAM_DECK_CONTROLLER_TYPE }]);
    expect(controllerTypeForIndex("0" as unknown, store)).toBeNull();
    expect(controllerTypeForIndex(NaN, store)).toBeNull();
    expect(controllerTypeForIndex(1, store)).toBeNull();
  });

  it("returns null when controller records are malformed or unreadable", () => {
    expect(
      controllerTypeForIndex(0, {
        ControllerStore: {
          GetControllers: vi.fn(() => [{ index: 0, type: STEAM_DECK_CONTROLLER_TYPE }, { nControllerIndex: "0", eControllerType: "4" }]),
        },
      }),
    ).toBeNull();
    expect(
      controllerTypeForIndex(0, {
        controllerStore: {
          GetControllers: vi.fn(() => {
            throw new Error("controller list unavailable");
          }),
        },
      }),
    ).toBeNull();
  });
});

describe("getConnectedControllerTypes", () => {
  it("returns sorted unique types from the connected controller records", () => {
    const store = {
      controllerStore: {
        GetControllers: vi.fn(() => [
          { nControllerIndex: 1, eControllerType: LEGION_GO_S_CONTROLLER_TYPE },
          { nControllerIndex: 0, eControllerType: STEAM_DECK_CONTROLLER_TYPE },
          { nControllerIndex: 2, eControllerType: LEGION_GO_S_CONTROLLER_TYPE },
          { nControllerIndex: 3, eControllerType: undefined },
        ]),
      },
    };
    expect(getConnectedControllerTypes(store)).toEqual([
      STEAM_DECK_CONTROLLER_TYPE,
      LEGION_GO_S_CONTROLLER_TYPE,
    ]);
  });

  it("returns an empty list when no controller metadata is readable", () => {
    expect(getConnectedControllerTypes({} as any)).toEqual([]);
    expect(getConnectedControllerTypes({ controllerStore: { GetControllers: () => null } } as any)).toEqual([]);
    expect(
      getConnectedControllerTypes({
        ControllerStore: { GetControllers: vi.fn(() => {
          throw new Error("boom");
        }) },
      } as any),
    ).toEqual([]);
    expect(getConnectedControllerTypes({
      ControllerStore: {
        GetControllers: vi.fn(() => ({ values: () => [] })),
      },
    } as any)).toEqual([]);
  });
});

describe("sourceFilterForControllerType", () => {
  it("preserves requested filters for unaffected controller types", () => {
    expect(sourceFilterForControllerType(STEAM_DECK_CONTROLLER_TYPE, true)).toBe(true);
    expect(sourceFilterForControllerType(999, true)).toBe(true);
    expect(sourceFilterForControllerType(null, true)).toBe(true);
    expect(sourceFilterForControllerType(0, false)).toBe(false);
  });

  it("forces false only for affected types", () => {
    expect(sourceFilterForControllerType(LEGION_GO_S_CONTROLLER_TYPE, true)).toBe(false);
    for (const type of [STEAM_DECK_CONTROLLER_TYPE, 999, 0]) {
      expect(sourceFilterForControllerType(type, false)).toBe(false);
    }
    for (const type of AFFLICTED_CONTROLLER_TYPES) {
      expect(sourceFilterForControllerType(type, true)).toBe(false);
    }
  });
});

describe("formatConnectedControllerTypes", () => {
  it("renders known and unknown types in stable order", () => {
    expect(formatConnectedControllerTypes([LEGION_GO_S_CONTROLLER_TYPE, STEAM_DECK_CONTROLLER_TYPE]))
      .toBe("Steam Deck (4), Legion Go S (102)");
    expect(formatConnectedControllerTypes([999, 1])).toBe("Type 1, Type 999");
    expect(formatConnectedControllerTypes([999, STEAM_DECK_CONTROLLER_TYPE, 1])).toBe(
      "Type 1, Steam Deck (4), Type 999",
    );
    expect(formatConnectedControllerTypes([102, 4, 102])).toBe(
      "Steam Deck (4), Legion Go S (102)",
    );
  });

  it("renders Unknown for unavailable data", () => {
    expect(formatConnectedControllerTypes([])).toBe("Unknown");
    expect(formatConnectedControllerTypes(null)).toBe("Unknown");
    expect(formatConnectedControllerTypes(undefined)).toBe("Unknown");
  });
});
