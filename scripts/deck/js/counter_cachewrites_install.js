// Count appDetailsCache.SetCachedDataForApp calls (the re-render churn the
// gameinfo-focus-reset fix eliminates). Target: SharedJSContext.
(() => {
  if (window.__dmCacheWrites) {
    window.__dmCacheWrites.base = window.__dmCacheWrites.calls.length;
    return "already installed; base reset to " + window.__dmCacheWrites.base;
  }
  const orig = appDetailsCache.SetCachedDataForApp.bind(appDetailsCache);
  window.__dmCacheWrites = { calls: [], base: 0, orig };
  appDetailsCache.SetCachedDataForApp = (appid, key, version, data) => {
    window.__dmCacheWrites.calls.push({ t: Math.round(performance.now()), appid, key });
    return orig(appid, key, version, data);
  };
  return "cache-write counter installed";
})()
