// history.goBack() in the gamepad UI main window. Target: SharedJSContext. No vars.
(() => {
  const history =
    (window.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history) ??
    (window.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history);
  if (!history) return "FAIL: main window history not found";
  history.goBack();
  return "went back";
})()
