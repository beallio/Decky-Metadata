// Dump RunGame calls + running apps, and RESTORE the original RunGame.
// Target: SharedJSContext.
(() => {
  const t = window.__dmRunGame;
  if (!t) return JSON.stringify({ error: "tracer not installed" });
  SteamClient.Apps.RunGame = t.orig;
  delete window.__dmRunGame;
  return JSON.stringify({
    runGameCalls: t.calls,
    running: SteamUIStore.RunningApps.map((a) => ({ appid: a.appid, name: a.display_name, gameid: String(a.gameid ?? "") })),
  });
})()
