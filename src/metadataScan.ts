import { useEffect, useState } from "react";

import { getMissingMetadataCount, getScanProgress, startScanMissing } from "./backend";
import { t, translateBackendError } from "./i18n";
import * as log from "./log";
import { metadataCache, refreshMetadataCache } from "./steam";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import type { GameOption, ScanProgress } from "./types";

export type MetadataScanSnapshot = {
  progress: ScanProgress | null;
  busy: boolean;
  statusKind: StatusKind;
  error: unknown;
  completedRevision: number;
  savedCount: number;
  missingCount: number;
};

export type MetadataScanDeps = {
  getScanProgress: () => Promise<ScanProgress>;
  startScanMissing: (games: GameOption[], language: string) => Promise<unknown>;
  refreshMetadataCache: () => Promise<unknown>;
  getMissingMetadataCount: (games: GameOption[]) => Promise<number>;
  toastSuccess: (title: string, body: string) => void;
  toastError: (title: string, body: string) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

// Consecutive getScanProgress failures before the store reports the scan as failed.
const MAX_POLL_FAILURES = 3;

export class MetadataScanStore {
  private snapshot: MetadataScanSnapshot = {
    progress: null,
    busy: false,
    statusKind: "idle",
    error: null,
    completedRevision: 0,
    savedCount: 0,
    missingCount: 0,
  };
  private readonly listeners = new Set<() => void>();
  private timer: number | null = null;
  private pollInFlight = false;
  private hydrationStarted = false;
  private generation = 0;
  private startRevision = 0;
  private pollFailures = 0;
  private countRevision = 0;
  // Last game list from start() or a surface's refreshCounts(); a hydrated scan has no start() call.
  private scanGames: GameOption[] = [];

  constructor(private readonly deps: MetadataScanDeps) {}

  getSnapshot(): MetadataScanSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.hydrationStarted) void this.hydrate();
    return () => this.listeners.delete(listener);
  }

  async hydrate(): Promise<void> {
    if (this.hydrationStarted) return;
    this.hydrationStarted = true;
    const generation = this.generation;
    const startRevision = this.startRevision;
    let progress: ScanProgress;
    try {
      progress = await this.deps.getScanProgress();
    } catch {
      // A failed check must not hide a running scan for good: the next subscribe checks again.
      if (generation === this.generation) this.hydrationStarted = false;
      return;
    }
    if (generation !== this.generation) return;
    if (startRevision !== this.startRevision || !progress.running) return;
    this.publish({ progress, busy: true, statusKind: "active", error: null });
    this.ensurePolling();
  }
  async refreshCounts(games: GameOption[]): Promise<void> {
    this.scanGames = games;
    const generation = this.generation;
    const revision = ++this.countRevision;
    await this.deps.refreshMetadataCache();
    if (generation !== this.generation || revision !== this.countRevision) return;
    const savedCount = Object.keys(metadataCache).length;
    let missingCount = this.snapshot.missingCount;
    try {
      missingCount = await this.deps.getMissingMetadataCount(games);
    } catch (error) {
      if (generation === this.generation && revision === this.countRevision) {
        log.warn("bridge", "missing metadata count load failed", error);
      }
    }
    if (generation !== this.generation || revision !== this.countRevision) return;
    this.publish({ savedCount, missingCount });
  }

  async start(games: GameOption[], getLanguage: () => Promise<string>): Promise<void> {
    this.startRevision += 1;
    if (this.snapshot.busy) return;
    this.publish({ busy: true, statusKind: "active", progress: null, error: null });
    this.scanGames = games;
    const generation = this.generation;
    let language: string;
    try {
      language = await getLanguage();
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error);
      return;
    }
    if (generation !== this.generation) return;
    try {
      await this.deps.startScanMissing(games, language);
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error);
      return;
    }
    if (generation !== this.generation) return;
    this.ensurePolling();
  }

  dispose(): void {
    this.generation += 1;
    if (this.timer !== null) {
      this.deps.clearTimeout(this.timer);
      this.timer = null;
    }
    this.pollInFlight = false;
  }

  private ensurePolling(): void {
    if (this.timer !== null || this.pollInFlight) return;
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, 800);
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight) return;
    const generation = this.generation;
    this.pollInFlight = true;
    let progress: ScanProgress;
    try {
      progress = await this.deps.getScanProgress();
    } catch (error) {
      if (generation !== this.generation) return;
      this.pollInFlight = false;
      // The backend scan keeps running through a dropped RPC, so retry before giving up.
      this.pollFailures += 1;
      if (this.pollFailures < MAX_POLL_FAILURES) {
        this.ensurePolling();
        return;
      }
      this.pollFailures = 0;
      this.hydrationStarted = false;
      this.fail(error);
      return;
    }
    if (generation !== this.generation) return;
    this.pollFailures = 0;
    this.publish({ progress, statusKind: "active" });
    if (progress.running) {
      this.pollInFlight = false;
      this.ensurePolling();
      return;
    }
    try {
      await this.refreshCounts(this.scanGames);
    } catch (error) {
      if (generation !== this.generation) return;
      this.pollInFlight = false;
      this.fail(error);
      return;
    }
    if (generation !== this.generation) return;
    this.pollInFlight = false;
    this.publish({
      busy: false,
      statusKind: scanCompleteStatusKind(progress),
      completedRevision: this.snapshot.completedRevision + 1,
    });
    this.deps.toastSuccess(t("panel.toast.metadata"), t("panel.refreshComplete"));
  }

  private fail(error: unknown): void {
    this.publish({ busy: false, statusKind: "error", error });
    this.deps.toastError(t("panel.toast.metadataRefreshFailed"), translateBackendError(error));
  }

  private publish(update: Partial<MetadataScanSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }
}

export const metadataScanStore = new MetadataScanStore({
  getScanProgress,
  startScanMissing,
  refreshMetadataCache,
  getMissingMetadataCount,
  toastSuccess,
  toastError,
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
});

export function useMetadataScan(): MetadataScanSnapshot {
  const [snapshot, setSnapshot] = useState(metadataScanStore.getSnapshot());
  useEffect(() => {
    const refresh = () => setSnapshot(metadataScanStore.getSnapshot());
    const unsubscribe = metadataScanStore.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  return snapshot;
}

export const scanCompleteMessage = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}): string => {
  const total = Number(progress.total || 0);
  if (!total) return t("panel.refreshComplete");
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed
    ? t("panel.scanCompleteWithFailures", { assigned, total, failed })
    : t("panel.scanCompleteSaved", { assigned, total });
};

export const scanCompleteStatusKind = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}): StatusKind => {
  const total = Number(progress.total || 0);
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed > 0 || (total > 0 && assigned < total) ? "warning" : "success";
};
