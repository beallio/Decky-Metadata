import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metadataTemplate } from "../metadataForm";

vi.mock("@decky/ui", () => ({
  afterPatch: vi.fn(),
  findModuleChild: (predicate: (module: unknown) => unknown) => predicate({
    InnerContainer: "nativeInner", GameDescription: "nativeDescription", DescriptionStatsCtn: "nativeStats",
  }),
}));

import { metadataCache } from "./core";
import { refreshNativeReleaseDateView } from "./releaseDateView";

const appId = 2312439508;
let originalZone: string | undefined;

beforeEach(() => { originalZone = process.env.TZ; process.env.TZ = "America/Los_Angeles"; });
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
  delete metadataCache[String(appId)];
  vi.unstubAllGlobals();
});

class NativeOverview {
  appid = appId;
  app_type = 1073741824;
  rt_original_release_date = 1207724400;
  BIsShortcut() { return this.app_type === 1073741824; }
  GetCanonicalReleaseDate() { return this.rt_original_release_date; }
}

class NativeDateView {
  label = "";
  constructor(public props: { overview: NativeOverview }) { this.forceUpdate(); }
  render() {
    return new Date(this.props.overview.GetCanonicalReleaseDate() * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  forceUpdate() { this.label = this.render(); }
}

const setup = (route = `/library/app/${appId}/tab/GameInfo`) => {
  const overview = new NativeOverview();
  const view = new NativeDateView({ overview });
  const element = { isConnected: true, getClientRects: () => [1], __reactFiber$date: { stateNode: null, return: { stateNode: view, return: null } } };
  vi.stubGlobal("appStore", { allApps: [overview] });
  vi.stubGlobal("Router", { WindowStore: { GamepadUIMainWindowInstance: { m_history: { location: { pathname: route } } } } });
  vi.stubGlobal("document", { querySelector: () => element, querySelectorAll: () => [element] });
  metadataCache[String(appId)] = { ...metadataTemplate("Owned"), release_date: "2024-03-10" };
  return { overview, view, element };
};

describe("mounted native release-date repaint", () => {
  it("updates the existing native label after its numeric date fields change", () => {
    const { overview, view } = setup();
    overview.rt_original_release_date = 1710057600;
    expect(view.label).toBe("Apr 9, 2008");
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Mar 10, 2024");
    // A foreign store in props must never be enumerated by the fiber walk.
    Object.defineProperty(view.props, "foreignStore", { enumerable: true, get: () => { throw Error("Store traversal"); } });
    overview.rt_original_release_date = 1730620800;
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Nov 3, 2024");
  });

  it.each([`/library/app/${appId}/tab/Activity`, `/library/app/${appId + 1}/tab/GameInfo`, "/"]) ("does not refresh a date owner outside its exact Game Info route %s", route => {
    const { overview, view } = setup(route);
    overview.rt_original_release_date = 1710057600;
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Apr 9, 2008");
  });

  it("leaves normal Steam games, unmatched shortcuts, and omitted dates untouched", () => {
    const { overview, view } = setup();
    overview.rt_original_release_date = 1710057600;
    overview.app_type = 0;
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Apr 9, 2008");
    overview.app_type = 1073741824;
    delete metadataCache[String(appId)];
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Apr 9, 2008");
    metadataCache[String(appId)] = metadataTemplate("No date");
    delete metadataCache[String(appId)].release_date;
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Apr 9, 2008");
  });

  it("does not revive disconnected or hidden native views", () => {
    const { overview, view, element } = setup();
    overview.rt_original_release_date = 1710057600;
    element.isConnected = false;
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Apr 9, 2008");
    element.isConnected = true;
    element.getClientRects = () => [];
    refreshNativeReleaseDateView(appId);
    expect(view.label).toBe("Apr 9, 2008");
  });
});
