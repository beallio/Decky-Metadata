import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockHookCell =
  | { kind: "state"; value: unknown }
  | { kind: "ref"; current: unknown }
  | { kind: "callback"; callback: unknown; dependencies: unknown[] };
const harness = vi.hoisted(() => ({
  hookIndex: 0,
  hooks: [] as MockHookCell[],
  effectDeps: [] as Array<unknown[] | undefined>,
  pendingEffects: [] as Array<{ index: number; callback: () => void | (() => void) }>,
  cleanups: new Set<() => void>(),
}));
const state = vi.hoisted(() => ({ category: 3 as 0 | 1 | 2 | 3 | null, scope: "all" as "steam" | "no-steam" | "metadata" | "all", loaded: false, lifecycle: 1, current: true }));
const revisionListeners = vi.hoisted(() => new Set<() => void>());
const backend = vi.hoisted(() => ({
  setCompatibilityDefault: vi.fn(),
  setCompatibilityDefaultScope: vi.fn(),
}));
const steam = vi.hoisted(() => ({
  compatibilityDefaultSnapshot: vi.fn(),
  compatibilityDefaultScopeSnapshot: vi.fn(),
  compatibilityDefaultLoadedSnapshot: vi.fn(),
  compatibilityLifecycleSnapshot: vi.fn(),
  ensureCompatibilityDefault: vi.fn(),
  isCompatibilityLifecycleCurrent: vi.fn(),
  setConfirmedCompatibilityDefault: vi.fn(),
  setConfirmedCompatibilityDefaultScope: vi.fn(),
  subscribeCompatibilityRevision: vi.fn(),
}));
const ui = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
const logs = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("react", () => ({
  useCallback: <T,>(callback: T, dependencies: unknown[] = []): T => {
    const index = harness.hookIndex++;
    const old = harness.hooks[index];
    if (
      old?.kind === "callback"
      && dependencies.length === old.dependencies.length
      && dependencies.every((dependency, i) => dependency === old.dependencies[i])
    ) return old.callback as T;
    harness.hooks[index] = { kind: "callback", callback, dependencies };
    return callback;
  },
  useEffect: (callback: () => void | (() => void), dependencies?: unknown[]) => {
    const index = harness.hookIndex++;
    const oldDependencies = harness.effectDeps[index];
    if (!oldDependencies || dependencies?.some((dependency, i) => dependency !== oldDependencies[i])) {
      harness.effectDeps[index] = dependencies;
      harness.pendingEffects.push({ index, callback });
    }
  },
  useRef: <T,>(initial: T) => {
    const index = harness.hookIndex++;
    if (!(index in harness.hooks)) harness.hooks[index] = { kind: "ref", current: initial };
    return harness.hooks[index] as { kind: "ref"; current: T };
  },
  useState: <T,>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void] => {
    const index = harness.hookIndex++;
    if (!(index in harness.hooks)) {
      harness.hooks[index] = { kind: "state", value: typeof initial === "function" ? (initial as () => T)() : initial };
    }
    const cell = harness.hooks[index] as { kind: "state"; value: T };
    return [cell.value, (value) => {
      cell.value = typeof value === "function" ? (value as (previous: T) => T)(cell.value) : value;
    }];
  },
}));
vi.mock("../backend", () => backend);
vi.mock("../steam", () => steam);
vi.mock("../i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) => `${key} ${values?.error ?? ""}`,
  translateBackendError: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock("../toast", () => ui);
vi.mock("../log", () => logs);

import { useCompatibilityPolicy } from "./useCompatibilityPolicy";
import { clearCompatibilityPolicySave } from "../compatibilityPolicySave";

const deferred = <T,>() => {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  return { promise, resolve, reject };
};

const render = (hook = useCompatibilityPolicy) => {
  harness.hookIndex = 0;
  return hook();
};

const runEffects = () => {
  const effects = harness.pendingEffects.splice(0);
  for (const { index, callback } of effects) {
    const cleanup = callback();
    if (cleanup) harness.cleanups.add(cleanup);
  }
};

const unmount = () => {
  harness.cleanups.forEach((cleanup) => cleanup());
  harness.cleanups.clear();
};

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const mountLoaded = async () => {
  const result = render();
  runEffects();
  await flushPromises();
  return render();
};

beforeEach(() => {
  vi.resetAllMocks();
  state.category = 3;
  state.scope = "all";
  state.loaded = false;
  state.lifecycle = 1;
  state.current = true;
  revisionListeners.clear();
  harness.hookIndex = 0;
  harness.hooks = [];
  harness.effectDeps = [];
  harness.pendingEffects = [];
  harness.cleanups.clear();
  steam.compatibilityDefaultSnapshot.mockImplementation(() => state.category);
  steam.compatibilityDefaultScopeSnapshot.mockImplementation(() => state.scope);
  steam.compatibilityDefaultLoadedSnapshot.mockImplementation(() => state.loaded);
  steam.compatibilityLifecycleSnapshot.mockImplementation(() => state.lifecycle);
  steam.ensureCompatibilityDefault.mockImplementation(async () => {
    state.loaded = true;
    return state.category;
  });
  steam.isCompatibilityLifecycleCurrent.mockImplementation((generation: number) => state.current && state.lifecycle === generation);
  steam.setConfirmedCompatibilityDefault.mockImplementation((category: typeof state.category) => {
    state.category = category;
    state.loaded = true;
    return category;
  });
  steam.setConfirmedCompatibilityDefaultScope.mockImplementation((scope: typeof state.scope) => {
    state.scope = scope;
    return scope;
  });
  steam.subscribeCompatibilityRevision.mockImplementation((listener: () => void) => {
    revisionListeners.add(listener);
    return () => revisionListeners.delete(listener);
  });
  backend.setCompatibilityDefault.mockImplementation(async (category: typeof state.category) => category);
  backend.setCompatibilityDefaultScope.mockImplementation(async (scope: typeof state.scope) => scope);
  clearCompatibilityPolicySave();
});

afterEach(() => {
  unmount();
  clearCompatibilityPolicySave();
  vi.unstubAllGlobals();
});

describe("useCompatibilityPolicy", () => {
  it("applies a category only after the backend confirms the save", async () => {
    backend.setCompatibilityDefault.mockResolvedValue(2);
    const loaded = await mountLoaded();
    expect(loaded.compatibilityDefaultLoaded).toBe(true);
    loaded.onCompatibilityDefaultChange(2);
    expect(render().compatibilityDefault).toBe(3);
    await flushPromises();

    const saved = render();
    expect(backend.setCompatibilityDefault).toHaveBeenCalledWith(2);
    expect(steam.setConfirmedCompatibilityDefault).toHaveBeenCalledWith(2, 1);
    expect(saved.compatibilityDefault).toBe(2);
    expect(saved.compatibilityDefaultBusy).toBe(false);
    expect(ui.toastSuccess).toHaveBeenCalledOnce();
  });

  it("restores the confirmed category and reports a failed save", async () => {
    backend.setCompatibilityDefault.mockRejectedValue(new Error("disk unavailable"));
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultChange(2);
    await flushPromises();

    const failed = render();
    expect(failed.compatibilityDefault).toBe(3);
    expect(failed.compatibilityDefaultBusy).toBe(false);
    expect(failed.compatibilityDefaultError).toContain("disk unavailable");
    expect(steam.setConfirmedCompatibilityDefault).not.toHaveBeenCalled();
    expect(ui.toastError).toHaveBeenCalledOnce();
    expect(logs.warn).toHaveBeenCalledOnce();
  });

  it("does not apply a late save acknowledgement after the plugin lifecycle ends", async () => {
    const save = deferred<0 | 1 | 2 | 3 | null>();
    backend.setCompatibilityDefault.mockReturnValue(save.promise);
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultChange(2);
    state.current = false;
    save.resolve(2);
    await flushPromises();

    expect(steam.setConfirmedCompatibilityDefault).not.toHaveBeenCalled();
    expect(render().compatibilityDefault).toBe(3);
  });

  it("recovers after bootstrap later confirms the shared setting", async () => {
    steam.ensureCompatibilityDefault.mockRejectedValue(new Error("initial load failed"));
    const result = render();
    runEffects();
    await flushPromises();
    expect(render().compatibilityDefaultLoaded).toBe(false);
    expect(render().compatibilityDefaultError).toContain("initial load failed");

    state.category = 2;
    state.loaded = true;
    revisionListeners.forEach((listener) => listener());

    const recovered = render();
    expect(recovered.compatibilityDefault).toBe(2);
    expect(recovered.compatibilityDefaultLoaded).toBe(true);
    expect(recovered.compatibilityDefaultError).toBe("");
    expect(result.compatibilityDefaultLoaded).toBe(false);
  });

  it("publishes a scope only after the backend confirms the save", async () => {
    backend.setCompatibilityDefaultScope.mockResolvedValue("steam");
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultScopeChange("steam");
    expect(render().compatibilityDefaultScope).toBe("steam");
    expect(render().compatibilityDefaultScopeBusy).toBe(true);
    await flushPromises();

    const saved = render();
    expect(backend.setCompatibilityDefaultScope).toHaveBeenCalledWith("steam");
    expect(steam.setConfirmedCompatibilityDefaultScope).toHaveBeenCalledWith("steam", 1);
    expect(saved.compatibilityDefaultScope).toBe("steam");
    expect(saved.compatibilityDefaultScopeBusy).toBe(false);
  });

  it("restores the previous scope and reports a failed save", async () => {
    state.scope = "metadata";
    backend.setCompatibilityDefaultScope.mockRejectedValue(new Error("disk unavailable"));
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultScopeChange("all");
    expect(render().compatibilityDefaultScope).toBe("all");
    await flushPromises();

    const failed = render();
    expect(failed.compatibilityDefaultScope).toBe("metadata");
    expect(failed.compatibilityDefaultScopeBusy).toBe(false);
    expect(failed.compatibilityDefaultError).toContain("disk unavailable");
    expect(steam.setConfirmedCompatibilityDefaultScope).not.toHaveBeenCalled();
  });

  it("blocks overlapping policy saves until the active save finishes", async () => {
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultScopeChange("steam");
    loaded.onCompatibilityDefaultScopeChange("all");
    loaded.onCompatibilityDefaultChange(null);
    expect(backend.setCompatibilityDefaultScope).toHaveBeenCalledTimes(1);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    save.resolve("steam");
    await flushPromises();
    const settled = render();
    expect(settled.compatibilityDefaultScope).toBe("steam");
    expect(settled.compatibilityDefaultScopeBusy).toBe(false);

    settled.onCompatibilityDefaultChange(null);
    await flushPromises();
    expect(backend.setCompatibilityDefault).toHaveBeenCalledWith(null);
    expect(render().compatibilityDefault).toBeNull();
  });

  it("keeps a deferred scope save busy and visible", async () => {
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultScopeChange("steam");
    const pending = render();
    expect(pending.compatibilityDefaultScopeBusy).toBe(true);
    expect(pending.compatibilityDefaultScope).toBe("steam");
    pending.onCompatibilityDefaultChange(2);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    save.resolve("steam");
    await flushPromises();
    expect(render().compatibilityDefaultScopeBusy).toBe(false);
    expect(render().compatibilityDefaultScope).toBe("steam");
  });

  it("restores the previous value and error after a deferred scope save fails", async () => {
    state.scope = "metadata";
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);
    const loaded = await mountLoaded();

    loaded.onCompatibilityDefaultScopeChange("steam");
    expect(render().compatibilityDefaultScope).toBe("steam");
    expect(render().compatibilityDefaultScopeBusy).toBe(true);
    save.reject(new Error("disk unavailable"));
    await flushPromises();

    const failed = render();
    expect(failed.compatibilityDefaultScopeBusy).toBe(false);
    expect(failed.compatibilityDefaultScope).toBe("metadata");
    expect(failed.compatibilityDefaultError).toContain("disk unavailable");
  });

  it("shares a policy transaction across reloaded bundles", async () => {
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);
    const first = await mountLoaded();
    first.onCompatibilityDefaultScopeChange("metadata");

    vi.resetModules();
    // Reload the hook to model Decky evaluating a replacement bundle.
    const { useCompatibilityPolicy: useReloadedPolicy } = await import("./useCompatibilityPolicy");
    harness.hookIndex = 0;
    harness.hooks = [];
    harness.effectDeps = [];
    harness.pendingEffects = [];
    const reloaded = render(useReloadedPolicy);
    runEffects();
    await flushPromises();

    expect(reloaded.compatibilityDefaultScopeBusy).toBe(true);
    expect(render(useReloadedPolicy).compatibilityDefaultScope).toBe("metadata");
    render(useReloadedPolicy).onCompatibilityDefaultChange(2);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    save.resolve("metadata");
    await flushPromises();
    const settled = render(useReloadedPolicy);
    expect(settled.compatibilityDefaultScopeBusy).toBe(false);
    expect(settled.compatibilityDefaultScope).toBe("metadata");
    expect(settled.compatibilityDefault).toBe(3);
  });
});
