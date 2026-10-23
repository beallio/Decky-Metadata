(() => {
  "use strict";

  const PLUGIN_NAME = "Decky Metadata";
  const LOADER_API = "__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit";
  const CALL_TIMEOUT_MS = 30000;
  const WORKLOADS = [
    ["get_metadata_hit", "get_metadata", 1000],
    ["get_metadata_miss", "get_metadata", 1000],
    ["get_missing_metadata_count", "get_missing_metadata_count", 1000],
    ["get_all_metadata", "get_all_metadata", 200],
  ];

  function validateFixtureRecord(value, expected) {
    if (!value || typeof value !== "object" ||
        (expected.appid !== undefined && value.appid !== expected.appid) ||
        value.id !== expected.id || value.title !== expected.title || value.source !== "Manual" ||
        value.steam_store_state !== "unknown" || value.description !== expected.description ||
        value.short_description !== expected.short_description ||
        value.release_date !== expected.release_date ||
        !Array.isArray(value.screenshots) || value.screenshots.length !== 4 ||
        !Array.isArray(expected.screenshots) || expected.screenshots.length !== 4 ||
        !Array.isArray(value.steam_news) || value.steam_news.length !== 6 ||
        !Array.isArray(expected.steam_news) || expected.steam_news.length !== 6) {
      throw new Error("RPC returned a mismatched deterministic fixture record");
    }
    const screenshotFields = ["id", "url", "caption", "width", "height"];
    for (let index = 0; index < 4; index += 1) {
      const actual = value.screenshots[index];
      const wanted = expected.screenshots[index];
      if (!actual || !wanted || !wanted.url.startsWith("https://") ||
          screenshotFields.some((field) => actual[field] !== wanted[field])) {
        throw new Error(`RPC changed deterministic screenshot row ${index}`);
      }
    }
    const newsFields = [
      "id", "gid", "news_id", "announcement_gid", "event_gid", "event_type", "type",
      "title", "url", "summary", "body", "raw_body", "image", "author", "feedLabel", "date",
    ];
    for (let index = 0; index < 6; index += 1) {
      const actual = value.steam_news[index];
      const wanted = expected.steam_news[index];
      if (!actual || !wanted || !wanted.url.startsWith("https://") ||
          wanted.raw_body.length !== 256 ||
          newsFields.some((field) => actual[field] !== wanted[field]) ||
          JSON.stringify(actual.image_sources) !== JSON.stringify(wanted.image_sources)) {
        throw new Error(`RPC changed deterministic news row ${index}`);
      }
    }
    return true;
  }

  function validateResult(method, value, expected) {
    if (method === "get_metadata_hit") {
      validateFixtureRecord(value, expected.record);
    } else if (method === "get_metadata_miss") {
      if (value !== null) throw new Error("get_metadata miss did not return null");
    } else if (method === "get_missing_metadata_count") {
      if (!Number.isSafeInteger(value) || value !== expected.missing) {
        throw new Error(`get_missing_metadata_count returned ${String(value)}, expected ${expected.missing}`);
      }
    } else if (method === "get_all_metadata") {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.keys(value).length !== expected.size ||
          expected.records.length !== expected.size) {
        throw new Error("get_all_metadata returned an incomplete fixture map");
      }
      for (const record of expected.records) {
        if (!Object.prototype.hasOwnProperty.call(value, String(record.appid))) {
          throw new Error(`get_all_metadata omitted ${record.appid}`);
        }
        validateFixtureRecord(value[String(record.appid)], record);
      }
    } else if (method === "save_metadata") {
      validateFixtureRecord(value, expected.record);
    } else if (method === "get_plugin_version") {
      if (typeof value !== "string" || value !== expected.version) {
        throw new Error(`get_plugin_version returned ${String(value)}, expected ${expected.version}`);
      }
    } else {
      throw new Error(`no result validator for ${method}`);
    }
    return true;
  }

  function expectedCallsPerTrial() {
    return WORKLOADS.reduce((sum, [, , calls]) => sum + calls * 2, 0) + 50;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateResult,
      validateFixtureRecord,
      expectedCallsPerTrial,
      workloadContext,
      warmupReads,
      runWorkload,
      attachObservers,
      observerState,
      markServiceReady,
      waitForStartupQuiescence,
      detachObservers,
      armPreload,
      detachPreload,
    };
    return;
  }


  const commands = {
    preload: armPreload,
    preload_state: () => {
      const marker = window.__deckyMetadataBenchmarkPreload;
      if (!marker) throw new Error("early Loader observer preload is missing");
      return { runId: marker.runId, attached: marker.attached, error: marker.error, timeOrigin: performance.timeOrigin };
    },
    observer_state: observerState,
    detach: detachPreload,
    capture_ui: captureUi,
    home: navigateHome,
    mark_service_ready: markServiceReady,
    wait_startup_quiescence: waitForStartupQuiescence,
    measure_idle: measureIdle,
    probe_version: probeVersion,
    warmup: warmupReads,
    run_workload: runWorkload,
  };
  const command = __BENCHMARK_COMMAND__;
  const params = __BENCHMARK_PARAMS__;
  const operation = commands[command];
  if (!operation) throw new Error(`unknown benchmark command ${command}`);
  return Promise.resolve(operation(params)).then((result) => JSON.stringify(result));

  function armPreload(params) {
    if (window.top !== window) return { skipped: true };
    if (typeof params.runId !== "string" || !params.runId || params.runId.length > 128) {
      throw new Error("invalid observer run identity");
    }
    if (Object.hasOwn(window, "DeckyPluginLoader") || window.__deckyMetadataBenchmarkPreload) {
      throw new Error("early Loader observer requires a fresh document");
    }
    const marker = { runId: params.runId, attached: false, error: null };
    const setter = (loader) => {
      Object.defineProperty(window, "DeckyPluginLoader", { configurable: true, enumerable: true, writable: true, value: loader });
      try {
        attachObservers(marker.runId);
        marker.attached = true;
      } catch (error) {
        marker.error = errorText(error);
      }
    };
    Object.defineProperty(window, "DeckyPluginLoader", { configurable: true, enumerable: true, get: () => undefined, set: setter });
    marker.detach = () => {
      let result = { runId: marker.runId, attached: false };
      if (window.__deckyMetadataBenchmarkObserver) {
        if (observer().preloadRunId !== marker.runId) throw new Error("observer ownership changed");
        result = detachObservers();
      }
      if (Object.getOwnPropertyDescriptor(window, "DeckyPluginLoader")?.set === setter) {
        delete window.DeckyPluginLoader;
      }
      if (window.__deckyMetadataBenchmarkPreload === marker) delete window.__deckyMetadataBenchmarkPreload;
      return result;
    };
    window.__deckyMetadataBenchmarkPreload = marker;
    return { runId: marker.runId, attached: false, timeOrigin: performance.timeOrigin };
  }

  function detachPreload(params) {
    if (typeof params.runId !== "string" || !params.runId) throw new Error("invalid observer run identity");
    const marker = window.__deckyMetadataBenchmarkPreload;
    const active = window.__deckyMetadataBenchmarkObserver;
    if ((marker && marker.runId !== params.runId) || (active && active.preloadRunId !== params.runId)) {
      throw new Error("observer ownership changed");
    }
    return marker ? marker.detach() : active ? detachObservers() : { runId: params.runId, attached: false };
  }

  function connectApi() {
    const loader = window[LOADER_API];
    if (typeof loader?.connect !== "function") throw new Error("Loader plugin API is unavailable");
    let api;
    try {
      api = loader.connect.call(loader, 2, PLUGIN_NAME);
    } catch (_) {
      api = null;
    }
    if (typeof api?.call !== "function") api = loader.connect.call(loader, 1, PLUGIN_NAME);
    if (typeof api?.call !== "function") throw new Error("plugin-scoped RPC API is unavailable");
    return api;
  }

  function observer() {
    const value = window.__deckyMetadataBenchmarkObserver;
    if (!value) throw new Error("Loader observers have not been attached");
    return value;
  }

  function attachObservers(preloadRunId = null) {
    const loader = window.DeckyPluginLoader;
    const backend = window.DeckyBackend;
    const listeners = backend?.eventListeners?.get("loader/notify_updates");
    if (!loader || typeof loader.checkPluginUpdates !== "function" ||
        !(listeners instanceof Set) || listeners.size === 0) {
      throw new Error("Loader startup/catalog observation points are unavailable");
    }
    if (window.__deckyMetadataBenchmarkObserver) throw new Error("Loader observers are already attached");

    const state = {
      attachedAt: performance.now(),
      preloadRunId,
      serviceReadyAt: null,
      catalogOriginal: loader.checkPluginUpdates,
      originals: Array.from(listeners),
      updateWrappers: [],
      wrapperToOriginal: new Map(),
      updateStarted: 0,
      updateCompleted: 0,
      updateErrors: [],
      updateActive: 0,
      updateLastCompletedAt: null,
      catalogStarted: 0,
      catalogCompleted: 0,
      catalogErrors: [],
      catalogActive: 0,
      catalogLastCompletedAt: null,
    };
    const updateWrapperByOriginal = new Map();
    for (const callback of state.originals) {
      const wrapped = function (...args) {
        state.updateStarted += 1;
        state.updateActive += 1;
        let result;
        try {
          result = callback.apply(this, args);
        } catch (error) {
          state.updateActive -= 1;
          state.updateErrors.push(errorText(error));
          throw error;
        }
        if (!result || typeof result.then !== "function") {
          state.updateActive -= 1;
          state.updateCompleted += 1;
          state.updateLastCompletedAt = performance.now();
          return result;
        }
        return Promise.resolve(result).then(
          (value) => {
            state.updateActive -= 1;
            state.updateCompleted += 1;
            state.updateLastCompletedAt = performance.now();
            return value;
          },
          (error) => {
            state.updateActive -= 1;
            state.updateErrors.push(errorText(error));
            throw error;
          },
        );
      };
      state.wrapperToOriginal.set(wrapped, callback);
      updateWrapperByOriginal.set(callback, wrapped);
      state.updateWrappers.push(wrapped);
    }
    const orderedListeners = Array.from(listeners, (callback) =>
      updateWrapperByOriginal.get(callback) || callback);
    listeners.clear();
    for (const callback of orderedListeners) listeners.add(callback);

    state.catalogWrapper = function (...args) {
      state.catalogStarted += 1;
      state.catalogActive += 1;
      let result;
      try {
        result = state.catalogOriginal.apply(this, args);
      } catch (error) {
        state.catalogActive -= 1;
        state.catalogErrors.push(errorText(error));
        throw error;
      }
      if (!result || typeof result.then !== "function") {
        state.catalogActive -= 1;
        state.catalogCompleted += 1;
        state.catalogLastCompletedAt = performance.now();
        return result;
      }
      return Promise.resolve(result).then(
        (value) => {
          state.catalogActive -= 1;
          state.catalogCompleted += 1;
          state.catalogLastCompletedAt = performance.now();
          return value;
        },
        (error) => {
          state.catalogActive -= 1;
          state.catalogErrors.push(errorText(error));
          throw error;
        },
      );
    };
    loader.checkPluginUpdates = state.catalogWrapper;
    window.__deckyMetadataBenchmarkObserver = state;
    return publicObserverState(state);
  }

  function publicObserverState(state = observer()) {
    return {
      attachedAt: state.attachedAt,
      preloadRunId: state.preloadRunId,
      serviceReadyAt: state.serviceReadyAt,
      updateStarted: state.updateStarted,
      updateCompleted: state.updateCompleted,
      updateActive: state.updateActive,
      updateErrors: [...state.updateErrors],
      updateLastCompletedAt: state.updateLastCompletedAt,
      catalogStarted: state.catalogStarted,
      catalogCompleted: state.catalogCompleted,
      catalogActive: state.catalogActive,
      catalogErrors: [...state.catalogErrors],
      catalogLastCompletedAt: state.catalogLastCompletedAt,
    };
  }

  function observerState() {
    return publicObserverState();
  }
  function markServiceReady() {
    const state = observer();
    state.serviceReadyAt = performance.now();
    return publicObserverState(state);
  }

  function detachObservers() {
    const state = observer();
    const listeners = window.DeckyBackend?.eventListeners?.get("loader/notify_updates");
    const problems = [];
    if (listeners instanceof Set) {
      if (state.updateWrappers.some((wrapped) => !listeners.has(wrapped))) {
        problems.push("Loader update listener set changed before observer cleanup");
      }
      const restored = Array.from(listeners, (callback) => state.wrapperToOriginal.get(callback) || callback);
      listeners.clear();
      for (const callback of restored) listeners.add(callback);
    } else {
      problems.push("Loader update event listener set disappeared");
    }
    const loader = window.DeckyPluginLoader;
    if (loader?.checkPluginUpdates === state.catalogWrapper) {
      loader.checkPluginUpdates = state.catalogOriginal;
    } else {
      problems.push("Loader catalog observer was replaced by another actor");
    }
    const result = publicObserverState(state);
    delete window.__deckyMetadataBenchmarkObserver;
    if (problems.length) throw new Error(problems.join("; "));
    return result;
  }

  function routePath() {
    return `${location.pathname.replace(/^\/routes(?=\/)/, "")}${location.search}${location.hash}`;
  }

  function visibleQuickAccess() {
    const trees = window.DFL?.getGamepadNavigationTrees?.();
    const menu = trees?.find((tree) => tree?.id === "QuickAccess-NA")?.m_Root?.m_element?.ownerDocument;
    if (!menu) throw new Error("native Quick Access window is unavailable");
    const selected = Array.from(menu.querySelectorAll("[role='tab'][aria-selected='true'][id^='quickaccess_tab_']"));
    const match = selected.length === 1 && /^quickaccess_tab_(\d+)$/.exec(selected[0].id);
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error("native Quick Access tab is ambiguous");
    return { available: true, open: !menu.hidden, tab: Number(match[1]) };
  }

  function captureUi() {
    return { route: routePath(), quickAccess: visibleQuickAccess() };
  }

  async function navigateHome() {
    const nav = window.DFL?.Navigation;
    if (typeof nav?.Navigate !== "function") throw new Error("DFL.Navigation.Navigate is unavailable");
    nav.Navigate("/library/home");
    if (typeof nav.CloseSideMenus !== "function") throw new Error("DFL.Navigation.CloseSideMenus is unavailable");
    nav.CloseSideMenus();
    const deadline = performance.now() + 10000;
    while (performance.now() < deadline) {
      if (routePath() === "/library/home" && !visibleQuickAccess().open) return captureUi();
      await sleep(100);
    }
    throw new Error(`Home route did not become active (current ${routePath()})`);
  }


  async function waitForStartupQuiescence(params = {}) {
    const timeoutMs = params.timeoutMs ?? 180000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 180000) {
      throw new Error("startup quiescence timeout must be between 0 and 180000ms");
    }
    const deadline = performance.now() + timeoutMs;
    let quietSince = null;
    let quietSnapshot = null;
    while (performance.now() < deadline) {
      const state = observer();
      const ui = captureUi();
      if (state.updateErrors.length || state.catalogErrors.length) {
        return {
          ok: false,
          reason: "startup update/catalog observer recorded an error",
          observer: publicObserverState(state),
          ui,
        };
      }
      const complete = state.updateStarted > 0 && state.updateStarted === state.updateCompleted &&
        state.updateActive === 0 && state.catalogCompleted > 0 &&
        state.catalogActive === 0 && state.catalogStarted === state.catalogCompleted &&
        state.updateLastCompletedAt !== null && performance.now() - state.updateLastCompletedAt >= 10000 &&
        performance.now() - state.attachedAt >= 60000 && state.serviceReadyAt !== null &&
        performance.now() - state.serviceReadyAt >= 60000 && ui.route === "/library/home" && !ui.quickAccess.open;
      if (!complete) {
        quietSince = null;
        quietSnapshot = null;
        await sleep(100);
        continue;
      }
      const signature = JSON.stringify({
        updateStarted: state.updateStarted,
        updateCompleted: state.updateCompleted,
        catalogStarted: state.catalogStarted,
        catalogCompleted: state.catalogCompleted,
        route: ui.route,
      });
      if (signature !== quietSnapshot) {
        quietSnapshot = signature;
        quietSince = performance.now();
      } else if (performance.now() - quietSince >= 5000) {
        return { ok: true, quietMs: 5000, observer: publicObserverState(state), ui };
      }
      await sleep(100);
    }
    return {
      ok: false,
      reason: "startup update/catalog quiescence not observed before its 180-second deadline",
      timeoutMs,
      observer: publicObserverState(),
      ui: captureUi(),
    };
  }

  async function measureIdle() {
    const initial = observer();
    const initialUi = captureUi();
    if (initialUi.route !== "/library/home" || initialUi.quickAccess.open || initial.updateActive !== 0 || initial.catalogActive !== 0 ||
        initial.updateErrors.length || initial.catalogErrors.length) {
      return { ok: false, reason: "idle window began outside quiescence", observer: publicObserverState(initial), ui: initialUi };
    }
    const updateStarted = initial.updateStarted;
    const catalogStarted = initial.catalogStarted;
    const idleStart = performance.now();
    while (performance.now() - idleStart < 30000) {
      await sleep(100);
      const current = observer();
      if (current.updateStarted !== updateStarted || current.catalogStarted !== catalogStarted ||
          current.updateActive !== 0 || current.catalogActive !== 0 ||
          current.updateErrors.length || current.catalogErrors.length || routePath() !== initialUi.route || visibleQuickAccess().open) {
        return {
          ok: false,
          reason: "update/catalog activity or route change during idle window",
          observer: publicObserverState(current),
          ui: captureUi(),
        };
      }
    }
    const endMs = performance.now();
    return { ok: true, quietMs: 5000, idleMs: endMs - idleStart, startMs: idleStart, endMs, timeOrigin: performance.timeOrigin, observer: publicObserverState() };
  }

  async function probeVersion(params) {
    const api = connectApi();
    const start = performance.now();
    const value = await api.call.call(api, "get_plugin_version");
    const elapsedMs = performance.now() - start;
    validateResult("get_plugin_version", value, { version: params.version });
    return { version: value, elapsedMs };
  }

  function workloadContext(params) {
    const size = params.size;
    const missing = params.missing;
    const records = params.records;
    if (![100, 1000].includes(size) || missing !== size / 4 ||
        !Array.isArray(records) || records.length !== size ||
        typeof params.writeDescriptionA !== "string" || params.writeDescriptionA.length !== 512 ||
        typeof params.writeDescriptionB !== "string" || params.writeDescriptionB.length !== 512 ||
        params.writeDescriptionA === params.writeDescriptionB ||
        params.writeDescriptionA === "D".repeat(512) || params.writeDescriptionB === "D".repeat(512)) {
      throw new Error("invalid deterministic benchmark fixture descriptor");
    }
    records.forEach((record, index) => {
      const description = index % 4 === 3 ? "" : "D".repeat(512);
      if (!record || record.appid !== 2147483648 + index ||
          record.id !== `benchmark-${String(index).padStart(4, "0")}` ||
          record.title !== `Benchmark Fixture ${String(index).padStart(4, "0")} — Café` ||
          record.source !== "Manual" || record.steam_store_state !== "unknown" ||
          record.release_date !== "2021-07-12" ||
          record.description !== description || record.short_description !== description ||
          !Array.isArray(record.screenshots) || record.screenshots.length !== 4 ||
          !Array.isArray(record.steam_news) || record.steam_news.length !== 6) {
        throw new Error(`fixture record ${index} does not match the deterministic contract`);
      }
      validateFixtureRecord(record, record);
    });
    const complete = records.filter((_, index) => index % 4 !== 3);
    if (complete.length < 50) throw new Error("fixture has fewer than 50 complete write targets");
    const games = records.map((record) => ({ appid: record.appid, name: record.title }));
    if (games.some((game) => typeof game.appid !== "number" || typeof game.name !== "string")) {
      throw new Error("GameOption fixture requires numeric appid and name fields");
    }
    return {
      size,
      missing,
      records,
      complete,
      games,
      expected: { size, missing, records },
    };
  }

  async function warmupReads(params) {
    const context = workloadContext(params);
    const api = connectApi();
    const methods = [
      ["get_metadata_hit", "get_metadata", [context.complete[0].appid], { ...context.expected, record: context.complete[0] }],
      ["get_metadata_miss", "get_metadata", [4294967295], context.expected],
      ["get_missing_metadata_count", "get_missing_metadata_count", [context.games], context.expected],
      ["get_all_metadata", "get_all_metadata", [], context.expected],
    ];
    const startMs = performance.now();
    for (const [name, method, args, expected] of methods) {
      for (let index = 0; index < 100; index += 1) {
        validateResult(name, await api.call.call(api, method, ...args), expected);
      }
    }
    return { ok: true, calls: 400, methods: methods.map(([name]) => name), startMs, endMs: performance.now(), timeOrigin: performance.timeOrigin };
  }


  async function runWorkload(params) {
    const context = workloadContext(params);
    const api = connectApi();
    const complete = context.complete;
    const completeIds = complete.map((record) => record.appid);
    const writeRecords = complete.slice(0, 50);
    const expected = context.expected;
    const measurements = {};
    const errors = [];
    const activityStart = publicObserverState();
    let completedCalls = 0;
    const startMs = performance.now();

    async function issue(name, method, args, validator, deferValidation = false) {
      const start = performance.now();
      let timeout;
      let result;
      const target = measurements[name] || (measurements[name] = { samplesMs: [], count: 0, completedCalls: 0 });
      try {
        const rpc = api.call.call(api, method, ...args);
        result = await Promise.race([
          rpc,
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`${method} timed out after ${CALL_TIMEOUT_MS}ms`)), CALL_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        const elapsedMs = performance.now() - start;
        const failure = { workload: name, method, elapsedMs, error: errorText(error) };
        errors.push(failure);
        target.samplesMs.push(elapsedMs);
        target.count += 1;
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const elapsedMs = performance.now() - start;
      target.samplesMs.push(elapsedMs);
      target.count += 1;
      const validate = () => {
        try {
          validator(result);
        } catch (error) {
          errors.push({ workload: name, method, elapsedMs, error: errorText(error) });
          throw error;
        }
        target.completedCalls += 1;
        completedCalls += 1;
      };
      if (deferValidation) return { validate };
      validate();
      return result;
    }

    async function measureRead(label, method, count, argsForCall, validator, concurrency) {
      const mode = concurrency === 1 ? "serial" : "concurrency_8";
      const workloadName = `${label}_${mode}`;
      const target = measurements[workloadName] || (measurements[workloadName] = { samplesMs: [], count: 0, completedCalls: 0 });
      if (concurrency === 8) target.description = "batches of 8, barrier per batch";
      const wallStart = performance.now();
      target.startMs = wallStart;
      try {
        if (concurrency === 1) {
          for (let index = 0; index < count; index += 1) {
            await issue(workloadName, method, argsForCall(index), validator(index));
          }
        } else {
          for (let offset = 0; offset < count; offset += concurrency) {
            const batch = [];
            const end = Math.min(count, offset + concurrency);
            for (let index = offset; index < end; index += 1) {
              batch.push(issue(workloadName, method, argsForCall(index), validator(index), true));
            }
            const settled = await Promise.allSettled(batch);
            let validationFailure;
            for (const result of settled) {
              if (result.status !== "fulfilled") continue;
              try {
                result.value.validate();
              } catch (error) {
                validationFailure ||= error;
              }
            }
            const requestFailure = settled.find((result) => result.status === "rejected");
            if (validationFailure) throw validationFailure;
            if (requestFailure) throw requestFailure.reason;
          }
        }
      } finally {
        target.endMs = performance.now();
        target.wallMs = target.endMs - wallStart;
        target.throughputCallsPerSecond = target.completedCalls * 1000 / target.wallMs;
      }
    }


    try {
      await measureRead("get_metadata_hit", "get_metadata", 1000,
        (index) => [completeIds[index % completeIds.length]],
        (index) => (value) => validateResult("get_metadata_hit", value, {
          ...expected, record: complete[index % complete.length],
        }), 1);
      await measureRead("get_metadata_miss", "get_metadata", 1000,
        () => [4294967295], () => (value) => validateResult("get_metadata_miss", value, expected), 1);
      await measureRead("get_missing_metadata_count", "get_missing_metadata_count", 1000,
        () => [context.games], () => (value) => validateResult("get_missing_metadata_count", value, expected), 1);
      await measureRead("get_all_metadata", "get_all_metadata", 200,
        () => [], () => (value) => validateResult("get_all_metadata", value, expected), 1);

      await measureRead("get_metadata_hit", "get_metadata", 1000,
        (index) => [completeIds[index % completeIds.length]],
        (index) => (value) => validateResult("get_metadata_hit", value, {
          ...expected, record: complete[index % complete.length],
        }), 8);
      await measureRead("get_metadata_miss", "get_metadata", 1000,
        () => [4294967295], () => (value) => validateResult("get_metadata_miss", value, expected), 8);
      await measureRead("get_missing_metadata_count", "get_missing_metadata_count", 1000,
        () => [context.games], () => (value) => validateResult("get_missing_metadata_count", value, expected), 8);
      await measureRead("get_all_metadata", "get_all_metadata", 200,
        () => [], () => (value) => validateResult("get_all_metadata", value, expected), 8);

      const writes = measurements.save_metadata_serial ||
        (measurements.save_metadata_serial = { samplesMs: [], count: 0, completedCalls: 0 });
      const writesWallStart = performance.now();
      writes.startMs = writesWallStart;
      try {
        for (let index = 0; index < 50; index += 1) {
          const record = writeRecords[index];
          const description = index % 2 === 0 ? params.writeDescriptionA : params.writeDescriptionB;
          const metadata = { ...record, description, short_description: description };
          const sanitizedExpected = { ...metadata };
          delete sanitizedExpected.appid;
          await issue("save_metadata_serial", "save_metadata", [record.appid, metadata],
            (value) => validateResult("save_metadata", value, { record: sanitizedExpected }));
        }
      } finally {
        writes.endMs = performance.now();
        writes.wallMs = writes.endMs - writesWallStart;
        writes.throughputCallsPerSecond = writes.completedCalls * 1000 / writes.wallMs;
      }
      const activityEnd = publicObserverState();
      if (activityEnd.updateStarted !== activityStart.updateStarted ||
          activityEnd.catalogStarted !== activityStart.catalogStarted ||
          activityEnd.updateActive !== 0 || activityEnd.catalogActive !== 0) {
        errors.push({
          workload: "trial",
          method: "observer",
          error: "Loader update/catalog activity overlapped benchmark RPCs",
        });
      }
    } catch (error) {
      if (!errors.length || errors[errors.length - 1].error !== errorText(error)) {
        errors.push({ workload: "trial", method: "benchmark", error: errorText(error) });
      }
    }

    const sampleCalls = Object.values(measurements).reduce((sum, entry) => sum + entry.count, 0);
    return {
      schema: 1,
      startMs,
      endMs: performance.now(),
      timeOrigin: performance.timeOrigin,
      datasetSize: context.size,
      missing: context.missing,
      warmupCalls: 400,
      expectedMeasuredCalls: expectedCallsPerTrial(),
      completedCalls,
      sampleCalls,
      measurements,
      errors,
      activityStart,
      activityEnd: publicObserverState(),
      ok: errors.length === 0 && sampleCalls === expectedCallsPerTrial() && completedCalls === expectedCallsPerTrial(),
    };
  }

  function errorText(error) {
    if (error && typeof error.message === "string") return error.message;
    return String(error);
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
})();
