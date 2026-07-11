// Terminate a running app by 64-bit gameid. Target: SharedJSContext. Vars: __GAMEID__
(() => {
  SteamClient.Apps.TerminateApp("__GAMEID__", false);
  return "terminate sent for __GAMEID__";
})()
