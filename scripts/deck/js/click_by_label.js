// Click a focusable / tab / button by case-insensitive exact visible text.
// Target: "Steam Big Picture Mode". Vars: __LABEL__
//
// Generalizes click_play.js (which is Play-specific): picks the INNERMOST
// element whose trimmed textContent case-insensitively equals __LABEL__, so a
// tab label like "Community" (CSS-uppercased to "COMMUNITY") is matched by its
// real text. Waits up to 4s for the element to appear.
(async () => {
  const want = "__LABEL__".trim().toLowerCase();
  const sel = "[class*=Focusable],[role=tab],button,[tabindex],a";
  const t0 = performance.now();
  let target = null;
  while (performance.now() - t0 < 4000) {
    const cands = [...document.querySelectorAll(sel)]
      .filter((el) => (el.textContent || "").trim().toLowerCase() === want);
    target = cands.find((el) => !cands.some((o) => o !== el && el.contains(o)));
    if (target) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!target) {
    const leaves = [...document.querySelectorAll("*")].filter(
      (el) => (el.textContent || "").trim().toLowerCase() === want && !el.querySelector("*")
    );
    target = leaves[0];
  }
  if (!target) return "FAIL: no element with text __LABEL__";
  target.focus && target.focus();
  const o = { bubbles: true, cancelable: true, view: window };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    target.dispatchEvent(
      type.startsWith("pointer") ? new PointerEvent(type, o) : new MouseEvent(type, o)
    );
  }
  return "clicked __LABEL__ (tag=" + target.tagName + ")";
})()
