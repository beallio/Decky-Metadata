# Review — compatibility-status-defaults (round 18)

Branch: `feat/compatibility-status-defaults`
Reviewed commit: `bdf0248` (`fix(steam): preserve matched editor return identity`)

## Verdict

The editor-return correction removes a required publication instead of ordering it. Keep the concrete route-shield identity fix. Replace the blanket `publishCompatibility: false` with a strategy that still publishes the changed native entry for Steam's own compatibility collections.

## Required change

### R1 — An editor save must still reach Steam's compatibility filters

`docs/specs/compatibility-status.md` states that Steam's compatibility collections observe `m_mapApps`, not the plugin's revision listeners, and that the plugin publishes changed native entries after a completed write batch. After `bdf0248`, every editor save path passes `publishCompatibility: false`, and the only remaining editor-side call is `refreshCompatibilitySurfaces()`, which just notifies plugin revision listeners for Home and grid badges.

Nothing else publishes that change afterwards:

- The Game Info route-render path calls `applyMetadata(appId)` with publication enabled, but the editor already wrote the correct packed value directly, so `applyMetadataToOverview` reports no change and publishes nothing. On the Game Info route the held branch also returns `false`.
- `flushDeferredCompatibilityPublications` only iterates `deferredCompatibilityUpdates`, which is empty because opening the editor released the pending entry.

Consequence: a fixed per-game category set in the editor (S09-S12) updates the packed field and plugin-owned badges but can leave Steam's compatibility filter and collection membership stale until some unrelated later publication. Plan step 6 explicitly requires checking Steam's actual filter/collection membership, not only packed fields.

Order the publication instead of dropping it. Acceptable approaches include publishing the replacement once Steam has committed the destination route and the matched Game Info tree has re-entered, or keeping the editor write pending like an active-view update and publishing it through the existing exit/flush batch. Do not introduce a second general refresh system, a fixed timer that races the same window, per-app special cases, or a render-phase walk over MobX store instances.

### R2 — Prove both halves with regressions

Cover, in the real transition ordering:

1. An editor Save followed by `Done` keeps the matched rich Game Info render (the round 16/17 failure).
2. The same editor Save still results in exactly one published replacement for that native shortcut, so Steam's collections observe the change; assert the publication reaches the observable map rather than only the revision counter.

Keep the existing contracts: a confirmed editor Save wins over a queued default; QAM or context-menu cancellation does not release a held value; native launch identity, other detail tabs, and cross-game isolation stay correct.

Run the local gates, record actual results and the packaged version, commit, package locally, mark the round complete, and exit.

## Device state note

The Steam Deck is currently unreachable (SSH and debugger tunnel both fail), so no live validation ran for `bdf0248`. The fixture `2312439508` is still left at global Verified with per-game Unsupported from the interrupted round 17 session. Main owns restoring the captured baseline and running the live checks. Do not make device calls in this round.

STATUS: CHANGES_REQUESTED
