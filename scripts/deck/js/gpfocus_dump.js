// Read-only gamepad-focus snapshot. Target: the Gaming Mode context
// ("Steam Big Picture Mode" for QAM/full-screen UI, or "SharedJSContext").
//
// Reports document.activeElement and every element currently carrying Steam's
// gamepad-focus class (gpfocus) with its label and rect, WITHOUT moving focus.
// This is the authoritative "what is selected right now" probe: pair it with
//   cdp.py input <target> down
// to confirm initial focus on a fresh panel entry and to trace real D-pad order
// one step at a time. Optional --var ROOT=<css> limits the scan to a subtree.
//
//   cdp.py eval "Steam Big Picture Mode" @scripts/deck/js/gpfocus_dump.js
//   cdp.py eval "Steam Big Picture Mode" @scripts/deck/js/gpfocus_dump.js --var ROOT=".quickaccess-panel"
(() => {
  const rootSel = "__ROOT__";
  const scope = rootSel.startsWith("__")
    ? document
    : document.querySelector(rootSel) || document;
  const className = (el) =>
    typeof el.className === "string" ? el.className : "";
  const hasGpFocus = (el) => /(^|\s)gpfocus(\s|$)/.test(className(el));
  const label = (el) => {
    if (!el) return null;
    const text = (el.textContent || "").trim();
    if (text) return text.slice(0, 80);
    const labelledBy = el.getAttribute && el.getAttribute("aria-labelledby");
    if (labelledBy) {
      return (document.getElementById(labelledBy)?.textContent || "")
        .trim()
        .slice(0, 80);
    }
    const role = el.getAttribute && el.getAttribute("role");
    return `${el.tagName}${role ? ":" + role : ""}`;
  };
  const describe = (el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      label: label(el),
      tag: el.tagName,
      role: el.getAttribute && el.getAttribute("role"),
      className: className(el),
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };
  const gp = [...scope.querySelectorAll("*")].filter(hasGpFocus);
  return JSON.stringify(
    {
      activeElement: describe(document.activeElement),
      gpfocusCount: gp.length,
      gpfocus: gp.map(describe),
    },
    null,
    2
  );
})();
