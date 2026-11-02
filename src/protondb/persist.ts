import { putProtonDbCache, type ProtonDbNameRecord, type ProtonDbRatingRecord } from "../backend";
import type { ProtonDbTier } from "../types";

type Put = (ratings: Record<string, ProtonDbRatingRecord>, nameIds: Record<string, ProtonDbNameRecord>) => Promise<unknown>;
type TimerHandle = number | NodeJS.Timeout;

/** Collects saved-cache changes and sends them to the backend at most once per delay. */
export class ProtonDbCacheWriter {
  private ratings: Record<string, ProtonDbRatingRecord> = {};
  private nameIds: Record<string, ProtonDbNameRecord> = {};
  private timer: TimerHandle | undefined;

  constructor(private readonly put: Put = putProtonDbCache, private readonly delayMs = 1_000) {}

  rating(steamAppId: number, tier: ProtonDbTier | null, updatedAt: number): void {
    this.ratings[String(steamAppId)] = { tier, updated_at: updatedAt };
    this.schedule();
  }

  name(shortcutAppId: number, name: string, steamAppId: number, resolvedAt = Date.now()): void {
    this.nameIds[String(shortcutAppId)] = { name, steam_appid: steamAppId, resolved_at: resolvedAt };
    this.schedule();
  }

  flush(): void {
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    const ratings = this.ratings;
    const nameIds = this.nameIds;
    if (Object.keys(ratings).length === 0 && Object.keys(nameIds).length === 0) return;
    this.ratings = {};
    this.nameIds = {};
    // A failed save only costs a fetch after the next restart.
    void this.put(ratings, nameIds).catch(() => undefined);
  }

  private schedule(): void {
    if (this.timer === undefined) this.timer = globalThis.setTimeout(() => this.flush(), this.delayMs);
  }
}
