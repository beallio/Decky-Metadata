// Wrap SteamClient.Apps.RunGame to record every call. Target: SharedJSContext.
// Note: some launch paths use a captured reference and bypass the wrapper, so
// an empty call list is NOT proof no launch happened — check RunningApps too.
(() => {
  if (window.__dmRunGame) return "already installed";
  const orig = SteamClient.Apps.RunGame;
  window.__dmRunGame = { calls: [], orig };
  SteamClient.Apps.RunGame = function (...args) {
    window.__dmRunGame.calls.push(args.map(String));
    return orig.apply(this, args);
  };
  return "RunGame tracer installed";
})()
