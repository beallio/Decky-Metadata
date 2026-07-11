// Report cache writes since the last install/base-reset. Target: SharedJSContext.
// Vars: __RESTORE__ ("yes" to also remove the counter; anything else keeps it)
(() => {
  const c = window.__dmCacheWrites;
  if (!c) return JSON.stringify({ error: "counter not installed" });
  const sinceBase = c.calls.slice(c.base);
  if ("__RESTORE__" === "yes") {
    appDetailsCache.SetCachedDataForApp = c.orig;
    delete window.__dmCacheWrites;
  }
  return JSON.stringify({ total: c.calls.length, sinceBase: sinceBase.length, calls: sinceBase });
})()
