// Read controller-configuration query results. Target: SharedJSContext.
// Vars: DISPLAY_APPID, SOURCE_APPID. Output contains counts and URL hashes only.
(async () => {
  const displayedAppid = Number("__DISPLAY_APPID__");
  const sourceAppid = Number("__SOURCE_APPID__");
  const store = globalThis.controllerConfiguratorStore;
  if (!Number.isFinite(displayedAppid) || displayedAppid <= 0) {
    throw new Error("invalid displayed appid");
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
    controllerConfiguratorStore.QueryConfigsForApp(appid, controllerIndex);
    const deadline = Date.now() + 15000;
    while (store.BConfigurationQueryInFlight === true && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (store.BConfigurationQueryInFlight === true) {
      throw new Error("configuration query timed out");
    }
    return read(appid);
  };

  const displayed = await query(displayedAppid);
  const sourceCompared = Number.isFinite(sourceAppid) && sourceAppid > 0;
  const source = sourceCompared ? await query(sourceAppid) : null;
  return JSON.stringify({
    displayedAppid,
    sourceAppid: sourceCompared ? sourceAppid : null,
    sourceCompared,
    controllerIndex,
    displayed,
    source,
  });
})()
