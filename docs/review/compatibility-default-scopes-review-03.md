# Review — compatibility-default-scopes (round 03)

Candidate: `1e4bedd` (implementation `80197fd`). Read-only review of the shared-runtime correction; this candidate has not been installed.

## Verdict

Sharing the cache, policy state, and revision listeners addresses the split-state cause, but two related lifetime boundaries are still module-local or unguarded. Fix them before another live installation. No general architecture rewrite is requested.

## R1 — A retiring asynchronous cleanup can clear current in-flight work

`metadataState` now survives module reload, but three cleanup sites still assume it is module-local:

- `ensureMetadataCache` (`src/steam/metadataPatch.ts:757-758`) unconditionally assigns `metadataState.metadataLoadPromise = null` in the old request's finally callback.
- `tryFetchMetadataForApp` (`:967-968`) unconditionally deletes the app ID from `metadataState.loadingMetadata` in finally.
- `tryEnrichScreenshotsForApp` (`:1003-1004`) does the same for `loadingScreenshots`.

Sequence: request A starts; reload advances lifecycle and clears pending state; current request B starts and occupies the same promise field or app-ID guard; old A then settles. Its response is correctly rejected by the lifecycle guard, but its unconditional cleanup removes B's in-flight ownership. Another call can now start duplicate current work. This was isolated by separate module state before the new shared runtime.

Give cleanup ownership to the request that installed the state: compare the metadata promise identity before clearing it (as `ensureCompatibilityDefault` already does), and protect app-ID cleanup with lifecycle/request ownership. Do not let old finalizers clear current pending markers. Cover A/reload/B/A-settles/third-call for metadata loading and the per-app guards; B must remain the only active current request until B settles.

## R2 — A retained old editor still queues publication in the retired bundle

`deferredCompatibilityUpdates` and `deferredEditorCompatibilityPublications` remain module-local at `src/steam/metadataPatch.ts:280,285`. The retained editor/router callbacks cited in the correction can still call the OLD bundle's `applyMetadata`. Its editor save queues the ID in OLD `deferredEditorCompatibilityPublications` (`:923`), while the current router render calls the NEW bundle's `publishDeferredEditorCompatibility` (`:485`) and sees an empty set. Packed state can become correct without publishing the native map replacement, leaving Steam's collection stale. The same ownership mismatch is possible for held updates queued by a retained callback and flushed by the new listener.

Make deferred compatibility intent and editor publication ownership part of the same active shared runtime, or route retained callers through the current implementation. Keep the existing bounded queues and single publication path; do not add a parallel refresh system. Retain the existing reload handoff and real-teardown cancellation semantics, including no recreation of deleted shortcuts.

The regression must load two actual module instances, retain the old apply callback, then invoke that callback and flush/publish through the new instance. Assert current native entry replacement and category, with no duplicate publication or old-policy replay. A test that calls only `beginCompatibilityLifecycle` within one metadataPatch module does not expose the split queues.

## Evidence and boundaries

Run focused red/green cases before the fixes, then the full local gate. Preserve existing equal-value preview, popup remount transaction, migration, native ID normalization, and Game Info timing behavior. Remove any duplicated lifecycle-reset statement encountered in the touched block rather than retaining the duplicate `metadataLoadPromise = null` assignment.

Main owns all device actions. The Deck is reachable again, but this correction is local-only. Commit the fix, package the committed code, record results, mark the round finished, and exit. No device calls, approval note, merge, push, release, or unrelated edits.

STATUS: CHANGES_REQUESTED
