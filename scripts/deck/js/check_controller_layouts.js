// Read controller-configuration query results. Target: SharedJSContext.
// Vars: DISPLAY_APPID, SOURCE_APPID, SECOND_DISPLAY_APPID,
// SECOND_SOURCE_APPID, and THIRD_DISPLAY_APPID. Output contains appids,
// booleans, elapsed durations, counts, and URL hashes only.
(async () => {
  const displayedAppid = Number("__DISPLAY_APPID__");
  const sourceAppid = Number("__SOURCE_APPID__");
  const secondDisplayedAppid = Number("__SECOND_DISPLAY_APPID__");
  const secondSourceAppid = Number("__SECOND_SOURCE_APPID__");
  const thirdDisplayedAppid = Number("__THIRD_DISPLAY_APPID__");
  const store = globalThis.controllerConfiguratorStore;
  if (!Number.isFinite(displayedAppid) || displayedAppid <= 0) {
    throw new Error("invalid displayed appid");
  }
  if (!Number.isFinite(thirdDisplayedAppid) || thirdDisplayedAppid <= 0) {
    throw new Error("invalid third displayed appid");
  }
  if (!store || typeof store.QueryConfigsForApp !== "function") {
    throw new Error("controller configurator store unavailable");
  }
  if (typeof globalThis.controllerStore?.GetControllers !== "function") {
    throw new Error("controller list unavailable");
  }

  const controllers = controllerStore.GetControllers();
  const controller = Array.isArray(controllers)
    ? controllers.find((item) => Number.isFinite(item?.nControllerIndex))
    : null;
  if (!controller) throw new Error("no connected controller");
  const controllerIndex = controller.nControllerIndex;
  const controllerType = controller.eControllerType;

  const hashUrl = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const summarize = (records) => {
    if (!Array.isArray(records)) throw new Error("configuration result is not an array");
    const urls = records.map((record) => record?.URL);
    if (urls.some((value) => typeof value !== "string" || value.trim().length === 0)) {
      throw new Error("configuration result has an invalid identity");
    }
    return { count: urls.length, urlHashes: urls.map(hashUrl) };
  };
  const read = (appid) => {
    const official = store.GetOfficialConfigsForApp(appid, controllerType);
    const templates = store.GetTemplateConfigsForApp(appid, controllerType);
    const workshop = store.GetWorkshopConfigsForApp(appid, controllerType);
    if (!Array.isArray(templates)) throw new Error("template result is not an array");
    return {
      official: summarize(official),
      recommended: summarize(templates.filter((record) => record?.bRecommended === true)),
      community: summarize(workshop),
    };
  };
  const query = async (appid) => {
    const startedAt = Date.now();
    controllerConfiguratorStore.QueryConfigsForApp(appid, controllerIndex);
    const deadline = Date.now() + 15000;
    while (store.BConfigurationQueryInFlight === true && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (store.BConfigurationQueryInFlight === true) {
      throw new Error("configuration query timed out");
    }
    return { layouts: read(appid), elapsedMs: Date.now() - startedAt };
  };

  const sourceCompared = Number.isFinite(sourceAppid) && sourceAppid > 0;
  const secondCompared = Number.isFinite(secondDisplayedAppid) &&
    secondDisplayedAppid > 0 &&
    Number.isFinite(secondSourceAppid) &&
    secondSourceAppid > 0;
  if (sourceCompared || secondCompared) {
    if (typeof store.m_mapAppConfigs?.has !== "function") {
      throw new Error("controller configuration cache boundary unavailable");
    }
  }
  const sourcePreexisting = sourceCompared
    ? store.m_mapAppConfigs.has(sourceAppid)
    : null;
  const secondSourcePreexisting = secondCompared
    ? store.m_mapAppConfigs.has(secondSourceAppid)
    : null;

  if (!secondCompared) throw new Error("second matched fixture is incomplete");
  if (typeof store.GetAllConfigs !== "function") {
    throw new Error("controller configuration Search unavailable");
  }
  const countAppid = (search, appid) => search.reduce((count, record) => {
      const recordAppid = record?.appID;
      return count + (
        typeof recordAppid === "number" &&
        Number.isFinite(recordAppid) &&
        recordAppid > 0 &&
        recordAppid === appid
          ? 1
          : 0
      );
    }, 0);
  const searchSnapshot = () => {
    const startedAt = Date.now();
    const records = store.GetAllConfigs();
    const elapsedMs = Date.now() - startedAt;
    if (!Array.isArray(records)) {
      throw new Error("controller configuration Search result is not an array");
    }
    return { records, elapsedMs };
  };
  const hasResults = (layouts) => Object.values(layouts)
    .some((summary) => summary.count > 0);

  const firstQuery = await query(displayedAppid);
  const secondQuery = await query(secondDisplayedAppid);
  const afterSecondSearch = searchSnapshot();
  const afterSecond = {
    elapsedMs: afterSecondSearch.elapsedMs,
    firstDisplayedCount: countAppid(afterSecondSearch.records, displayedAppid),
    firstSourceCount: countAppid(afterSecondSearch.records, sourceAppid),
    secondDisplayedCount: countAppid(afterSecondSearch.records, secondDisplayedAppid),
    secondSourceCount: countAppid(afterSecondSearch.records, secondSourceAppid),
  };

  const thirdQuery = await query(thirdDisplayedAppid);
  const afterThirdSearch = searchSnapshot();
  const afterThird = {
    elapsedMs: afterThirdSearch.elapsedMs,
    firstDisplayedCount: countAppid(afterThirdSearch.records, displayedAppid),
    firstSourceCount: countAppid(afterThirdSearch.records, sourceAppid),
    secondDisplayedCount: countAppid(afterThirdSearch.records, secondDisplayedAppid),
    secondSourceCount: countAppid(afterThirdSearch.records, secondSourceAppid),
    thirdDisplayedCount: countAppid(afterThirdSearch.records, thirdDisplayedAppid),
  };

  // Read source-only results after both Search snapshots. Direct native source
  // access intentionally relinquishes that source's supplemental classification.
  const source = sourceCompared ? read(sourceAppid) : null;
  const secondSource = read(secondSourceAppid);
  const isolation = {
    sourcePreexisting,
    secondSourcePreexisting,
    afterSecond: {
      ...afterSecond,
      secondDisplayedHasResults: hasResults(secondQuery.layouts),
      secondSourceHasResults: hasResults(secondSource),
    },
    afterThird: {
      ...afterThird,
      thirdDisplayedHasResults: hasResults(thirdQuery.layouts),
    },
  };
  return JSON.stringify({
    displayedAppid,
    sourceAppid: sourceCompared ? sourceAppid : null,
    sourceCompared,
    controllerIndex,
    elapsedMs: firstQuery.elapsedMs,
    displayed: firstQuery.layouts,
    source,
    second: {
      displayedAppid: secondDisplayedAppid,
      sourceAppid: secondSourceAppid,
      sourceCompared: true,
      controllerIndex,
      elapsedMs: secondQuery.elapsedMs,
      displayed: secondQuery.layouts,
      source: secondSource,
    },
    third: {
      displayedAppid: thirdDisplayedAppid,
      sourceAppid: null,
      sourceCompared: false,
      controllerIndex,
      elapsedMs: thirdQuery.elapsedMs,
      displayed: thirdQuery.layouts,
      source: null,
    },
    isolation,
  });
})()
