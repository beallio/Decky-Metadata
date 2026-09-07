// Read only the editor readiness state for a shortcut-name control.
// Target: Steam Big Picture Mode. Vars: __LABEL__.
(() => {
  const label = "__LABEL__".trim().toLowerCase();
  const visible = (node) => node.getClientRects().length > 0;
  const controls = [...document.querySelectorAll("button,[class*=Focusable],[tabindex]")]
    .filter(visible)
    .filter((node) => (node.textContent || "").trim().toLowerCase() === label);
  const control = controls.find((node) => !controls.some((other) => other !== node && node.contains(other)));
  if (control) {
    return JSON.stringify({ status: control.disabled ? "unavailable" : "ready", reason: control.disabled ? "control_disabled" : "control_ready" });
  }

  const text = document.body?.innerText || "";
  if (!text.includes("Shortcut name")) {
    return JSON.stringify({ status: "loading", reason: "panel_not_rendered" });
  }
  const unavailable = [
    ["Steam did not return an official name", "steam_name_unavailable"],
    ["Shortcut-name management is unavailable", "management_unavailable"],
    ["Steam's native shortcut-name API is unavailable", "native_api_unavailable"],
    ["Steam shortcut was not found", "shortcut_not_found"],
    ["This shortcut has a derived ID", "derived_shortcut_id"],
    ["Shortcut name already matches Steam", "name_already_matches"],
    ["changed outside Decky Metadata", "history_diverged"],
  ].find(([message]) => text.includes(message));
  if (unavailable) return JSON.stringify({ status: "unavailable", reason: unavailable[1] });
  return JSON.stringify({ status: "loading", reason: "metadata_or_backfill_pending" });
})()
