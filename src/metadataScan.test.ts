import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./backend", () => ({
  getScanProgress: vi.fn(),
  startScanMissing: vi.fn(),
  getMissingMetadataCount: vi.fn(),
}));
vi.mock("./steam", () => ({ refreshMetadataCache: vi.fn(), metadataCache: {} }));
vi.mock("./toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("./i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) => {
    if (key === "panel.refreshComplete") return "Refresh complete";
    if (key === "panel.scanCompleteSaved") {
      return `Refresh complete: ${values?.assigned}/${values?.total} saved`;
    }
    if (key === "panel.scanCompleteWithFailures") {
      return `Refresh complete: ${values?.assigned}/${values?.total} saved, ${values?.failed} not matched`;
    }
    return key;
  },
  translateBackendError: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

import type { MetadataScanDeps } from "./metadataScan";
import { MetadataScanStore, scanCompleteMessage, scanCompleteStatusKind } from "./metadataScan";
import { metadataCache } from "./steam";
import type { GameOption, ScanProgress } from "./types";

const flush = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const scan = (running: boolean, values: Partial<ScanProgress> = {}): ScanProgress => ({
  running,
  status: running ? "running" : "complete",
  total: 2,
  completed: running ? 0 : 2,
  assigned: 2,
  failed: 0,
  current: "",
  message: "",
  ...values,
});

const setup = () => {
  let nextTimer = 0;
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const getScanProgress = vi.fn(async () => scan(false));
  const startScanMissing = vi.fn(async () => undefined);
  const refreshMetadataCache = vi.fn(async () => undefined);
  const getMissingMetadataCount = vi.fn(async (_games: GameOption[]) => 0);
  const toastSuccess = vi.fn();
  const toastError = vi.fn();
  const setTimeout = vi.fn((callback: () => void, ms: number) => {
    const id = nextTimer++;
    timers.set(id, { callback, ms });
    return id;
  });
  const clearTimeout = vi.fn((id: number) => { timers.delete(id); });
  const deps: MetadataScanDeps = {
    getScanProgress,
    startScanMissing,
    refreshMetadataCache,
    getMissingMetadataCount,
    toastSuccess,
    toastError,
    setTimeout,
    clearTimeout,
  };
  const store = new MetadataScanStore(deps);
  const runNextTimer = () => {
    const next = timers.entries().next().value as [number, { callback: () => void; ms: number }] | undefined;
    if (!next) throw new Error("No pending timer");
    const [id, timer] = next;
    timers.delete(id);
    timer.callback();
  };
  return {
    store,
    deps,
    getScanProgress,
    startScanMissing,
    refreshMetadataCache,
    getMissingMetadataCount,
    toastSuccess,
    toastError,
    setTimeout,
    clearTimeout,
    timers,
    runNextTimer,
  };
};
afterEach(() => {
  vi.clearAllMocks();
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
});

describe("MetadataScanStore", () => {
  it("hydrates a running scan and completes once for two subscribers", async () => {
    const setupResult = setup();
    const running = scan(true);
    const complete = scan(false);
    setupResult.getScanProgress
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(complete);
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribeFirst = setupResult.store.subscribe(firstListener);
    const unsubscribeSecond = setupResult.store.subscribe(secondListener);

    await flush();
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: true, statusKind: "active", progress: running });
    expect(setupResult.getScanProgress).toHaveBeenCalledTimes(1);
    expect([...setupResult.timers.values()].map(({ ms }) => ms)).toEqual([800]);

    setupResult.runNextTimer();
    await flush();

    expect(setupResult.refreshMetadataCache).toHaveBeenCalledTimes(1);
    expect(setupResult.toastSuccess).toHaveBeenCalledTimes(1);
    expect(setupResult.store.getSnapshot()).toMatchObject({
      busy: false,
      statusKind: "success",
      progress: complete,
      completedRevision: 1,
    });
    expect(firstListener).toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalled();
    expect(setupResult.timers.size).toBe(0);
    unsubscribeFirst();
    unsubscribeSecond();
  });
  it("refreshes counts once on scan completion for all subscribers", async () => {
    const setupResult = setup();
    const games = [{ appid: 42 } as GameOption];
    Object.assign(metadataCache, { first: {}, second: {} });
    setupResult.getMissingMetadataCount.mockResolvedValueOnce(3);
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    setupResult.store.subscribe(firstListener);
    setupResult.store.subscribe(secondListener);
    await flush();
    await setupResult.store.start(games, async () => "english");
    setupResult.runNextTimer();
    await flush();

    expect(setupResult.refreshMetadataCache).toHaveBeenCalledTimes(1);
    expect(setupResult.getMissingMetadataCount).toHaveBeenCalledTimes(1);
    expect(setupResult.getMissingMetadataCount).toHaveBeenCalledWith(games);
    expect(setupResult.store.getSnapshot()).toMatchObject({ savedCount: 2, missingCount: 3 });
    expect(firstListener).toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalled();
    Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  });

  it("publishes refreshed counts to every subscriber", async () => {
    const setupResult = setup();
    Object.assign(metadataCache, { first: {}, second: {} });
    setupResult.getMissingMetadataCount.mockResolvedValueOnce(4);
    const listener = vi.fn();
    setupResult.store.subscribe(listener);
    await flush();
    await setupResult.store.refreshCounts([]);

    expect(setupResult.store.getSnapshot()).toMatchObject({ savedCount: 2, missingCount: 4 });
    expect(listener).toHaveBeenCalled();
    Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  });

  it("ignores counts that finish after dispose", async () => {
    const setupResult = setup();
    const missing = deferred<number>();
    setupResult.getMissingMetadataCount.mockReturnValueOnce(missing.promise);
    const refreshing = setupResult.store.refreshCounts([]);
    await flush();
    const snapshot = setupResult.store.getSnapshot();
    setupResult.store.dispose();
    missing.resolve(5);
    await refreshing;

    expect(setupResult.store.getSnapshot()).toBe(snapshot);
  });

  it("ignores an older count request that finishes last", async () => {
    const setupResult = setup();
    Object.assign(metadataCache, { first: {}, second: {} });
    const older = deferred<number>();
    const newer = deferred<number>();
    setupResult.getMissingMetadataCount
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const oldRefresh = setupResult.store.refreshCounts([]);
    await flush();
    const newRefresh = setupResult.store.refreshCounts([]);
    await flush();
    newer.resolve(2);
    await newRefresh;
    older.resolve(7);
    await oldRefresh;

    expect(setupResult.store.getSnapshot()).toMatchObject({ savedCount: 2, missingCount: 2 });
  });


  it("continues polling after the last subscriber unsubscribes", async () => {
    const setupResult = setup();
    setupResult.getScanProgress
      .mockResolvedValueOnce(scan(true))
      .mockResolvedValueOnce(scan(true, { completed: 1 }))
      .mockResolvedValueOnce(scan(false));
    const unsubscribe = setupResult.store.subscribe(vi.fn());
    await flush();
    unsubscribe();

    setupResult.runNextTimer();
    await flush();
    expect(setupResult.timers.size).toBe(1);
    setupResult.runNextTimer();
    await flush();

    expect(setupResult.getScanProgress).toHaveBeenCalledTimes(3);
    expect(setupResult.refreshMetadataCache).toHaveBeenCalledTimes(1);
    expect(setupResult.toastSuccess).toHaveBeenCalledTimes(1);
    expect(setupResult.store.getSnapshot().completedRevision).toBe(1);
  });

  it("handles start rejection without rejecting and shows one error toast", async () => {
    const setupResult = setup();
    const error = new Error("scan failed");
    setupResult.startScanMissing.mockRejectedValueOnce(error);

    await expect(setupResult.store.start([], async () => "french")).resolves.toBeUndefined();

    expect(setupResult.startScanMissing).toHaveBeenCalledWith([], "french");
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: false, statusKind: "error", error });
    expect(setupResult.toastError).toHaveBeenCalledTimes(1);
    expect(setupResult.toastError).toHaveBeenCalledWith("panel.toast.metadataRefreshFailed", "scan failed");
  });

  it("fails after three poll errors in a row and checks again on the next subscribe", async () => {
    const setupResult = setup();
    const error = new Error("poll failed");
    setupResult.getScanProgress
      .mockResolvedValueOnce(scan(true))
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(scan(true, { completed: 1 }));
    setupResult.store.subscribe(vi.fn());
    await flush();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      setupResult.runNextTimer();
      await flush();
    }

    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: false, statusKind: "error", error });
    expect(setupResult.toastError).toHaveBeenCalledTimes(1);
    expect(setupResult.toastError).toHaveBeenCalledWith("panel.toast.metadataRefreshFailed", "poll failed");
    expect(setupResult.timers.size).toBe(0);

    // The backend scan is still running: a new subscriber (QAM remount, Settings) picks it up again.
    setupResult.store.subscribe(vi.fn());
    await flush();
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: true, statusKind: "active", error: null });
    expect(setupResult.timers.size).toBe(1);
  });

  it("retries a dropped poll without losing the running scan", async () => {
    const setupResult = setup();
    setupResult.getScanProgress
      .mockResolvedValueOnce(scan(true))
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce(scan(false));
    setupResult.store.subscribe(vi.fn());
    await flush();

    setupResult.runNextTimer();
    await flush();
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: true, statusKind: "active" });
    expect(setupResult.toastError).not.toHaveBeenCalled();

    setupResult.runNextTimer();
    await flush();
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: false, statusKind: "success", completedRevision: 1 });
    expect(setupResult.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("checks again on the next subscribe after a failed hydrate", async () => {
    const setupResult = setup();
    setupResult.getScanProgress
      .mockRejectedValueOnce(new Error("backend not ready"))
      .mockResolvedValueOnce(scan(true));
    setupResult.store.subscribe(vi.fn());
    await flush();
    expect(setupResult.store.getSnapshot().busy).toBe(false);

    setupResult.store.subscribe(vi.fn());
    await flush();
    expect(setupResult.getScanProgress).toHaveBeenCalledTimes(2);
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: true, statusKind: "active" });
    expect(setupResult.timers.size).toBe(1);
  });

  it("ignores an in-flight poll after dispose", async () => {
    const setupResult = setup();
    const poll = deferred<ScanProgress>();
    setupResult.getScanProgress.mockResolvedValueOnce(scan(true)).mockReturnValueOnce(poll.promise);
    setupResult.store.subscribe(vi.fn());
    await flush();
    const snapshot = setupResult.store.getSnapshot();

    setupResult.runNextTimer();
    setupResult.store.dispose();
    poll.resolve(scan(false));
    await flush();

    expect(setupResult.store.getSnapshot()).toBe(snapshot);
    expect(setupResult.refreshMetadataCache).not.toHaveBeenCalled();
    expect(setupResult.toastSuccess).not.toHaveBeenCalled();
    expect(setupResult.toastError).not.toHaveBeenCalled();
    expect(setupResult.timers.size).toBe(0);
  });

  it("does not hydrate over a start and keeps one poll loop", async () => {
    const setupResult = setup();
    const hydration = deferred<ScanProgress>();
    setupResult.getScanProgress.mockReturnValueOnce(hydration.promise).mockResolvedValueOnce(scan(false));
    setupResult.store.subscribe(vi.fn());
    const starting = setupResult.store.start([], async () => "french");
    await starting;
    expect(setupResult.timers.size).toBe(1);

    hydration.resolve(scan(true));
    await flush();
    expect(setupResult.timers.size).toBe(1);
    setupResult.runNextTimer();
    await flush();

    expect(setupResult.getScanProgress).toHaveBeenCalledTimes(2);
    expect(setupResult.setTimeout).toHaveBeenCalledTimes(1);
    expect(setupResult.refreshMetadataCache).toHaveBeenCalledTimes(1);
    expect(setupResult.toastSuccess).toHaveBeenCalledTimes(1);
    expect(setupResult.store.getSnapshot().completedRevision).toBe(1);
  });

  it("marks busy before getLanguage resolves", async () => {
    const setupResult = setup();
    const language = deferred<string>();
    const starting = setupResult.store.start([], () => language.promise);

    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: true, statusKind: "active", progress: null, error: null });
    expect(setupResult.startScanMissing).not.toHaveBeenCalled();
    await setupResult.store.start([], async () => "ignored");
    expect(setupResult.startScanMissing).not.toHaveBeenCalled();

    language.resolve("french");
    await starting;
    expect(setupResult.startScanMissing).toHaveBeenCalledTimes(1);
    expect(setupResult.startScanMissing).toHaveBeenCalledWith([], "french");
  });

  it("handles getLanguage rejection with an error state and one toast", async () => {
    const setupResult = setup();
    const error = new Error("language failed");

    await expect(setupResult.store.start([], async () => Promise.reject(error))).resolves.toBeUndefined();

    expect(setupResult.startScanMissing).not.toHaveBeenCalled();
    expect(setupResult.store.getSnapshot()).toMatchObject({ busy: false, statusKind: "error", error });
    expect(setupResult.toastError).toHaveBeenCalledTimes(1);
    expect(setupResult.toastError).toHaveBeenCalledWith("panel.toast.metadataRefreshFailed", "language failed");
  });

  it("does not start a scan or toast when disposed during getLanguage", async () => {
    const setupResult = setup();
    const language = deferred<string>();
    const starting = setupResult.store.start([], () => language.promise);
    const snapshot = setupResult.store.getSnapshot();
    setupResult.store.dispose();

    language.resolve("french");
    await starting;

    expect(setupResult.store.getSnapshot()).toBe(snapshot);
    expect(setupResult.startScanMissing).not.toHaveBeenCalled();
    expect(setupResult.toastError).not.toHaveBeenCalled();
    expect(setupResult.timers.size).toBe(0);
  });

  it("keeps the existing completion message and status output", () => {
    expect(scanCompleteMessage({})).toBe("Refresh complete");
    expect(scanCompleteMessage({ total: 3, assigned: 2, failed: 1 })).toBe(
      "Refresh complete: 2/3 saved, 1 not matched",
    );
    expect(scanCompleteStatusKind({ total: 2, assigned: 2, failed: 0 })).toBe("success");
    expect(scanCompleteStatusKind({ total: 3, assigned: 2, failed: 0 })).toBe("warning");
    expect(scanCompleteStatusKind({ total: 3, assigned: 3, failed: 1 })).toBe("warning");
  });
});
