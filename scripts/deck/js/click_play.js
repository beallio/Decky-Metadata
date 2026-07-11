// Click the Play button via a real pointer-event sequence.
// Target: "Steam Big Picture Mode" (the DOM window). No vars.
//
// Picks the INNERMOST focusable whose exact text is "Play": ancestors of the
// button also have textContent "Play" when it is their only text, and
// clicking a non-interactive ancestor silently does nothing.
(async () => {
  const t0 = performance.now();
  let target = null;
  while (performance.now() - t0 < 5000) {
    const candidates = [...document.querySelectorAll("[class*=Focusable]")]
      .filter((el) => (el.textContent || "").trim() === "Play");
    target = candidates.find((el) => !candidates.some((o) => o !== el && el.contains(o)));
    if (target) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!target) return "FAIL: no Play button within 5s";
  const opts = { bubbles: true, cancelable: true, view: window };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    target.dispatchEvent(
      type.startsWith("pointer") ? new PointerEvent(type, opts) : new MouseEvent(type, opts)
    );
  }
  return "clicked Play at +" + Math.round(performance.now() - t0) + "ms";
})()
