import { describe, expect, it, vi } from "vitest";
import { decideBIsModOrShortcut } from "./spoofDecision";

const base = {
  isPatchedNonSteam: true,
  originalRet: true,
  bypassCounter: 0,
  path: "/library/app/123456",
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

  it("in-call truth window outranks the home special case", () => {
    const d = decideBIsModOrShortcut({ ...base, bypassCounter: -1, path: "/library/home" });
    expect(d).toMatchObject({ finalRet: true, reason: "in-call-truth" });
  });

  it("spoofs false on a render-shield hit", () => {
    const d = decideBIsModOrShortcut({ ...base, consumeShield: () => true });
    expect(d).toMatchObject({ finalRet: false, reason: "render-shield", shieldConsulted: true, shieldHit: true });
  });

  it("spoofs false on the home route when the shield misses", () => {
    const d = decideBIsModOrShortcut({ ...base, path: "/library/home" });
    expect(d).toMatchObject({ finalRet: false, reason: "home-special-case", shieldConsulted: true, shieldHit: false });
  });

  it("spoofs false by default (normal-shortcut)", () => {
    const d = decideBIsModOrShortcut({ ...base });
    expect(d).toMatchObject({ finalRet: false, reason: "normal-shortcut", nextBypassCounter: 0 });
  });

  it("armed truth window decrements and yields truth until exhausted", () => {
    // Armed to 4 by GetPerClientData/BHasRecentlyLaunched: 3 truths, then spoof.
    let counter = 4;
    const results: Array<{ finalRet: any; reason: string }> = [];
    for (let i = 0; i < 4; i++) {
      const d = decideBIsModOrShortcut({ ...base, bypassCounter: counter });
      counter = d.nextBypassCounter;
      results.push({ finalRet: d.finalRet, reason: d.reason });
    }
    expect(results.map((r) => r.finalRet)).toEqual([true, true, true, false]);
    expect(results[3].reason).toBe("normal-shortcut");
    expect(counter).toBe(0);
  });

  it("render shield takes a hit before the armed window is spent", () => {
    const d = decideBIsModOrShortcut({ ...base, bypassCounter: 3, consumeShield: () => true });
    expect(d).toMatchObject({ finalRet: false, reason: "render-shield", nextBypassCounter: 3 });
  });
});
