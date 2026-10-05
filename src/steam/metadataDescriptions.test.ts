import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/ui", () => ({ findModuleChild: vi.fn() }));
vi.mock("@decky/api", () => ({ callable: vi.fn(() => vi.fn()) }));
import { descriptionOwnerAppId, installMetadataDescriptions, type DescriptionPresentationDependencies } from "./metadataDescriptions";

const harness = (options: { delayed?: boolean; allowed?: boolean; appId?: number } = {}) => {
  const makeLeaf = () => {
    const values = new Map<string, [string, string]>([["white-space", ["normal", ""]]]);
    const attributes = new Map<string, string>();
    return {
      isConnected: true, textContent: "First paragraph\n\nSecond paragraph\n- List item",
      style: {
        getPropertyValue: (key: string) => values.get(key)?.[0] ?? "",
        getPropertyPriority: (key: string) => values.get(key)?.[1] ?? "",
        setProperty: (key: string, value: string, priority: string) => values.set(key, [value, priority]),
        removeProperty: (key: string) => values.delete(key),
      },
      getAttribute: (key: string) => attributes.get(key) ?? null,
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
    } as unknown as HTMLElement;
  };
  let leaf = makeLeaf();
  let appId = options.appId ?? 10;
  let ownerVisible = true;
  let route = "/library/app/10/tab/GameInfo";
  let eligible = options.allowed ?? true;
  let mounted = !options.delayed;
  let owner = { isConnected: true, querySelectorAll: () => [leaf] } as unknown as HTMLElement;
  const observers: Array<{ target: Node; callback: () => void; active: boolean }> = [];
  let routeListener = () => {};
  let expire = () => {};
  const doc = { body: {}, querySelectorAll: () => mounted ? [owner] : [] } as unknown as Document;
  const dependencies: DescriptionPresentationDependencies = {
    documents: () => [doc],
    classes: () => ({ owner: "info", description: "description" }),
    route: () => route,
    eligible: (id) => eligible && id === appId,
    ownerAppId: () => appId,
    visible: (candidate) => candidate.isConnected && ownerVisible,
    listen: (callback) => { routeListener = callback; return vi.fn(); },
    observe: (target, callback) => {
      const record = { target, callback, active: true };
      observers.push(record);
      return () => { record.active = false; };
    },
    schedule: (callback) => { expire = callback; return 1; },
    cancel: vi.fn(),
  };
  dependencies.visibility = dependencies.observe;
  const unpatchers: Array<() => void> = [];
  installMetadataDescriptions(unpatchers, dependencies);
  return { owner, dependencies, observers, unpatchers, expire: () => expire(),
    mount: () => { mounted = true; observers.filter((o) => o.active).forEach((o) => o.callback()); }, leaf: () => leaf,
    changeRoute: (value: string) => { route = value; routeListener(); },
    replace: () => { const old = leaf; leaf = makeLeaf(); observers.filter((o) => o.active).forEach((o) => o.callback()); return old; },
    replaceOwner: () => {
      const previousOwner = owner;
      const previousLeaf = leaf;
      Object.defineProperty(previousOwner, "isConnected", { value: false });
      owner = { isConnected: true, querySelectorAll: () => [leaf] } as unknown as HTMLElement;
      leaf = makeLeaf();
      observers.filter((o) => o.active).forEach((o) => o.callback());
      return previousLeaf;
    },
    remove: () => { ownerVisible = false; observers.filter((o) => o.active).forEach((o) => o.callback()); },
    scope: (id: number, allowed: boolean) => { appId = id; eligible = allowed; routeListener(); },
  };
};

describe("native description presentation ownership", () => {
  it("reads the confirmed owner scalar without traversing observable stores", () => {
    const props = { overview: { appid: 10 } };
    Object.defineProperty(props.overview, "unsafe", { get: () => { throw new Error("store enumeration"); } });
    const owner = { "__reactFiber$test": { return: { return: { memoizedProps: props } } } } as unknown as HTMLElement;
    expect(descriptionOwnerAppId(owner)).toBe(10);
    expect(descriptionOwnerAppId({} as HTMLElement)).toBe(0);
  });
  it("bounds route discovery and stops all discovery on leaving Game Info", () => {
    const h = harness({ delayed: true });
    expect(h.observers.filter((o) => o.active)).toHaveLength(1);
    h.changeRoute("/library/home");
    expect(h.observers.filter((o) => o.active)).toHaveLength(0);
    h.mount();
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
    const expired = harness({ delayed: true });
    expired.expire();
    expect(expired.observers.filter((o) => o.active)).toHaveLength(0);
  });
  it("attaches a delayed exact owner and rejects a mismatched or unmatched owner", () => {
    const h = harness({ delayed: true });
    h.mount();
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBe("10");
    const wrong = harness({ appId: 11 });
    expect(wrong.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
    const unmatched = harness({ allowed: false });
    expect(unmatched.observers.filter((o) => o.active)).toHaveLength(0);
    expect(unmatched.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
  });
  it("owns the exact eligible Game Info leaf and preserves plain text", () => {
    const h = harness();
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBe("10");
    expect(h.leaf().textContent).toBe("First paragraph\n\nSecond paragraph\n- List item");
    h.unpatchers.forEach((cleanup) => cleanup());
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
    expect(h.leaf().style.getPropertyValue("white-space")).toBe("normal");
    expect(h.observers.filter((observer) => observer.active)).toHaveLength(0);
  });
  it("restores replaced leaves and retains the outgoing visible owner until removed", () => {
    const h = harness();
    const old = h.replace();
    expect(old.getAttribute("data-decky-metadata-description")).toBeNull();
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBe("10");
    h.changeRoute("/library/home");
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBe("10");
    expect(h.observers.filter((observer) => observer.active).every((observer) => observer.target === h.owner)).toBe(true);
    h.remove();
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
    expect(h.observers.filter((observer) => observer.active)).toHaveLength(0);
  });
  it("restores a removed owner and attaches its replacement on the same Game Info route", () => {
    const h = harness();
    const oldLeaf = h.replaceOwner();
    expect(oldLeaf.getAttribute("data-decky-metadata-description")).toBeNull();
    expect(oldLeaf.style.getPropertyValue("white-space")).toBe("normal");
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBe("10");
    h.unpatchers.forEach((cleanup) => cleanup());
    expect(h.observers.filter((observer) => observer.active)).toHaveLength(0);
  });
  it("does not carry styling into an official, unmatched, or different app owner", () => {
    const h = harness();
    h.scope(11, false);
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
    h.changeRoute("/library/app/11/tab/GameInfo");
    expect(h.leaf().getAttribute("data-decky-metadata-description")).toBeNull();
    expect(h.observers.filter((observer) => observer.active)).toHaveLength(0);
  });
});
