# Review — failed-gameinfo-and-context-menu-diagnostics (round 01)

Branch: `feat/failed-gameinfo-and-context-menu-diagnostics`
Reviewed against: `docs/plans/2026-07-07_failed-gameinfo-and-context-menu-diagnostics.md`

## Verdict

The implementation is close and the project quality gate passes, but two fixes
are required before this round can be accepted.

## Gate status

Reviewed commit: `43b597fb596b2a61ef654d05829044c3723c1bb9`

Passed:

- `./run.sh scripts/orchestration/run-quality-gates`
- `./run.sh scripts/orchestration/check-review-notes-not-deleted`
- `git diff --exit-code`

Failed review-only cleanliness check:

- `git diff --check dev...HEAD`

## Required changes

1. `src/contextMenuPatch.tsx`: `traceMenu` calls the async `frontendLog(...)`
   bridge without attaching `.catch(...)`. The surrounding `try/catch` only
   catches synchronous failures and will not swallow a rejected Decky backend
   call. The plan requires debug-gated context-menu logging to catch/log-ignore
   backend failures and never throw into Steam's call path. Match the other
   diagnostics by using `void frontendLog(...).catch(() => undefined)` or an
   equivalent rejection-safe helper.

2. Remove trailing whitespace introduced in this branch. Current evidence from
   `git diff --check dev...HEAD`:

   ```text
   src/contextMenuPatch.tsx:206: trailing whitespace.
   src/contextMenuPatch.tsx:214: trailing whitespace.
   src/steam/metadataPatch.ts:472: trailing whitespace.
   ```

After making these changes, rerun the full project quality gate, rerun
`git diff --check dev...HEAD`, keep the working tree clean, commit the fixes and
this review note, then mark the round complete again.

STATUS: CHANGES_REQUESTED
