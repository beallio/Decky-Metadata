# Review — per-game-steam-shortcut-names (round 02)

Branch: `feat/per-game-steam-shortcut-names`
Reviewed against: `docs/plans/2026-09-06_per-game-steam-shortcut-names.md`

## Verdict

Changes required at `a998f78`. Backend enrichment now conditionally persists,
the smoke fixtures execute the shell path, and the synchronous busy guard is an
improvement. Independent source review still finds data-loss races and invalid
device-proof assumptions. Do not integrate.

## Gate status

- Independent `./run.sh scripts/orchestration/run-quality-gates` passed:
  418 frontend tests, 501 backend tests, TypeScript/build/Python checks and
  review-note retention.
- Both direct SSH checks failed with `No route to host`. Full-package installs
  and on-device acceptance remain unverified, not user-approved deferrals.
- The local ZIP GUI skill is available to the orchestrator. Device reachability,
  not an inherent requirement for human clicks, is the current install blocker.

## Required changes

### R1 — Reconcile save acknowledgments without reverting match identity

`MetadataPage.tsx:413-420`: begin Apply Steam App ID from 15100 to 15200, then
edit Title while `saveMetadata` is pending. The form-revision guard discards the
successful 15200 acknowledgment, so the form/cache retain 15100. A later Save
serializes the old identity back to storage. Preserve newer editable fields
while reconciling authoritative identity fields owned by this operation.
Likewise, initial hydration at lines 259-265 must not discard all saved fields
because one field was typed before `Promise.allSettled` finished. Either block
editing/save until initial metadata hydration (not background name backfill),
or merge untouched saved fields safely. Add delayed-response cases proving
subsequent Save preserves the new match and existing untouched fields.

### R2 — Normalize cleared IDs and scope name-operation callbacks

`MetadataPage.tsx:425-430` compares normalized null against parsed 0 on clear,
so the completion path never applies refreshed surfaces. Use one representation
for cleared IDs and cover the clear-to-null path through consumer-visible state,
not only the outgoing payload.

`MetadataPage.tsx:545-547,568-577,587-592`: begin a name operation on A, navigate
to B, let B load, then resolve A. The old operation currently installs A's name
history into B. With duplicate applied names this can offer a restore of B to
A's original. Scope rename/restore/forget local results, modal callbacks, error
reloads and busy completion to an editor entry/operation token. Finish A's
native/persistence cleanup without modifying B's form or history. Include
navigation-away-and-back (A/B/A) and duplicate-name cases, since app ID equality
alone is not sufficient to identify a particular editor entry.

### R3 — Make the actual smoke transport and phase boundaries reliable

`check_shortcut_name_management.js:5-9` assumes a loader-instance
`callPluginMethod` and calls the detached function with `[appId]`. Verify the
installed Decky contract through source or a live session and use its supported
backend RPC route with the correct receiver and scalar arguments. The shell
fake currently responds by filename without executing this helper; add a
contract-faithful helper check so missing methods/wrong argument shape fail.

`smoke_shortcut_name.sh:200-209`: native restoration precedes the asynchronous
backend history-clear RPC. Poll for both exact original name/sort state and
cleared history before declaring success/failure. Model delayed history clearing
separately from native restoration in the real fixture path.

At lines 189 and 211 the smoke reloads Big Picture but probes SharedJSContext.
Reload the owning SharedJSContext through the existing supported path, await
readiness, then re-probe. Require the fixture to distinguish these targets;
a no-op reload cannot establish the intended persistence checkpoint.

`shortcut_name_probe.js:15` trims `display_name` before capturing the original.
Preserve the raw string for snapshot, equality, hash and emergency restore;
trim only a separate usability check. Add a whitespace-bearing original and
forced failure case proving byte-exact restoration and unchanged sort key.

### R4 — Complete and accurately record remaining acceptance

Resolve these requests with behavioral red/green evidence; avoid tests that
only pin toast prose or mock-call ordering. Preserve the same-match Steam-name,
clear-ID, unavailable-management/API and metadata-removal restore contracts.
Do not broaden the rename feature or disable background editing to conceal a
race.

When reachable, install the corrected full ZIP using the available GUI skill,
verify the installed version, and run the required negative, reversible,
focus/cancel and safe surface checks on both named devices. If still offline,
complete all local work and record exact pending verification without claiming
approval or merging. Correct the session log's misleading claim that a human
click is inherently required; preserve historical attempt details as history.

STATUS: CHANGES_REQUESTED
