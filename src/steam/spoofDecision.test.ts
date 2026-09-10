import { describe, expect, it, vi } from "vitest";
import { decideBIsModOrShortcut } from "./spoofDecision";

const base = {
  isPatchedNonSteam: true,
  originalRet: true,
  bypassCounter: 0,
  hasCache: true,
  path: "/library/app/123456",
  isCurrentMatchedRenderRoute: true,
  consumeShield: () => false,
};

describe("decideBIsModOrShortcut", () => {
  it("passes through non-non-Steam apps without consulting the shield", () => {
    const consumeShield = vi.fn(() => true);
    const d = decideBIsModOrShortcut({ ...base, isPatchedNonSteam: false, originalRet: "native", consumeShield });
    expect(d).toMatchObject({ finalRet: "native", reason: "not-nonsteam", shieldConsulted: false });
    expect(consumeShield).not.toHaveBeenCalled();
  });

  it("passes through when the original already says not-a-shortcut", () => {
    const d = decideBIsModOrShortcut({ ...base, originalRet: false });
    expect(d).toMatchObject({ finalRet: false, reason: "original-not-shortcut", shieldConsulted: false });
  });

  // The 2026-07-11 launch regression: GetGameID/GetPrimaryAppID force in-call
  // truth via bypassCounter = -1, but the render shield was consulted first
  // and spoofed the internal check — so GetGameID returned a plain-appid
  // gameid and RunGame silently dropped the launch. The in-call window must
  // win outright and must not consume shield budget.
  it("in-call truth window outranks the render shield and never consumes it", () => {
    const consumeShield = vi.fn(() => true); // shield armed and would hit
    const d = decideBIsModOrShortcut({ ...base, bypassCounter: -1, consumeShield });
    expect(d).toMatchObject({
      finalRet: true,
      reason: "in-call-truth",
      shieldConsulted: false,
      shieldHit: false,
      nextBypassCounter: -1,
    });
    expect(consumeShield).not.toHaveBeenCalled();
  });

  it("in-call truth window outranks outside-detail pass-through", () => {
    const d = decideBIsModOrShortcut({ ...base, bypassCounter: -1, isCurrentMatchedRenderRoute: false });
    expect(d).toMatchObject({ finalRet: true, reason: "in-call-truth" });
  });

  it("passes through uncached apps when idle", () => {
    const consumeShield = vi.fn(() => true);
    const d = decideBIsModOrShortcut({ ...base, hasCache: false, consumeShield });
    expect(d).toMatchObject({
      finalRet: true,
      reason: "not-matched",
      shieldConsulted: false,
      nextBypassCounter: 0,
    });
    expect(consumeShield).not.toHaveBeenCalled();
  });

  it("uncached passthrough outranks the render shield", () => {
    const consumeShield = vi.fn(() => true);
    const d = decideBIsModOrShortcut({ ...base, hasCache: false, consumeShield });
    expect(d).toMatchObject({ finalRet: true, reason: "not-matched", shieldConsulted: false });
    expect(consumeShield).not.toHaveBeenCalled();
  });

  it("uncached passthrough outside a detail route does not spoof", () => {
    const d = decideBIsModOrShortcut({ ...base, hasCache: false, isCurrentMatchedRenderRoute: false });
    expect(d).toMatchObject({ finalRet: true, reason: "not-matched" });
  });

  it("uncached passthrough ignores an armed truth window", () => {
    const d = decideBIsModOrShortcut({ ...base, hasCache: false, bypassCounter: 4 });
    expect(d).toMatchObject({ finalRet: true, reason: "not-matched", nextBypassCounter: 4 });
  });

  it("in-call truth still wins for uncached apps", () => {
    const d = decideBIsModOrShortcut({ ...base, hasCache: false, bypassCounter: -1 });
    expect(d).toMatchObject({ finalRet: true, reason: "in-call-truth", nextBypassCounter: -1 });
  });

  it("spoofs false on a render-shield hit", () => {
    const d = decideBIsModOrShortcut({ ...base, consumeShield: () => true });
    expect(d).toMatchObject({ finalRet: false, reason: "render-shield", shieldConsulted: true, shieldHit: true });
  });

  it("uses an authoritative re-entry shield while editor route tokens are stale", () => {
    const consumeShield = vi.fn(() => true);
    const d = decideBIsModOrShortcut({
      ...base,
      isCurrentMatchedRenderRoute: false,
      canRecoverStaleRoute: true,
      consumeShield,
    });
    expect(d).toMatchObject({ finalRet: false, reason: "render-shield", shieldConsulted: true, shieldHit: true });
    expect(consumeShield).toHaveBeenCalledOnce();
  });

  it.each(["a different matched app", "a Home, controller, or collection route"])(
    "keeps armed truth native for %s outside the current matched render",
    () => {
      const consumeShield = vi.fn(() => true);
      const d = decideBIsModOrShortcut({ ...base, bypassCounter: 4, isCurrentMatchedRenderRoute: false, consumeShield });
      expect(d).toMatchObject({
        finalRet: true,
        reason: "outside-current-detail",
        shieldConsulted: false,
        shieldHit: false,
        nextBypassCounter: 4,
      });
      expect(consumeShield).not.toHaveBeenCalled();
    }
  );

  it("keeps a different shortcut native while another matched detail is active", () => {
    const consumeShield = vi.fn(() => true);
    const d = decideBIsModOrShortcut({ ...base, isCurrentMatchedRenderRoute: false, consumeShield });
    expect(d).toMatchObject({ finalRet: true, reason: "outside-current-detail", shieldConsulted: false });
    expect(consumeShield).not.toHaveBeenCalled();
  });

  it("spoofs false by default (normal-shortcut)", () => {
    const d = decideBIsModOrShortcut({ ...base });
    expect(d).toMatchObject({ finalRet: false, reason: "normal-shortcut", nextBypassCounter: 0 });
  });

  it("keeps the current matched render spoofed when an armed truth window outlives the shield", () => {
    const consumeShield = vi.fn(() => false); // absent or exhausted
    const d = decideBIsModOrShortcut({ ...base, bypassCounter: 4, consumeShield });
    expect(d).toMatchObject({
      finalRet: false,
      reason: "render-route-truth-window",
      shieldConsulted: true,
      shieldHit: false,
      nextBypassCounter: 4,
    });
    expect(consumeShield).toHaveBeenCalledOnce();
  });

  it("render shield takes a hit before the armed window is spent", () => {
    const d = decideBIsModOrShortcut({ ...base, bypassCounter: 3, consumeShield: () => true });
    expect(d).toMatchObject({ finalRet: false, reason: "render-shield", nextBypassCounter: 3 });
  });
});
