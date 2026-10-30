import { getHltbStats, type HltbEntry, type HltbStatsResult } from "../backend";

const DAY_MS = 86_400_000;
export const HLTB_MATCHED_TTL_MS = 14 * DAY_MS;
export const HLTB_NO_MATCH_TTL_MS = 7 * DAY_MS;

/** What a lookup is based on; a saved entry for other inputs is never shown. */
export type HltbInputs = { steam: number | null; title: string; pinned: number | null };
export type HltbView = { entry: HltbEntry | null; needsFetch: boolean };
type Fetch = (appId: number, isShortcut: boolean, title: string) => Promise<HltbStatsResult>;

const isEntry = (value: HltbStatsResult): value is HltbEntry =>
  value.status === "matched" || value.status === "no_match";
const inputsKey = (inputs: HltbInputs) => JSON.stringify([inputs.steam, inputs.title, inputs.pinned]);

/** Saved HLTB results by app ID, available synchronously while a game page renders. */
export class HltbStore {
  private readonly entries = new Map<number, HltbEntry>();
  private readonly blocked = new Map<number, string>();
  private readonly inFlight = new Set<number>();
  private readonly retryAt = new Map<number, number>();
  private readonly listeners = new Map<number, Set<() => void>>();
  private generation = 0;

  constructor(private readonly fetchStats: Fetch = getHltbStats) {}

  /** Load saved entries; a result fetched during this session wins. */
  seed(entries: Record<string, HltbEntry>): void {
    for (const [id, entry] of Object.entries(entries)) {
      const appId = Number(id);
      if (Number.isSafeInteger(appId) && appId > 0 && !this.entries.has(appId)) this.entries.set(appId, entry);
    }
  }

  /** Fresh: show, no request. Expired: show and refresh. Missing or other inputs: show nothing and look up. */
  view(appId: number, inputs: HltbInputs, now = Date.now()): HltbView {
    if (this.blocked.get(appId) === inputsKey(inputs)) return { entry: null, needsFetch: false };
    const entry = this.entries.get(appId);
    if (!entry || entry.steam_appid_used !== inputs.steam || entry.title_used !== inputs.title ||
        entry.pinned_id_used !== inputs.pinned) return { entry: null, needsFetch: true };
    const ttl = entry.status === "matched" ? HLTB_MATCHED_TTL_MS : HLTB_NO_MATCH_TTL_MS;
    return { entry, needsFetch: now - entry.fetched_at >= ttl };
  }

  /** At most one lookup per game at a time, and none while a failed lookup is waiting. */
  request(appId: number, isShortcut: boolean, inputs: HltbInputs, now = Date.now()): void {
    if (this.inFlight.has(appId) || (this.retryAt.get(appId) ?? 0) > now) return;
    const generation = this.generation;
    this.inFlight.add(appId);
    void this.fetchStats(appId, isShortcut, inputs.title).then(
      (result) => {
        if (generation !== this.generation) return;
        if (isEntry(result)) {
          this.entries.set(appId, result);
          this.blocked.delete(appId);
        } else if (result.status === "error") {
          this.retryAt.set(appId, Date.now() + Math.max(1_000, result.retry_after_ms));
        } else {
          this.blocked.set(appId, inputsKey(inputs));
        }
        this.notify(appId);
      },
      () => {
        if (generation === this.generation) this.retryAt.set(appId, Date.now() + 30_000);
      },
    ).finally(() => {
      if (generation === this.generation) this.inFlight.delete(appId);
    });
  }

  subscribe(appId: number, listener: () => void): () => void {
    let set = this.listeners.get(appId);
    if (!set) this.listeners.set(appId, set = new Set());
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(appId);
    };
  }

  /** Forget everything, e.g. after Clear cache or when the feature stops. */
  reset(): void {
    this.generation += 1;
    this.entries.clear();
    this.blocked.clear();
    this.inFlight.clear();
    this.retryAt.clear();
    for (const appId of [...this.listeners.keys()]) this.notify(appId);
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
