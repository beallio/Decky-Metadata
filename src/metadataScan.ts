import { useEffect, useState } from "react";

import { getScanProgress, startScanMissing } from "./backend";
import { t, translateBackendError } from "./i18n";
import { refreshMetadataCache } from "./steam";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import type { GameOption, ScanProgress } from "./types";

export type MetadataScanSnapshot = {
  progress: ScanProgress | null;
  busy: boolean;
  statusKind: StatusKind;
  error: unknown;
  completedRevision: number;
};

export type MetadataScanDeps = {
  getScanProgress: () => Promise<ScanProgress>;
  startScanMissing: (games: GameOption[], language: string) => Promise<unknown>;
  refreshMetadataCache: () => Promise<unknown>;
  toastSuccess: (title: string, body: string) => void;
  toastError: (title: string, body: string) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

export class MetadataScanStore {
  private snapshot: MetadataScanSnapshot = {
    progress: null,
    busy: false,
    statusKind: "idle",
    error: null,
    completedRevision: 0,
  };
  private readonly listeners = new Set<() => void>();
  private timer: number | null = null;
  private pollInFlight = false;
  private hydrationStarted = false;
  private generation = 0;
  private startRevision = 0;

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
      // A failed check leaves the store idle; the next start() still works.
      return;
    }
    if (generation !== this.generation) return;
    if (startRevision !== this.startRevision || !progress.running) return;
    this.publish({ progress, busy: true, statusKind: "active" });
    this.ensurePolling();
  }

  async start(games: GameOption[], getLanguage: () => Promise<string>): Promise<void> {
    this.startRevision += 1;
    if (this.snapshot.busy) return;
    this.publish({ busy: true, statusKind: "active", progress: null, error: null });
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
    try {
      const progress = await this.deps.getScanProgress();
      if (generation !== this.generation) return;
      this.publish({ progress, statusKind: "active" });
      if (progress.running) {
        this.pollInFlight = false;
        this.ensurePolling();
        return;
      }
      await this.deps.refreshMetadataCache();
      if (generation !== this.generation) return;
      this.pollInFlight = false;
      this.publish({
        busy: false,
        statusKind: scanCompleteStatusKind(progress),
        completedRevision: this.snapshot.completedRevision + 1,
      });
      this.deps.toastSuccess(t("panel.toast.metadata"), t("panel.refreshComplete"));
    } catch (error) {
      if (generation !== this.generation) return;
      this.pollInFlight = false;
      this.fail(error);
    }
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
