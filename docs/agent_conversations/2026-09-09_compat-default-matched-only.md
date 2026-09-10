# Matched-games-only compatibility default

> **Historical session — implemented in `5971737`, superseded by `34e52a5`.**
> The boolean is now migration input only. Round statuses below are historical;
> see the [current compatibility contract](../specs/compatibility-status.md).

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

## Device validation and acceptance — 2026-09-09/10

The Deck was initially unreachable. Once it returned, the complete ZIP
`0.3.14+c80575f` was delivered and installed through Decky Loader's ZIP file
picker. The final capture verified its manifest version and confirmed that the
installed bundle's SHA-256 equals the local `dist/index.js` SHA-256.

Live results:

- Scope on restored all four no-record shortcuts to their captured native
  values. Recorded games, including a record without a Steam App ID, retained
  the numeric default. Ordinary Steam games were unchanged.
- The already-mounted native **Great on Deck** collection changed from
  **42 -> 46 -> 42** as scope changed **on -> off -> on**.
- QAM screenshots confirmed the toggle layout. D-pad Down moved from the
  default dropdown to the toggle and then Refresh metadata. A activated and
  saved the toggle, with focus retained on the control.
- Matched Game Info retained rich content while scope changed. A no-record
  game's active Game Info held Verified while scope was enabled; leaving the
  view then restored its native category.
- A temporary metadata record was saved for the existing no-record Heroic
  launcher shortcut `3245664592`. With scope on, saving that record applied
  Verified despite having no Steam match. Removing only that temporary record
  restored the original native category. No shortcut was created or deleted.
- Follow Valve retained Playable with either scope. A fixed Verified override
  remained Verified while an inheriting recorded game followed Unsupported.
- Automatic disabled the toggle without clearing its saved true value.
  In-place plugin reload retained it; choosing a numeric default afterward
  again excluded the no-record shortcuts.
- `scripts/deck/verify/run_all.sh --no-launch` passed quick links, re-render
  (0 cache writes across three round trips), community fallback, and controller
  layout isolation. Fixture-specific DLC/Points Shop coverage was skipped.
- After the maintainer authorized this invocation,
  `scripts/deck/verify/smoke_launch.sh 2312439508` passed: the game started with
  64-bit game ID `9931852060871884800` and was terminated by the smoke script.

All original metadata records, per-game choices, numeric default, and debug
logging values were restored. The new scope setting is explicitly false,
which is equivalent to its originally absent value. The browser handle and
debugger tunnel were released.

Evidence:

- `/tmp/Decky-Metadata/matched-only-live-g2d6wibm/verification-result.json`
- QAM, disabled-toggle, and native-filter screenshots in the same directory
- `/tmp/Decky-Metadata/verification/20260909T152037Z/`
- `/tmp/Decky-Metadata/diagnostics/20260910T073349Z/`

The candidate was integrated into `dev` as `5971737`. Its boolean scope was
later replaced by four scopes in `34e52a5`. This was native OMP integration,
not a completed external-orchestration review.
No external implementer or finalizer is to be resumed for this abandoned run.
Promotion to `main` and remote publication remain outside this task.
