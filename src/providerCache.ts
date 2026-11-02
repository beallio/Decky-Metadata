import { getProviderCache, type ProviderCacheSnapshot } from "./backend";

let pending: Promise<ProviderCacheSnapshot> | undefined;

/** One saved-cache read shared by the features that seed from it at startup. */
export const loadProviderCache = (): Promise<ProviderCacheSnapshot> => {
  pending ??= getProviderCache();
  return pending;
};

/** Drop the shared read once every consumer has started, so the snapshot can be freed. */
export const releaseProviderCache = (): void => {
  pending = undefined;
};
