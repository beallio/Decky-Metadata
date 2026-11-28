import { getHltbStats, type HltbEntry, type HltbStatsResult } from "../backend";

type TimerHandle = number | NodeJS.Timeout;
const DAY_MS = 86_400_000;
export const HLTB_MATCHED_TTL_MS = 14 * DAY_MS;
export const HLTB_NO_MATCH_TTL_MS = 7 * DAY_MS;

/** What a lookup is based on; a saved entry for other inputs is never shown. */
export type HltbInputs = { steam: number | null; title: string; pinned: number | null };
export type HltbView = { entry: HltbEntry | null; needsFetch: boolean };
type Fetch = (appId: number, isShortcut: boolean, title: string, usePinned?: boolean) => Promise<HltbStatsResult>;

const isEntry = (value: HltbStatsResult): value is HltbEntry =>
  value.status === "matched" || value.status === "no_match";
const inputsKey = (inputs: HltbInputs) => JSON.stringify([inputs.steam, inputs.title, inputs.pinned]);
/** Isolates pinned Library lookups from automatic Store lookups for the same Steam app. */
const slotKey = (appId: number, pinned: number | null) => `${appId}:${pinned ?? ""}`;

/** Saved HLTB results by app ID, available synchronously while a game page renders. */
export class HltbStore {
  private readonly entries = new Map<string, HltbEntry>();
  private readonly blocked = new Map<string, string>();
  private readonly inFlight = new Map<string, object>();
  private readonly retryAt = new Map<string, number>();
  private readonly retryTimers = new Map<string, TimerHandle>();
  private readonly listeners = new Map<number, Set<() => void>>();

  constructor(private readonly fetchStats: Fetch = getHltbStats) {}

  /** Load saved entries; a result fetched during this session wins. */
  seed(entries: Record<string, HltbEntry>): void {
    for (const [id, entry] of Object.entries(entries)) {
      const appId = Number(id);
      if (Number.isSafeInteger(appId) && appId > 0) {
        const key = slotKey(appId, entry.pinned_id_used ?? null);
        if (!this.entries.has(key)) this.entries.set(key, entry);
      }
    }
  }

  /** Fresh: show, no request. Expired: show and refresh. Missing or other inputs: show nothing and look up. */
  view(appId: number, inputs: HltbInputs, now = Date.now()): HltbView {
    const key = slotKey(appId, inputs.pinned);
    if (this.blocked.get(key) === inputsKey(inputs)) return { entry: null, needsFetch: false };
    const entry = this.entries.get(key);
    if (!entry || entry.steam_appid_used !== inputs.steam || entry.title_used !== inputs.title ||
        entry.pinned_id_used !== inputs.pinned) return { entry: null, needsFetch: true };
    const ttl = entry.status === "matched" ? HLTB_MATCHED_TTL_MS : HLTB_NO_MATCH_TTL_MS;
    return { entry, needsFetch: now - entry.fetched_at >= ttl };
  }

  /** At most one lookup per game slot at a time, and none while a failed lookup is waiting. */
  request(appId: number, isShortcut: boolean, inputs: HltbInputs, now = Date.now(), usePinned = true): void {
    const key = slotKey(appId, inputs.pinned);
    if (this.inFlight.has(key)) return;
    const retryAt = this.retryAt.get(key) ?? 0;
    if (retryAt > now) {
      if (this.listeners.get(appId)?.size && !this.retryTimers.has(key)) {
        this.scheduleRetry(appId, key, retryAt - now);
      }
      return;
    }
    const request = {};
    this.inFlight.set(key, request);
    const ownsRequest = () => this.inFlight.get(key) === request;
    const call = usePinned
      ? this.fetchStats(appId, isShortcut, inputs.title)
      : this.fetchStats(appId, isShortcut, inputs.title, false);
    void call.then(
      (result) => {
        if (!ownsRequest()) return;
        if (isEntry(result)) {
          const resultKey = slotKey(appId, result.pinned_id_used ?? null);
          this.entries.set(resultKey, result);
          this.blocked.delete(resultKey);
        } else if (result.status === "error") {
          this.retryAt.set(key, Date.now() + Math.max(1_000, result.retry_after_ms));
          this.scheduleRetry(appId, key, Math.max(1_000, result.retry_after_ms));
        } else {
          this.blocked.set(key, inputsKey(inputs));
        }
        this.notify(appId);
      },
      () => {
        if (ownsRequest()) {
          this.retryAt.set(key, Date.now() + 30_000);
          this.scheduleRetry(appId, key, 30_000);
        }
      },
    ).finally(() => {
      if (ownsRequest()) this.inFlight.delete(key);
    });
  }

  subscribe(appId: number, listener: () => void): () => void {
    let set = this.listeners.get(appId);
    if (!set) this.listeners.set(appId, set = new Set());
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(appId);
        for (const key of this.retryTimers.keys()) {
          if (key.startsWith(`${appId}:`)) {
            this.clearRetry(key);
          }
        }
      }
    };
  }

  /** Forget one game after Remove metadata or an HLTB override change; its next view asks the backend again. */
  forget(appId: number): void {
    const prefix = `${appId}:`;
    for (const key of [...this.retryTimers.keys()]) if (key.startsWith(prefix)) this.clearRetry(key);
    for (const map of [this.entries, this.blocked, this.retryAt, this.inFlight]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(prefix)) map.delete(key);
      }
    }
    this.notify(appId);
  }

  /** Forget everything, e.g. after Clear cache or when the feature stops. */
  reset(): void {
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.entries.clear();
    this.blocked.clear();
    this.inFlight.clear();
    this.retryAt.clear();
    for (const appId of [...this.listeners.keys()]) this.notify(appId);
  }

  private scheduleRetry(appId: number, key: string, delay: number): void {
    this.clearRetry(key);
    this.retryTimers.set(key, setTimeout(() => {
      this.retryTimers.delete(key);
      this.retryAt.delete(key);
      if (this.listeners.get(appId)?.size) this.notify(appId);
    }, Math.max(0, delay)));
  }

  private clearRetry(key: string): void {
    const timer = this.retryTimers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.retryTimers.delete(key);
  }

  private notify(appId: number): void {
    for (const listener of this.listeners.get(appId) ?? []) {
      try {
        listener();
      } catch {
        // One unmounting page must not block others.
      }
    }
  }
}

export const hltbStore = new HltbStore();
