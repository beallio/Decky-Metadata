// Performance probe. Target: SharedJSContext.
// Vars: __MODE__ (gameview | rpc), __APPID__ (gameview), __WINDOW_MS__ (gameview,
// default 3000), __RPC_REPEAT__ (rpc: get_provider_cache calls, default 20).
//
// gameview: navigate to /library/app/<APPID> and report, relative to the
// navigation call, when the native InnerContainer, the HLTB row
// (#decky-metadata-hltb), the ProtonDB game-view button and the Play section
// first appear, plus every long task (>50 ms) and the number of Loader HTTP
// proxy requests (fetchNoCors) made in the window.
// rpc: time plugin RPCs with performance.now() (get_metadata x1000,
// get_all_metadata x200, get_provider_cache x RPC_REPEAT).
// Returns one JSON string.
(async () => {
  const MODE = "__MODE__";
  const PLUGIN_NAME = "Decky Metadata";
  const LOADER_API = "__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit";
  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && !String(value).startsWith("__") ? parsed : fallback;
  };
  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null;
    return { count: sorted.length, median: at(0.5), p95: at(0.95), max: sorted.length ? sorted[sorted.length - 1] : null };
  };
  const connectApi = () => {
    const loader = window[LOADER_API];
    if (typeof loader?.connect !== "function") throw new Error("Loader plugin API is unavailable");
    let api = null;
    try { api = loader.connect.call(loader, 2, PLUGIN_NAME); } catch (_) { api = null; }
    if (typeof api?.call !== "function") api = loader.connect.call(loader, 1, PLUGIN_NAME);
    if (typeof api?.call !== "function") throw new Error("plugin-scoped RPC API is unavailable");
    return api;
  };

  if (MODE === "rpc") {
    const api = connectApi();
    const timed = async (method, args, times) => {
      const samples = [];
      for (let index = 0; index < times; index += 1) {
        const start = performance.now();
        await api.call.call(api, method, ...args);
        samples.push(performance.now() - start);
      }
      return stats(samples);
    };
    const all = await api.call.call(api, "get_all_metadata");
    const firstId = Number(Object.keys(all || {})[0] || 0);
    const result = {
      mode: "rpc",
      records: Object.keys(all || {}).length,
      get_metadata: await timed("get_metadata", [firstId], 1000),
      get_all_metadata: await timed("get_all_metadata", [], 200),
    };
    // Builds without the provider cache report only the metadata timings.
    try {
      const cache = await api.call.call(api, "get_provider_cache");
      result.cacheSizes = {
        ratings: Object.keys(cache?.protondb?.ratings || {}).length,
        name_ids: Object.keys(cache?.protondb?.name_ids || {}).length,
        hltb: Object.keys(cache?.hltb?.entries || {}).length,
      };
      const repeat = number("__RPC_REPEAT__", 20);
      result.get_provider_cache = await timed("get_provider_cache", [], repeat);
      // An empty merge still rewrites the file, so this times one cache save.
      result.put_protondb_cache = await timed("put_protondb_cache", [{}, {}], repeat);
    } catch (error) {
      result.providerCache = `unavailable: ${error?.message ?? error}`;
    }
    return JSON.stringify(result);
  }

  if (MODE !== "gameview") return JSON.stringify({ error: `unknown mode ${MODE}` });
  const appId = number("__APPID__", 0);
  const windowMs = number("__WINDOW_MS__", 3000);
  if (!appId) return JSON.stringify({ error: "APPID is required" });
  const ui = window.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_BrowserWindow?.document
    ?? window.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_BrowserWindow?.document;
  if (!ui?.body) return JSON.stringify({ error: "Big Picture document unavailable" });
  const classes = window.DFL ?? {};
  const inner = classes.appDetailsClasses?.InnerContainer;
  const play = classes.appActionButtonClasses?.PlayButtonContainer ?? classes.appActionButtonClasses?.PlayButton;
  const selectors = {
    innerContainer: inner ? `.${inner}` : null,
    hltbRow: "#decky-metadata-hltb",
    protondbButton: '[aria-label^="ProtonDB: "]',
    playSection: play ? `.${play}` : null,
  };

  const longTasks = [];
  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: "longtask", buffered: false });
  } catch (_) {
    observer = null;
  }

  // fetchNoCors goes through the Loader's local HTTP proxy with the page's fetch.
  const originalFetch = window.fetch;
  const proxied = [];
  window.fetch = function (...args) {
    const url = String(args[0]?.url ?? args[0] ?? "");
    if (/127\.0\.0\.1:1337|localhost:1337/.test(url)) proxied.push(decodeURIComponent(url).replace(/[?&](auth|token)=[^&]*/g, ""));
    return originalFetch.apply(this, args);
  };

  const seen = {};
  // Elements of the page we navigate away from must not count as this page's.
  const previous = Object.fromEntries(Object.entries(selectors).map(([name, selector]) =>
    [name, new Set(selector ? ui.querySelectorAll(selector) : [])]));
  const start = performance.now();
  const check = () => {
    const now = performance.now() - start;
    for (const [name, selector] of Object.entries(selectors)) {
      if (!selector || seen[name] !== undefined) continue;
      if ([...ui.querySelectorAll(selector)].some((element) => !previous[name].has(element))) seen[name] = now;
    }
  };
  const mutation = new (ui.defaultView?.MutationObserver ?? MutationObserver)(check);
  mutation.observe(ui.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-label"] });
  try {
    window.DFL?.Navigation?.Navigate?.(`/library/app/${appId}`);
    check();
    await new Promise((resolve) => setTimeout(resolve, windowMs));
    check();
  } finally {
    mutation.disconnect();
    observer?.disconnect();
    window.fetch = originalFetch;
  }
  const windowTasks = longTasks.filter((task) => task.start >= start).map((task) => ({
    startMs: Math.round(task.start - start), durationMs: Math.round(task.duration),
  }));
  const relative = (name) => seen[name] === undefined || seen.innerContainer === undefined ? null : seen[name] - seen.innerContainer;
  return JSON.stringify({
    mode: "gameview",
    appId,
    windowMs,
    longTaskSupported: observer !== null,
    firstSeenMs: seen,
    afterInnerContainerMs: { hltbRow: relative("hltbRow"), protondbButton: relative("protondbButton"), playSection: relative("playSection") },
    longTasks: windowTasks,
    longTaskTotalMs: windowTasks.reduce((sum, task) => sum + task.durationMs, 0),
    loaderHttpRequests: proxied.length,
    loaderHttpTargets: proxied.map((url) => url.slice(0, 160)),
  });
})()
