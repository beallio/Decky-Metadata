// General device-state probe. Target: SharedJSContext. No vars.
(() => {
  const shortcuts = appStore.allApps.filter((a) => a.app_type === 1073741824);
  return JSON.stringify({
    deckyLoaded: typeof window.DeckyPluginLoader !== "undefined",
    dflLoaded: typeof window.DFL !== "undefined",
    totalApps: appStore.allApps.length,
    shortcutCount: shortcuts.length,
    running: SteamUIStore.RunningApps.map((a) => ({ appid: a.appid, name: a.display_name })),
  });
})()
