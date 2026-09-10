# Review — compatibility-status-defaults (round 02)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Changes are required. Reviewed commit:
`090b751246510a5bb05868459ddd482c6d396de5`.
The UI corrections passed read-only review, and most round-01 defects were
fixed. Four material backend/runtime gaps remain. Backend failures below
were reproduced against the actual methods with isolated settings; runtime
findings were traced through the still-active callers.

## Gate status

- Round 02 recorded passing local gates: 27 Vitest files / 452 tests,
  TypeScript/Rollup, Python compilation/pytest, and version guard.
- Review reproduction log:
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/round2-review-probe.log`.
- The orchestrator installed the delivered ZIP **through Decky's GUI**.
  Capture `/tmp/Decky-Metadata/diagnostics/20260907T222228Z/doctor.json`
  confirms installed version `0.3.14+4581c88`. All 20 packaged production
  files were byte-compared with the reviewed checkout and matched; later
  commits only changed tests/documentation.
- Baseline settings and runtime categories are retained under
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/`, with full settings
  restricted to `restricted/settings-before.json`.
- **Device ownership:** the orchestrator now owns GUI installation and
  live validation. Do not navigate, mutate settings/fixtures, launch,
  reload, deploy, or install on the Deck during this correction round.
  The orchestrator will install the corrected package and finish/repeat
  the final matrix before integration. This is shared execution of the
  existing acceptance criteria, not their removal or deferral to the user.

## Required changes

### R1 — Null cannot establish a trusted provider match

`main.py:671-675` compares default `trusted_provider_steam_appid=None`
against a removed `next_steam_appid=None`. Equality suppresses stale-category
clearing even for an ordinary editor save. The orchestrator saved a record
with Steam App ID 123/category 3/Follow Valve, then saved its full fields
with `steam_appid=None`: category 3 remained.

Require an explicitly supplied, valid positive provider App ID equal to the
new match before bypassing stale-category clearing. Removing a match must
clear the carried provider category while preserving Follow Valve or the
numeric user choice. Test removal through the public editor save boundary,
alongside the already-covered positive-ID provider rematch.

### R2 — A missing required report field is malformed, not no data

`backend/providers/steam.py:303-305` uses `.get("resolved_category")`, so
`{"success": 1, "results": {}}` is treated as authoritative unavailable.
This was already a malformed fixture in the original provider tests.
The orchestrator reproduced loss of cached same-match categories 0 and 2
with that response.

Separate a missing required field/malformed response from a valid explicit
no-category response. Malformed same-match refresh must retain valid cached
data; genuine no-data must follow the agreed fallback; changed/removed
matches must never inherit stale data. Add consumer-level preservation
tests for both 0 and a positive category using the malformed payload, not
only a mocked lookup result.

### R3 — Guard the async consumers, not only the cache loader

The lifecycle early return in `refreshMetadataCache()`
(`src/steam/metadataPatch.ts:449-452`) resolves `ensureMetadataCache()`
successfully. Existing route callbacks still continue:
`src/steam/routerPatches.ts:260-263` and `289-290` call `applyMetadata()`
with the retained numeric default after dismount, and may start enrichment.
Pending per-app fetch, screenshot enrichment, and Activity continuations
also need the same lifetime protection before cache mutation/application
or additional requests.

Carry/check the shared lifecycle through every such consumer, including
route callbacks already scheduled before unpatch. Do not solve this by
swallowing cancellation in the producer and reporting success to an
unguarded consumer. Reproduce a route waiting on metadata with global
Verified, dismount/restore, resolve metadata, then assert no reapplication
or fresh enrichment begins. Cover representative in-flight per-app and
Activity completions and ensure a new mount still works.

### R4 — Keep pending restoration IDs in the linear refresh batch

The new `affectedAppIds` at `src/steam/metadataPatch.ts:454-457` removes all
baseline IDs. That avoids quadratic work, but also drops retry coverage:
with global Automatic and a previously injected Verified record, remove
metadata while the native packed field is temporarily non-writable.
Restoration fails and retains its baseline. Make the field writable and
refresh an empty cache again: the ID is now absent from both metadata sets,
so Verified remains instead of restoring the original nibble.

Include outstanding baseline/restoration IDs in the existing single-lookup
batch, or a compatibility-only batch that uses resolved native entries.
Keep global-only/no-record handling linear. Add a behavioral regression
for failed-then-successful restoration after the bounded bootstrap window,
and retain the large empty-refresh proof.

### Round completion and device handoff

Fix R1-R4, capture red-to-green regressions, run the integrated project gate,
and update the session log truthfully. Prepare the corrected local ZIP;
building and copying the ZIP to Downloads is allowed, but do not install
or manipulate the live device while the orchestrator owns it. Report the
package version and evidence path.

Do not claim the full implementation is accepted or merge the feature.
Commit corrections, mark the correction round complete, and exit for
review. Remaining live checks stay owned by the orchestrator, who has the
necessary browser skill and the user's Full validation authorization.

STATUS: CHANGES_REQUESTED
