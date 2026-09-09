# Matched-games-only compatibility default

## Scope and execution

The maintainer selected saved metadata record membership as the meaning of
matched, and a toggle below the existing default dropdown. A record without a
Steam App ID counts. Automatic disables the toggle without discarding its
saved value. Fixed per-game categories and Follow Valve remain unchanged.

Plan: `docs/plans/2026-09-09_compat-default-matched-only.md`.

The external implementer could not start because its Codex account reached its
usage limit. That lifecycle was explicitly abandoned after checking for an
absent implementer session and feature branch. Implementation continued in
OMP-native mode; an attempted independent review also failed at the provider
usage limit and supplied no review. The foreground agent completed local
review. No independent approval is claimed.

## Implementation

Initial implementation: `47d0ae5` on `feat/compat-default-matched-only`.

- `backend/storage.py`, `main.py`, and `src/backend.ts`: persisted boolean
  scope, strict RPC validation, legacy-key preservation, save rollback.
- `src/steam/core.ts`, `src/steam/metadataPatch.ts`, and `src/steam.ts`:
  combined category/scope load, shared policy resolution, single-pass scope
  application, and existing active-Game-Info deferral.
- `src/ContentPanel.tsx` and `src/components/qam/MetadataSection.tsx`:
  toggle state, pending-save protection, error display, and disabled controls.
- Existing compatibility and panel tests plus a QAM section test: policy
  precedence, baseline restoration, persistence, failed saves, and disabled
  state. README, changelog, spec S41-S47, and device runbook were updated.

## Local review correction

A repeated toggle activation could submit two requests before React rendered
its busy state. The category dropdown also remained usable during a scope
save. A regression reproduced two requests where one was required. A shared
synchronous in-flight ref now rejects overlap between either control, both
controls disable while either request is pending, and the scope handler
rejects changes while Automatic is selected.

The scope tests now use current native overview references and a dynamic map
lookup. They verify replacements reach the map in both scope directions while
recorded games remain unchanged. The held-view test now starts with a visible
Verified default, changes scope while Game Info is active, and verifies that
baseline restoration occurs only on exit. New fixture casts were replaced by
a typed metadata fixture. Wording-pinning and forwarding-only tests were
removed. Panel mock state is reset between tests so a focused run does not
depend on earlier tests initializing unrelated RPCs.

## Verification

- Initial source was implemented before its new tests. This was not a
  red-first implementation. A subsequent mutation removed the scope branch:
  five tests failed; restoring the branch returned the suite to green.
  Evidence: `/tmp/Decky-Metadata/compat-default-matched-only-mutation.log`.
- The overlapping-save regression was red-first: expected one RPC request,
  observed two. It passes after the shared guard correction.
- Final focused run: 3 Vitest files, 74 tests passed.
- Final full command: `./run.sh scripts/orchestration/run-quality-gates`.
  TypeScript, Rollup, 28 Vitest files (496 passed, 4 skipped), Python
  byte-compilation, pytest, version checks, and review-note retention passed.
- `./run.sh scripts/decky verify-change dev --explain` classified this as a
  device change and returned `DEFERRED` for the live checks.

## Device and integration boundary

On 2026-09-09 the doctor reported the Deck offline; direct SSH to `steamdeck`
(`10.168.168.20`) returned `No route to host`. No toggle candidate was
installed, and no device fixtures or settings were changed for this feature.
The branch remains unmerged. Package creation is local preparation, not proof
of delivery or installation.

Required next checks once the Deck is reachable: install the full ZIP, exercise
S41-S47 through the real QAM controls, check controller focus and disabled
state, confirm native compatibility filter membership in both directions,
verify held-view/reload behavior, run the required device smoke checks, and
restore the captured settings and fixtures. Local tests do not establish
visual or on-device correctness.
