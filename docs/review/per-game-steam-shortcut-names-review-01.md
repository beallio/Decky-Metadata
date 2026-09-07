# Review — per-game-steam-shortcut-names (round 01)

Branch: `feat/per-game-steam-shortcut-names`
Reviewed against: `docs/plans/2026-09-06_per-game-steam-shortcut-names.md`

## Verdict

Changes required at implementation HEAD `75ceac0`. The storage separation and
state-first native write are appropriate, but the automatic backfill can lose
newer user changes. The persistent UI path has not been installed or exercised.

## Gate status

- Independent project gates passed: TypeScript, Rollup, 410 frontend tests,
  496 backend tests, and review-note retention. Working tree was clean.
- Reproduced stale backfill using the real Plugin save/get/enrich paths with a
  blocked provider response: save Steam ID 15100, begin enrichment, save a user
  edit with ID 15200, then release the old response. The final saved record
  reverted to title `Original`, ID 15100, and `Old Steam Name`.
- Current package `0.3.13+75ceac0` was built and pushed to Steam Deck Downloads.
  GUI installation was not completed. The last inspected GUI was CSS Loader's
  settings, not Decky Loader's settings; no installation confirmation occurred.
- Both devices currently fail direct SSH with `No route to host`. This is a
  verification blocker, not approved scope reduction. No game launch is
  authorized for this feature round.

## Required changes

### R1 — Prevent backfill from overwriting later edits or a different editor

`MetadataPage.tsx:246-273` starts enrichment without excluding metadata edits,
and applies its entire response without checking the current app, match, or
form revision. `main.py:914-924` unconditionally saves the pre-await metadata
snapshot. A late response can revert a newly selected Steam ID or resurrect
removed metadata. The UI callback can also overwrite a newer form or another
game's editor after navigation.

Keep ordinary metadata editing and restore available while loading, as the
plan requires. Add guarded persistence at the backend boundary: do not commit
a stale result when the stored record was removed or changed while awaiting
the provider. On the frontend, scope async results to the current editor entry,
Steam match, and form revision; discard stale results without overwriting
unsaved edits. Do not solve this by disabling all metadata controls during the
network call. Add deterministic delayed-response regression cases for changed
ID, metadata removal, unsaved edits, and navigation to another shortcut.

### R2 — Replace self-fulfilling smoke fixtures and verify cleanup failures

`smoke_shortcut_name.sh:11-24` implements `--fixture-test` by printing fixed
errors and returning 2. These cases do not exercise the real script's parsing,
probe assertions, missing-control behavior, or cleanup; they cannot detect a
regression in any of those paths. Replace them with fixture-driven execution
through the real smoke path using bounded fake transport responses.

The smoke currently reads the name once immediately after each modal click,
although the feature explicitly permits delayed native observation. Poll the
real phase predicates with a bounded deadline before failing. The cleanup trap
must report whether restoration actually succeeded and produce a nonzero,
explicit cleanup failure if it did not. Do not suppress the native cleanup
error and silently exhaust the loop. Verify exact original name and sort state.
Use per-device evidence paths so equal shortcut IDs on the two devices do not
overwrite each other's results.

Exercise delayed success, absent control, and forced post-rename failure
through the real script. No fixed-error branch may count as proof.

### R3 — Finish the planned behavioral tests and unavailable-state UX

The current tests omit required same-match Steam-name preservation, clear-to-null
ID invalidation, metadata removal retaining restore UI, and actual concurrent
action exclusion. Several new tests only assert mock call order or exact toast
wording. Replace those with observable pending/resolved UI transitions and
durable state assertions where feasible; do not re-pin error prose.

`configureShortcutPanel({managementError:true})` still seeds an eligible
management object, so the existing unavailable-management test does not prove
the real load failure disables writes. Exercise the rejected load result and
assert rename/restore cannot write while metadata editing remains usable.
Exercise repeated confirmation and another editor action while rename is
pending; prevent overlapping writes with current state, not a stale modal
closure's captured `busy` value.

Expose an accurate unavailable-API state before offering a rename that cannot
run, as plan task 5 requires. Do not persist new rename history for a known
missing native API. Preserve restore-history access independently of metadata.

### R4 — Complete actual package installation and device verification

The required skill is available at
`skill://decky-local-zip-gui-install` (also surfaced in the orchestrator).
The user has authorized the implementation/install workflow; do not claim a
human click is inherently required when browser/CDP control can perform it.
Use the GUI ZIP picker, not a backend-only bundle push or the URL field.
When a device is reachable, install the updated full ZIP, verify its installed
manifest, then run the negative fixture and reversible UI rename/restore,
focus/cancel checks, and separately authorized safe surface checks from the
plan. Verify the smoke's RPC helper against the actual installed Decky API;
do not assume the `callPluginMethod` signature or receiver.

If devices remain unreachable, finish R1-R3 and all local proof, commit accurate
results, then report the exact remaining external blockers. Do not merge,
claim device success, or claim the user approved a deferral. The orchestrator
will inspect corrected work and retain the integration gate.

STATUS: CHANGES_REQUESTED
