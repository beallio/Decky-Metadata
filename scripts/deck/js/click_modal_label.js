// Click an exact text label only inside the latest visible Decky confirmation modal.
// Target: Steam Big Picture Mode. Vars: __LABEL__.
(async () => {
  const wanted = "__LABEL__".trim().toLowerCase();
  const start = performance.now();
  let target = null;
  while (performance.now() - start < 4000) {
    const dialogs = [...document.querySelectorAll('[role="dialog"], .Dialog, [class*=Modal]')]
      .filter((node) => node.getClientRects().length > 0);
    const dialog = dialogs.at(-1);
    if (dialog) {
      const candidates = [...dialog.querySelectorAll('button,[class*=Focusable],[tabindex]')]
        .filter((node) => (node.textContent || "").trim().toLowerCase() === wanted);
      target = candidates.find((node) => !candidates.some((other) => other !== node && node.contains(other)));
    }
    if (target) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!target) return "FAIL: editor never exposed expected control";
  target.focus?.();
  const options = { bubbles: true, cancelable: true, view: window };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    target.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, options) : new MouseEvent(type, options));
  }
  return `clicked modal ${wanted}`;
})()
