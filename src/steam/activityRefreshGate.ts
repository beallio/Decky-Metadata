export const ACTIVITY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type ActivityRefreshGate = {
  shouldAttempt: (appId: number, nowMs: number, enrichedAtSeconds?: number) => boolean;
  markAttempt: (appId: number, nowMs: number) => void;
  markSettled: (appId: number) => void;
};

export const createActivityRefreshGate = (
  intervalMs: number = ACTIVITY_REFRESH_INTERVAL_MS
): ActivityRefreshGate => {
  const attempts = new Map<number, number>();
  const inFlight = new Set<number>();

  const isFresh = (timestampMs: number | undefined, nowMs: number) =>
    typeof timestampMs === "number" && timestampMs > 0 && nowMs - timestampMs < intervalMs;

  return {
    shouldAttempt: (appId: number, nowMs: number, enrichedAtSeconds?: number) => {
      if (!appId || inFlight.has(appId)) return false;
      if (isFresh(attempts.get(appId), nowMs)) return false;
      const enrichedAtMs = Number(enrichedAtSeconds || 0) * 1000;
      if (isFresh(enrichedAtMs, nowMs)) return false;
      return true;
    },
    markAttempt: (appId: number, nowMs: number) => {
      if (!appId) return;
      attempts.set(appId, nowMs);
      inFlight.add(appId);
    },
    markSettled: (appId: number) => {
      inFlight.delete(appId);
    },
  };
};
