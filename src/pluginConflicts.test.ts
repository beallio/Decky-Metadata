import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginConflictMonitor } from "./pluginConflicts";

const monitors: PluginConflictMonitor[] = [];
const monitorFor = (getLoader: () => unknown) => {
  const monitor = new PluginConflictMonitor(getLoader);
  monitors.push(monitor);
  return monitor;
};

const loaderFixture = (names: string[] = [], disabledNames: string[] = [], notifications = true) => {
  const inventory = {
    plugins: names.map(name => ({ name })),
    disabledPlugins: disabledNames.map(name => ({ name })),
    hiddenPlugins: [] as string[],
    frozenPlugins: [] as string[],
  };
  const events = new EventTarget();
  const loader = { deckyState: {
    publicState: () => inventory,
    eventBus: notifications ? events : undefined,
  } };
  const update = () => events.dispatchEvent(new Event("update"));
  return { inventory, loader, update };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  for (const monitor of monitors.splice(0)) monitor.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("known-plugin feature conflicts", () => {
  it("blocks only the matching dedicated feature, using manifest identity", () => {
    const fixture = loaderFixture(["ProtonDB Badges", "Decky UI Restored", "protondb-decky"]);
    const monitor = monitorFor(() => fixture.loader);
    monitor.mount();
    expect(monitor.getConflict("protondb")).toEqual({ pluginName: "ProtonDB Badges", detectionAvailable: true });
    expect(monitor.getConflict("trailers")).toEqual({ pluginName: null, detectionAvailable: true });
    expect(monitor.getConflict("miniAchievements")).toEqual({ pluginName: "Decky UI Restored", detectionAvailable: true });
    fixture.inventory.plugins = [{ name: "TrailerHero" }, { name: "protondb-decky" }];
    fixture.update();
    expect(monitor.getConflict("protondb").pluginName).toBeNull();
    expect(monitor.getConflict("trailers").pluginName).toBe("TrailerHero");
    expect(monitor.getConflict("miniAchievements")).toEqual({ pluginName: null, detectionAvailable: true });
  });

  it("does not mistake hidden or update-frozen plugins for disabled plugins", () => {
    const fixture = loaderFixture(["ProtonDB Badges", "TrailerHero"]);
    fixture.inventory.hiddenPlugins = ["ProtonDB Badges"];
    fixture.inventory.frozenPlugins = ["TrailerHero"];
    const monitor = monitorFor(() => fixture.loader);
    monitor.mount();
    expect(monitor.getConflict("protondb").pluginName).toBe("ProtonDB Badges");
    expect(monitor.getConflict("trailers").pluginName).toBe("TrailerHero");
  });

  it("clears the conflict as soon as Loader marks a plugin disabled, before its enabled list updates", () => {
    const fixture = loaderFixture(["ProtonDB Badges"]);
    const monitor = monitorFor(() => fixture.loader);
    monitor.mount();
    let blocked = monitor.getConflict("protondb").pluginName !== null;
    monitor.subscribe(() => { blocked = monitor.getConflict("protondb").pluginName !== null; });
    fixture.inventory.disabledPlugins = [{ name: "ProtonDB Badges" }];
    fixture.update();
    expect(blocked).toBe(false);
    fixture.inventory.plugins = [];
    fixture.update();
    expect(blocked).toBe(false);
    fixture.inventory.disabledPlugins = [];
    fixture.inventory.plugins = [{ name: "ProtonDB Badges" }];
    fixture.update();
    expect(blocked).toBe(true);
  });

  it("recognizes a later plugin import and unload while the panel is closed", () => {
    const fixture = loaderFixture();
    const monitor = monitorFor(() => fixture.loader);
    monitor.mount();
    fixture.inventory.plugins = [{ name: "TrailerHero" }];
    fixture.update();
    expect(monitor.getConflict("trailers").pluginName).toBe("TrailerHero");
    fixture.inventory.plugins = [];
    fixture.update();
    expect(monitor.getConflict("trailers")).toEqual({ pluginName: null, detectionAvailable: true });
  });

  it("blocks mini achievements by plugin activity without reading the peer's feature settings", () => {
    const fixture = loaderFixture(["Decky UI Restored"]);
    Object.defineProperty(fixture.inventory.plugins[0], "settings", {
      get: () => { throw new Error("Peer settings must not be inspected"); },
    });
    fixture.inventory.hiddenPlugins = ["Decky UI Restored"];
    fixture.inventory.frozenPlugins = ["Decky UI Restored"];
    const monitor = monitorFor(() => fixture.loader);
    monitor.mount();
    expect(monitor.getConflict("miniAchievements").pluginName).toBe("Decky UI Restored");
    fixture.inventory.disabledPlugins = [{ name: "Decky UI Restored" }];
    fixture.update();
    expect(monitor.getConflict("miniAchievements").pluginName).toBeNull();
    fixture.inventory.disabledPlugins = [];
    fixture.update();
    expect(monitor.getConflict("miniAchievements").pluginName).toBe("Decky UI Restored");
    fixture.inventory.plugins = [];
    fixture.update();
    expect(monitor.getConflict("miniAchievements").pluginName).toBeNull();
  });

  it("reports unavailable detection rather than inventing a conflict from an unsupported inventory", () => {
    const fixtures: unknown[] = [
      undefined,
      { hasPlugin: () => true },
      { deckyState: { publicState: () => ({ plugins: [{ name: "TrailerHero" }] }) } },
      { deckyState: { publicState: () => ({ plugins: [null], disabledPlugins: [] }) } },
      { deckyState: { publicState: () => { throw new Error("Loader is reloading"); } } },
    ];
    for (const loader of fixtures) {
      const monitor = monitorFor(() => loader);
      monitor.mount();
      expect(monitor.getConflict("protondb")).toEqual({ pluginName: null, detectionAvailable: false });
      expect(monitor.getConflict("trailers")).toEqual({ pluginName: null, detectionAvailable: false });
      monitor.stop();
    }
  });

  it("recovers when Loader appears after startup and follows its state events", () => {
    const fixture = loaderFixture(["TrailerHero"]);
    let loader: unknown;
    const monitor = monitorFor(() => loader);
    monitor.mount();
    expect(monitor.getConflict("trailers").detectionAvailable).toBe(false);
    loader = fixture.loader;
    vi.advanceTimersByTime(1_000);
    expect(monitor.getConflict("trailers").pluginName).toBe("TrailerHero");
    fixture.inventory.plugins = [];
    fixture.update();
    expect(monitor.getConflict("trailers")).toEqual({ pluginName: null, detectionAvailable: true });
  });

  it("uses the polling fallback to detect enable and disable when notifications are absent", () => {
    const fixture = loaderFixture([], [], false);
    const monitor = monitorFor(() => fixture.loader);
    monitor.mount();
    fixture.inventory.plugins = [{ name: "ProtonDB Badges" }];
    vi.advanceTimersByTime(1_000);
    expect(monitor.getConflict("protondb").pluginName).toBe("ProtonDB Badges");
    fixture.inventory.disabledPlugins = [{ name: "ProtonDB Badges" }];
    vi.advanceTimersByTime(1_000);
    expect(monitor.getConflict("protondb").pluginName).toBeNull();
  });

  it("does not retain a conflict or old subscription across monitor lifecycles", () => {
    const first = loaderFixture(["TrailerHero"]);
    const second = loaderFixture(["ProtonDB Badges"]);
    let loader = first.loader;
    const monitor = monitorFor(() => loader);
    monitor.mount();
    monitor.stop();
    expect(monitor.getConflict("trailers")).toEqual({ pluginName: null, detectionAvailable: false });
    loader = second.loader;
    monitor.mount();
    expect(monitor.getConflict("protondb").pluginName).toBe("ProtonDB Badges");
    expect(monitor.getConflict("trailers").pluginName).toBeNull();
    first.inventory.plugins = [];
    first.update();
    expect(monitor.getConflict("protondb").pluginName).toBe("ProtonDB Badges");
  });
});
