# Review — compatibility-status-defaults (round 01)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Changes are required before integration. Reviewed commit:
`c2451f8c405b1ffe0ad8f479b9eca7240c2c50ad`.
The requested dropdowns and documentation are present, but async teardown,
settings recovery, metadata refresh, and scan preservation have material
defects. Three independent read-only reviews covered backend, native Steam
integration, and frontend UI. The orchestrator reproduced the three backend
failures against the actual methods with isolated settings.

## Gate status

- The implementer recorded a passing final local gate: 27 Vitest files /
  445 tests, TypeScript, Rollup, Python compilation, pytest, and version guard.
- The valid round-complete marker names the reviewed commit. Its working
  tree was clean before this review note was created.
- The durable specification contains all 32 scenario IDs from the plan.
- Backend reproduction evidence:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round1-review-probe.log`.
  It observed three wrong values: sanitized scan override `None` instead of
  `"valve"`; trusted rematch scan category `None` instead of `2`; same-match
  network failure category `None` instead of the cached `2`.
- Frontend findings below are source-traced, not claimed as executed tests.
  Add the behavioral reproductions and record their red-to-green results.
- Live acceptance is outstanding. **The user has now explicitly selected
  "Full validation" for this implementation**, authorizing local-package
  installation, temporary compatibility-setting changes, disposable
  shortcut creation/removal when needed, SteamUI reload, and the brief
  configured test-game launch. Restore settings and fixtures afterward.
  This resolves the authorization limitation in the initial session log.
  It does not authorize destructive clearing of the user's entire cache,
  changes to unrelated plugins, a release, or dev-to-main promotion.

## Required changes

### R1 — Late global-save acknowledgement reapplies policy after dismount

`src/ContentPanel.tsx:327-345` awaits the setter then calls
`setConfirmedCompatibilityDefault()` without a plugin-lifecycle guard.
That helper (`src/steam/metadataPatch.ts:277-285`) mutates every shortcut;
dismount invalidates only loads and restores baselines. Start a save,
dismount, then resolve the setter: the late continuation can reapply
Verified after all cleanup.

Make save acknowledgements respect the shared plugin lifecycle, not just
React mount state or the load generation. The successful backend write may
remain persisted for the next plugin mount, but the old mount must not
mutate runtime/UI after teardown. Cover that exact deferred-setter order.

### R2 — In-flight metadata/bootstrap work continues after teardown

`src/steam/metadataPatch.ts:443-470` checks `cancelled` only before its
awaits. With a confirmed Verified global setting and a pending metadata
request, stop bootstrap and restore baselines, then resolve the request:
the tick can start a fresh settings load or apply global policy after
unload. The independently started `refreshMetadataCache()` path
(`:413-430`, `src/index.tsx:24`) can also publish/apply its late result.

Guard all these async application paths with the actual plugin lifetime.
Recheck cancellation after awaited work and before starting another load
or applying status. A late metadata response must not reapply compatibility
either directly or by resuming bootstrap. Preserve needed next-mount
loading, rather than permanently disabling the service. Prove dismount
with pending metadata, pending setting load, and pending global save.

### R3 — A mounted QAM does not recover after shared settings-load recovery

The mount-only effect in `src/ContentPanel.tsx:214-232` leaves local
`compatibilityDefaultLoaded=false` and the error text after an initial
failure. If bootstrap later succeeds and updates the shared policy, the
QAM never observes it, remains disabled, and can show Automatic while
shortcuts have the recovered numeric default.

Synchronize the QAM with confirmed shared policy/loading state, using the
existing revision/subscription mechanism rather than a separate competing
setting snapshot or polling loop. Verify initial load failure followed by
successful bootstrap recovery while the same QAM stays mounted: selected
value, enabled state, and error text must recover together.

### R4 — Full-metadata startup retries were removed

`src/steam/metadataPatch.ts:457` replaced the old bootstrap retry of cached
metadata records with only `applyCompatibilityDefault()`. If metadata
loads while a native overview is missing or read-only, a later tick now
applies only compatibility. Saved rating/store categories and other
ordinary metadata are not reapplied until another detail/metadata action.

Keep the compatibility-only global sweep, but preserve the existing
startup retry behavior for metadata-backed records using a bounded,
entry-based batch. Cover a cached record loaded before its native overview
appears, then verify both compatibility and observable ordinary metadata
after the next bootstrap attempt. Do not reintroduce R6's per-ID scans.

### R5 — Packed-value equality suppresses required mounted badge updates

`src/steam/metadataPatch.ts:424-430` now publishes a metadata refresh only
when packed bits changed or it is the first load. Metadata is a plain
cache, and card slots subscribe to compatibility revisions.

Example: a Follow Valve shortcut has no provider category and native
Playable bits. A later refresh supplies Valve Playable. No packed write
is needed, but the owned badge slot's resolution changes from absent to
Playable; suppressing the revision leaves a mounted card stale.

Base publication on relevant effective-policy/category-availability
changes as well as packed writes. Keep genuine no-op refreshes cheap, but
do not equate no packed write with no user-visible change. Add a mounted
card test for this equal-packed-value transition and the reverse.

### R6 — Global-only baselines make metadata refresh quadratic

Every shortcut touched by the global policy enters `compatibilityBaselines`.
`refreshMetadataCache()` (`src/steam/metadataPatch.ts:416-426`) adds all those
IDs to its full-metadata affected set and calls `applyMetadata()` per ID.
That calls `getNativeOverview()` (`src/steam/core.ts:206-216`), a library
scan. With N no-record shortcuts, an empty metadata refresh now makes N
library scans. This also occurs at startup if settings resolve first.

Resolve native entries once for the batch, or keep global-only baseline
entries in the compatibility-only batch while still restoring removed
records correctly. Retain the exact native/alias guards. Extend the
throwaway performance proof to actual empty metadata refresh after a
numeric global default, both startup arrival orders, and metadata bootstrap
retry; the earlier apply/restore benchmark did not exercise this path.

### R7 — Sanitized provider scan results erase the per-game choice

`_steam_scan_match_sync()` creates a provider-only shell. Sanitization
adds explicit `deck_compat_override=None`. `_save_scan_pipeline_metadata()`
(`main.py:1243-1246`) passes that to `save_metadata()`, whose preservation
guard handles only an omitted override field. A saved Follow Valve choice
therefore becomes inheritance after Scan missing, even though scans are
not user requests to reset that choice.

Preserve the latest saved per-game choice at the scan-save boundary under
the existing data lock, for numeric values (including 0) and `"valve"`.
Distinguish an editor's explicit null from a provider's sanitized null.
Exercise the real sanitized scan result, not only a hand-built result
whose override key is absent. Include a choice changed while a scan is
in flight; provider results must not overwrite that newer user choice.

### R8 — Rematch scan discards the newly fetched provider category

`main.py:657-662` clears category whenever the saved Steam App ID differs
from the incoming one. That correctly handles an editor draft carrying
the old category, but also clears a trusted scan result already fetched
for the new match.

Distinguish editor-carried stale provider fields from provider results
bound to the new App ID. Preserve category 2 fetched for match 456 when a
scan replaces prior match 123, while retaining the existing protections
against carrying match 123's category through a manual reassignment.
Test both paths through their actual save boundaries and keep R7's
latest-user-choice preservation intact.

### R9 — Same-match network failure erases the last known Valve category

`main.py:1526-1529` unconditionally assigns the fetcher's result.
`steam_deck_compat_for_appid()` returns `None` for transport errors and
malformed responses as well as unavailable data, so a transient same-match
failure now removes a previously fetched Playable category. The prior code
kept it. The orchestrator reproduced this with an HTTP failure using the
real provider wrapper.

Do not treat failed refresh as proof that the current match's cached
category disappeared. Retain a valid last-known category for a failed
same-match fetch; never carry it across a changed/removed match. If an
authoritative unavailable response must be distinguished from a failed
request, represent that distinction at the existing provider boundary
without adding retries, a new provider, or unrelated infrastructure.
Verify cached category 0 is also preserved through failure. Document the
last-known-data behavior where needed rather than implying failure clears
a valid saved status.

### R10 — Complete the authorized live acceptance and retain evidence

After fixing R1-R9, run the integrated local gate and the plan's live
validation with the user's Full validation authorization above:

- Install the complete local ZIP through Decky's GUI, not a frontend-only
  deployment. Verify the installed manifest version.
- Exercise actual global/per-game controls and capture matched/unmatched,
  no-record, and late-added shortcut behavior; Follow Valve available,
  missing, and Unknown; fixed exceptions; default changes; Automatic
  restoration; mounted Home/grid and Game Info; actual filter membership.
- Verify plugin restart persistence and controlled teardown restoration,
  plus initial QAM focus, D-pad reachability/order, Save/cancel, and modal
  focus return using committed probes and controller-input tooling.
- Run the full `scripts/deck/verify/run_all.sh` with the configured safe
  fixture and record pass/fail output, not merely a command list.
- Preserve and restore pre-test user settings and fixture records. Do
  not clear the user's full metadata cache. Use disposable data for
  destructive cache-clear coverage. Close only dedicated tunnels and
  record final restored state plus any cleanup failure.
- Update the implementation session log with actual gates, red-to-green
  regressions, device evidence paths, and documentation changes. Do not
  retain the obsolete claim that device validation lacks authorization.

Keep the completed feature scope intact. Do not perform a release, push
to main, or integrate the branch yourself. Commit the corrections and
review note as required by the plan, run the quality gate, mark the round
complete, and exit for the orchestrator's review.

STATUS: CHANGES_REQUESTED
