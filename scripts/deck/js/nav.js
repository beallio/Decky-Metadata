// Navigate the gamepad UI. Target: SharedJSContext. Vars: __ROUTE__
(() => {
  const nav = window.DFL?.Navigation;
  if (!nav) return "FAIL: DFL.Navigation unavailable (Decky not loaded?)";
  nav.Navigate("__ROUTE__");
  return "navigated: __ROUTE__";
})()
