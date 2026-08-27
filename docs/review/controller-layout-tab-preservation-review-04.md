# Review — controller-layout-tab-preservation (round 04)

Branch: `feat/controller-layout-tab-preservation`
Reviewed against: `docs/plans/2026-08-26_controller-layout-tab-preservation.md`

## Verdict

The round-03 production scoping, verifier completion, cleanup, stale-evidence,
and audit findings are resolved. The corrected bundle is deployed on both
reachable devices, but the mandatory typed smoke/screenshots remain incomplete
because neither device was left on its named shortcut's **Load new Layout**
chooser route after the hard reload. Human navigation is required; the
committed no-launch tooling correctly refused to guess or dispatch activation.

## Gate status

- Reviewed commit: `081eb3f60a0fb93bf4bfddbb0156e277daa1299c`.
- Generated-prefix canonicalization is exact; misleading suffixes are rejected.
- The query probe requires an expanded result and three stable samples; filter
  cleanup is armed pre-query; evidence starts non-passing before any probe.
- Reviewer reran `scripts/orchestration/run-quality-gates`: TypeScript/build,
  20 Vitest files / 258 tests, Python byte-compilation, and 410 pytest tests
  passed with `quality-gates: OK`. Review notes and worktree are clean.
- Both device doctors/deployments succeeded. Each attempted typed smoke failed
  safely in `dom-select` with `chooser tab unavailable: Community Layouts`
  before the direct query/filter mutation, and its evidence remained
  non-passing `started`.

## Required changes

1. On `steamdeck-legos`, physically open non-Steam Warhammer shortcut
   `3213262460`, enter Controller Settings, and leave **Load new Layout** open
   with its Your Layouts / Templates / Community Layouts / Search tabs visible.
2. On `steamdeck`, do the same for shortcut `2155012430`.
3. Once both chooser routes are open, rerun the exact typed smoke commands from
   review-03 (`55150`, expected type `102` on port `18082`; expected type `4` on
   port `18083`) against the corrected commit. Capture before/after screenshots,
   require passed evidence/restoration, and record the actual counts/hashes.
4. Close both tunnels and update the session log with the successful commands,
   artifacts, final tunnel status, and the final 258/410 gate tallies. Commit
   only the durable session/generated artifacts and mark finished.

STATUS: CHANGES_REQUESTED
