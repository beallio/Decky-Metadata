// Active focus-order inventory. Target: the Gaming Mode context.
//
// Walks the focusable controls in a subtree in DOM order, focuses each, and
// reports its label, rect, scroll margins, and whether it took Steam gamepad
// focus (gpfocus). Use it to audit labels and catch clipped/overlapping/off-
// screen controls after a layout change. It MOVES focus as a side effect.
//
// NOTE: DOM order is not guaranteed to equal Steam's gamepad navigation order.
// For the authoritative D-pad order, dispatch real arrow keys with
//   cdp.py input <target> down
// and read js/gpfocus_dump.js after each step. This probe is the static
// inventory; gpfocus_dump.js is the order oracle.
//
// Optional --var ROOT=<css> scopes the walk (default: whole document).
//   cdp.py eval "Steam Big Picture Mode" @scripts/deck/js/focus_order.js --var ROOT=".quickaccess-panel"
(async () => {
  const rootSel = "__ROOT__";
  const scope = rootSel.startsWith("__")
    ? document
    : document.querySelector(rootSel) || document;
  const candidates = [
    ...scope.querySelectorAll(
      "button, [role='button'], [role='checkbox'], [role='switch'], [tabindex]"
    ),
  ]
    .filter((el, index, items) => items.indexOf(el) === index)
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
  const className = (el) =>
    typeof el.className === "string" ? el.className : "";
  const label = (el) => {
    const text = (el.textContent || "").trim();
    if (text) return text.slice(0, 80);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      return (document.getElementById(labelledBy)?.textContent || "")
        .trim()
        .slice(0, 80);
    }
    return `${el.tagName}:${el.getAttribute("role") || el.getAttribute("type") || "control"}`;
  };
  const rows = [];
  for (const el of candidates) {
    el.focus({ focusVisible: true });
    // Let Steam's focus machinery apply gpfocus before we read it.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    rows.push({
      label: label(el),
      tag: el.tagName,
      role: el.getAttribute("role"),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      focused: el === document.activeElement,
      gpfocus: /(^|\s)gpfocus(\s|$)/.test(className(el)),
      scrollMarginTop: style.scrollMarginTop,
      scrollMarginBottom: style.scrollMarginBottom,
    });
  }
  return JSON.stringify({ count: rows.length, order: rows }, null, 2);
})();
