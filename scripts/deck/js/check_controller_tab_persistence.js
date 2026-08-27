// Bounded controller-layout tab persistence probe. Target this at either
// SharedJSContext (query) or Steam Big Picture Mode (dom-select, dom-observe,
// dom-restore). It reports only tab labels/ids, scalar counts, controller
// metadata, booleans, elapsed time, and hashes of layout identities.
// Vars: PHASE, DISPLAY_APPID, SOURCE_APPID, RESTORE_TAB.
(async () => {
  const phase = "__PHASE__";
  const displayedAppid = Number("__DISPLAY_APPID__");
  const sourceAppid = Number("__SOURCE_APPID__");
  if (!Number.isInteger(displayedAppid) || displayedAppid <= 0) {
    throw new Error("invalid displayed appid");
  }
  if (!Number.isInteger(sourceAppid) || sourceAppid <= 0) {
    throw new Error("invalid source appid");
  }

  const hash = (value) => {
    let state = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      state ^= value.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    return (state >>> 0).toString(16).padStart(8, "0");
  };

  const tabSnapshot = () => {
    const tablist = document.querySelector('[role="tablist"]');
    if (!tablist) throw new Error("chooser tablist unavailable");
    const tabs = [...tablist.querySelectorAll('[role="tab"]')].map((tab) => ({
      id: tab.id || (tab.textContent || "").trim(),
      label: (tab.textContent || "").trim(),
      selected: tab.getAttribute("aria-selected") === "true",
    }));
    const selectedTab = tabs.find((tab) => tab.selected);
    if (!selectedTab || !selectedTab.label) throw new Error("chooser selected tab unavailable");
    return { tablist, tabs, selectedTab };
  };

  const renderedCount = (tablist) => {
    const content = tablist.parentElement?.parentElement?.parentElement?.lastElementChild;
    if (!content) throw new Error("chooser content unavailable");
    const groups = new Map();
    for (const element of content.querySelectorAll("*")) {
      if (element === content || !element.classList.contains("Panel") ||
          !element.classList.contains("Focusable")) continue;
      const className = String(element.className || "");
      if (!className) continue;
      groups.set(className, (groups.get(className) || 0) + 1);
    }
    return Math.max(0, ...groups.values());
  };

  const chooseTab = (label) => {
    const { tablist, tabs } = tabSnapshot();
    const wanted = tabs.find((tab) => tab.label === label);
    if (!wanted) throw new Error(`chooser tab unavailable: ${label}`);
    const control = [...tablist.querySelectorAll('[role="tab"]')]
      .find((tab) => (tab.textContent || "").trim() === label);
    if (!control) throw new Error("chooser tab control unavailable");
    control.focus?.();
    for (const eventType of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const init = { bubbles: true, cancelable: true, view: window };
      control.dispatchEvent(eventType.startsWith("pointer")
        ? new PointerEvent(eventType, init)
        : new MouseEvent(eventType, init));
    }
    return tabSnapshot();
  };

  if (phase === "dom-select") {
    const original = tabSnapshot();
    const selected = chooseTab("Community Layouts");
    return JSON.stringify({
      displayedAppid,
      sourceAppid,
      originalSelectedTab: original.selectedTab,
      selectedTab: selected.selectedTab,
      tabs: selected.tabs,
      renderedCount: renderedCount(selected.tablist),
    });
  }

  if (phase === "dom-observe" || phase === "dom-restore") {
    if (phase === "dom-restore") chooseTab("__RESTORE_TAB__");
    const snapshot = tabSnapshot();
    return JSON.stringify({
      displayedAppid,
      sourceAppid,
      selectedTab: snapshot.selectedTab,
      tabs: snapshot.tabs,
      renderedCount: renderedCount(snapshot.tablist),
    });
  }

  if (phase !== "query") throw new Error("unknown tab-persistence probe phase");
  const store = globalThis.controllerConfiguratorStore;
  const input = globalThis.SteamClient?.Input;
  const controllerStore = typeof globalThis.ControllerStore?.GetControllers === "function"
    ? globalThis.ControllerStore
    : globalThis.controllerStore;
  if (!store || typeof input?.QueryControllerConfigsForApp !== "function" ||
      typeof controllerStore?.GetControllers !== "function") {
    throw new Error("controller query dependencies unavailable");
  }
  const controller = (controllerStore.GetControllers() || [])
    .find((item) => Number.isInteger(item?.nControllerIndex));
  if (!controller || !Number.isInteger(controller.eControllerType) || controller.eControllerType < 0) {
    throw new Error("controller unavailable");
  }
  if (typeof store.m_bFilterOtherControllerTypes !== "boolean") {
    throw new Error("visible controller filter unavailable");
  }
  const controllerIndex = controller.nControllerIndex;
  const controllerType = controller.eControllerType;
  const summarize = () => {
    const records = store.GetWorkshopConfigsForApp(displayedAppid, controllerType);
    if (!Array.isArray(records)) throw new Error("Community getter unavailable");
    const identities = records.map((record) => record?.URL);
    if (identities.some((identity) => typeof identity !== "string" || !identity.trim())) {
      throw new Error("Community identity unavailable");
    }
    return { getterCount: identities.length, urlHashes: identities.map(hash) };
  };
  const originalFilter = store.m_bFilterOtherControllerTypes;
  const before = summarize();
  const startedAt = Date.now();
  let filterDuringQuery = null;
  try {
    store.m_bFilterOtherControllerTypes = false;
    input.QueryControllerConfigsForApp(displayedAppid, controllerIndex, false);
    const deadline = Date.now() + 15000;
    while (store.BConfigurationQueryInFlight === true && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (store.BConfigurationQueryInFlight === true) throw new Error("controller query timed out");
    filterDuringQuery = store.m_bFilterOtherControllerTypes;
    const after = summarize();
    return JSON.stringify({
      displayedAppid,
      sourceAppid,
      controllerIndex,
      controllerType,
      before,
      after,
      filterDuringQuery,
      elapsedMs: Date.now() - startedAt,
    });
  } finally {
    store.m_bFilterOtherControllerTypes = originalFilter;
  }
})()
