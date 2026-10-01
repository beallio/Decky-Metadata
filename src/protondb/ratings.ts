import { fetchNoCors } from "@decky/api";
import type { ProtonDbTier } from "../types";

export type ProtonDbRating = Readonly<{
  tier: ProtonDbTier | null;
  status: "idle" | "loading" | "ready" | "error";
  updatedAt: number | null;
}>;

export type ProtonDbTierFetcher = (steamAppId: number) => Promise<ProtonDbTier | null>;

export const PROTONDB_RATING_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const RETRY_COOLDOWN_MS = 30_000;
const SUMMARY_URL = "https://www.protondb.com/api/v1/reports/summaries";
const protonDbTiers: Record<ProtonDbTier, true> = {
  platinum: true,
  gold: true,
  silver: true,
  bronze: true,
  borked: true,
};
const isProtonDbTier = (value: unknown): value is ProtonDbTier =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(protonDbTiers, value);

type TimerHandle = number | NodeJS.Timeout;

const fetchProtonDbTier: ProtonDbTierFetcher = async (steamAppId) => {
  const response = await fetchNoCors(`${SUMMARY_URL}/${steamAppId}.json`, { method: "GET" });
  if (response.status === 404) return null;
  if (response.status !== 200) {
    throw new Error(`ProtonDB summary request failed with HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("tier" in payload)) {
    throw new Error("ProtonDB returned a malformed summary");
  }

  const tier = payload.tier;
  if (tier === null || tier === "pending") return null;
  if (!isProtonDbTier(tier)) throw new Error("ProtonDB returned an invalid tier");
  return tier;
};

type InFlightRequest = {
  lifecycle: number;
  timeout: TimerHandle;
};

type RatingEntry = {
  rating: ProtonDbRating;
  listeners: Set<() => void>;
  request?: InFlightRequest;
  expiryTimer?: TimerHandle;
  retryAfter: number;
};

const validSteamAppId = (steamAppId: number): boolean =>
  Number.isSafeInteger(steamAppId) && steamAppId > 0 && steamAppId < 0x80000000;

const ratingValue = (
  tier: ProtonDbTier | null,
  status: ProtonDbRating["status"],
  updatedAt: number | null,
): ProtonDbRating => Object.freeze({ tier, status, updatedAt });

const invalidRating = ratingValue(null, "idle", null);

/** Shared in-memory ratings; fetches are owned by the currently visible subscribers. */
export class ProtonDbRatingCache {
  private readonly entries = new Map<number, RatingEntry>();
  private lifecycle = 0;
  private mounted = false;
  private enabled = false;

  constructor(private readonly fetchTier: ProtonDbTierFetcher = fetchProtonDbTier) {}

  getRating(steamAppId: number): ProtonDbRating {
    if (!validSteamAppId(steamAppId)) return invalidRating;
    return this.getEntry(steamAppId).rating;
  }

  subscribeRating(steamAppId: number, listener: () => void): () => void {
    if (!validSteamAppId(steamAppId)) return () => undefined;

    const entry = this.getEntry(steamAppId);
    entry.listeners.add(listener);
    this.loadIfNeeded(steamAppId, entry);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) this.clearExpiry(entry);
    };
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    if (this.enabled) {
      for (const [steamAppId, entry] of this.entries) this.loadIfNeeded(steamAppId, entry);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;

    if (!enabled) {
      for (const entry of this.entries.values()) {
        this.clearExpiry(entry);
        this.cancelRequest(entry, true);
      }
      return;
    }

    if (this.mounted) {
      for (const [steamAppId, entry] of this.entries) this.loadIfNeeded(steamAppId, entry);
    }
  }

  stop(): void {
    this.lifecycle += 1;
    this.mounted = false;
    this.enabled = false;

    for (const entry of this.entries.values()) {
      this.clearExpiry(entry);
      entry.listeners.clear();
      this.cancelRequest(entry, false);
      entry.retryAfter = 0;
    }
  }

  private getEntry(steamAppId: number): RatingEntry {
    let entry = this.entries.get(steamAppId);
    if (!entry) {
      entry = { rating: ratingValue(null, "idle", null), listeners: new Set(), retryAfter: 0 };
      this.entries.set(steamAppId, entry);
    }
    return entry;
  }

  private isActive(entry: RatingEntry): boolean {
    return this.mounted && this.enabled && entry.listeners.size > 0;
  }

  private loadIfNeeded(steamAppId: number, entry: RatingEntry): void {
    if (!this.isActive(entry) || entry.request) return;

    const now = Date.now();
    const { status, updatedAt } = entry.rating;
    if (updatedAt !== null && now - updatedAt < PROTONDB_RATING_TTL_MS) {
      if (status === "ready") {
        this.scheduleExpiry(steamAppId, entry);
        return;
      }
      if (status === "error" && now < entry.retryAfter) return;
      if (status !== "error") return;
    } else if (status === "error" && now < entry.retryAfter) {
      return;
    }

    this.clearExpiry(entry);
    const request: InFlightRequest = {
      lifecycle: this.lifecycle,
      timeout: globalThis.setTimeout(
        () => this.failRequest(entry, request, new Error("ProtonDB summary request timed out")),
        FETCH_TIMEOUT_MS,
      ),
    };
    entry.request = request;
    this.setRating(entry, entry.rating.tier, "loading", entry.rating.updatedAt);

    let pending: Promise<ProtonDbTier | null>;
    try {
      pending = this.fetchTier(steamAppId);
    } catch (error) {
      this.failRequest(entry, request, error);
      return;
    }

    void Promise.resolve(pending).then(
      (tier) => this.completeRequest(steamAppId, entry, request, tier),
      (error: unknown) => this.failRequest(entry, request, error),
    );
  }

  private completeRequest(
    steamAppId: number,
    entry: RatingEntry,
    request: InFlightRequest,
    tier: ProtonDbTier | null,
  ): void {
    if (!this.isCurrentRequest(entry, request)) return;
    globalThis.clearTimeout(request.timeout);
    entry.request = undefined;
    entry.retryAfter = 0;
    this.setRating(entry, tier, "ready", Date.now());
    this.scheduleExpiry(steamAppId, entry);
  }

  private failRequest(entry: RatingEntry, request: InFlightRequest, _error: unknown): void {
    if (!this.isCurrentRequest(entry, request)) return;
    globalThis.clearTimeout(request.timeout);
    entry.request = undefined;
    entry.retryAfter = Date.now() + RETRY_COOLDOWN_MS;
    this.setRating(entry, entry.rating.tier, "error", entry.rating.updatedAt);
  }

  private isCurrentRequest(entry: RatingEntry, request: InFlightRequest): boolean {
    return this.lifecycle === request.lifecycle && entry.request === request && this.mounted && this.enabled;
  }

  private scheduleExpiry(steamAppId: number, entry: RatingEntry): void {
    if (!this.isActive(entry) || entry.rating.updatedAt === null || entry.expiryTimer !== undefined) return;
    const remaining = Math.max(0, entry.rating.updatedAt + PROTONDB_RATING_TTL_MS - Date.now());
    entry.expiryTimer = globalThis.setTimeout(() => {
      entry.expiryTimer = undefined;
      this.loadIfNeeded(steamAppId, entry);
    }, remaining);
  }

  private clearExpiry(entry: RatingEntry): void {
    if (entry.expiryTimer !== undefined) {
      globalThis.clearTimeout(entry.expiryTimer);
      entry.expiryTimer = undefined;
    }
  }

  private cancelRequest(entry: RatingEntry, notify: boolean): void {
    const request = entry.request;
    if (!request) return;
    globalThis.clearTimeout(request.timeout);
    entry.request = undefined;
    const { tier, updatedAt } = entry.rating;
    const status = updatedAt === null ? "idle" : "ready";
    this.setRating(entry, tier, status, updatedAt, notify);
  }

  private setRating(
    entry: RatingEntry,
    tier: ProtonDbTier | null,
    status: ProtonDbRating["status"],
    updatedAt: number | null,
    notify = true,
  ): void {
    const previous = entry.rating;
    if (previous.tier === tier && previous.status === status && previous.updatedAt === updatedAt) return;
    entry.rating = ratingValue(tier, status, updatedAt);
    if (!notify) return;
    for (const listener of entry.listeners) {
      try {
        listener();
      } catch {
        // One mounted surface must not prevent other rating subscribers from updating.
      }
    }
  }
}

export const protonDbRatingCache = new ProtonDbRatingCache();
