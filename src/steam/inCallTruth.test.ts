import { describe, expect, it } from "vitest";
import { withInCallTruth } from "./inCallTruth";

describe("withInCallTruth", () => {
  it("preserves the outer truth window across a nested invocation", () => {
    const state = { bypassCounter: 7 };

    const result = withInCallTruth(state, () => {
      expect(state.bypassCounter).toBe(-1);
      const nested = withInCallTruth(state, () => {
        expect(state.bypassCounter).toBe(-1);
        return "nested";
      });
      expect(nested).toBe("nested");
      expect(state.bypassCounter).toBe(-1);
      return "outer";
    });

    expect(result).toBe("outer");
    expect(state.bypassCounter).toBe(7);
  });

  it("restores the prior counter when the wrapped function throws", () => {
    const state = { bypassCounter: 3 };

    expect(() =>
      withInCallTruth(state, () => {
        expect(state.bypassCounter).toBe(-1);
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(state.bypassCounter).toBe(3);
  });
});
