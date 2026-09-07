// Read only the readiness state for the latest visible shortcut-name modal control.
// Target: Steam Big Picture Mode. Vars: __LABEL__.
(() => {
  const label = "__LABEL__".trim().toLowerCase();
  const visible = (node) => node.getClientRects().length > 0;
  const dialog = [...document.querySelectorAll('[role="dialog"], .Dialog, [class*=Modal]')]
    .filter(visible)
    .at(-1);
  if (!dialog) return JSON.stringify({ status: "loading", reason: "modal_not_rendered" });
  const controls = [...dialog.querySelectorAll("button,[class*=Focusable],[tabindex]")]
    .filter(visible)
    .filter((node) => (node.textContent || "").trim().toLowerCase() === label);
  const control = controls.find((node) => !controls.some((other) => other !== node && node.contains(other)));
  if (!control) return JSON.stringify({ status: "unavailable", reason: "modal_control_absent" });
  return JSON.stringify({ status: control.disabled ? "unavailable" : "ready", reason: control.disabled ? "modal_control_disabled" : "modal_control_ready" });
})()
