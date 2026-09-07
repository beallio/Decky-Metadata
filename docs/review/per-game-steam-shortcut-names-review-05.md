# Review — per-game-steam-shortcut-names (round 05)

Branch: `feat/per-game-steam-shortcut-names`
Reviewed against: `docs/plans/2026-09-06_per-game-steam-shortcut-names.md`

## Verdict

The round-04 code corrections pass the independent local checks and the real
Steam Deck rename/restore path. Acceptance remains blocked on device verification
and authorization. Do not merge, finalize, or start another implementation round
only to retry an offline device.

Reviewed commit: `b512c9b07e3c5386d4081729dd0f58ab37323e3b`.
Review date: 2026-09-06 PDT.

## Gate status

- Full project quality gate passed: TypeScript check, Rollup build, 27 Vitest
  files / 430 tests, Python byte-compile, and the full pytest suite.
- Focused contracts passed: 40 backend tests and 43 frontend tests.
- Review-note preservation and `git diff --check` passed. The tree was clean
  before this review note was created.
- Installed the complete local ZIP through Decky Loader's QAM Browse workflow.
  Capture `/tmp/Decky-Metadata/diagnostics/20260907T061032Z/doctor.json`
  confirms `0.3.13+b512c9b` on `steamdeck`.
- The delisted fixture `3497159354` showed the unavailable Steam-name explanation
  and no Use Steam name action. Its name was not changed.
- The real `2312439508` UI smoke passed with a supervised, dedicated CDP tunnel.
  Both rename persistence and exact original-name / `sort_as` restoration were
  checked after SharedJSContext reloads. Evidence:
  `/tmp/Decky-Metadata/per-game-steam-shortcut-names/steamdeck/shortcut-name-2312439508.json`.
- An earlier run lost its default tunnel after the rename. The orchestrator
  reopened the connection, used the visible Restore original name action, and
  confirmed the exact original native name, original sort value, and absent
  backend history before the passing rerun. The failed run was not counted as
  a pass.
- D-pad Up moved from Use Steam name to Apply Steam App ID; Down returned to
  Use Steam name. Enter selected the confirmation action. Escape closed the
  modal and returned focus to the editor's launching button without changing
  the name or creating history. Direct route entry initially had BODY focus;
  the first Down selected the editor heading. This is an observation, not proof
  of automatic initial selection before input.
- Focus evidence and the fresh-entry screenshot are below
  `/tmp/Decky-Metadata/per-game-steam-shortcut-names/steamdeck/`:
  `editor-focus.json` and `editor-fresh.png`.
- `run_all.sh --no-launch` passed quick-links, re-render churn (zero cache
  writes across three round-trips), community fallback, and controller layout
  identity / search isolation. Launch was skipped. Evidence:
  `/tmp/Decky-Metadata/verification/20260907T061802Z/controller-layouts.json`.
- The Warhammer controller-tab persistence smoke passed for displayed app
  `2155012430`, source `55150`, and controller type `4`. The chooser tab and
  filter were restored; no layout was previewed, selected, applied, exported,
  or saved. Evidence:
  `/tmp/Decky-Metadata/per-game-steam-shortcut-names/steamdeck-controller.json`.
- `verify-change dev --explain` classified the change as `device` and required
  quality-gates, tooling-provenance, quick-links, re-render, and launch checks.
- The final `verify-change dev --device` rerun passed its build, deploy,
  readiness, and non-launch surface checks. It returned `STATUS DEFERRED` and
  `OUTSTANDING launch (rerun with --device --allow-launch and explicit MATCHED_APPID)`.
  Its controller evidence is
  `/tmp/Decky-Metadata/verification/20260907T062727Z/controller-layouts.json`.
- The first dispatcher attempt timed out waiting for Steam UI after reload
  while a browser attachment was present. The tunnel remained healthy. After
  releasing that attachment and sending `Runtime.runIfWaitingForDebugger` to
  the two remaining CDP targets, readiness returned. The complete dispatcher
  rerun above ran without a browser attachment; the timed-out run was not
  counted as a pass.
- After the final dispatcher run, the reversible positive UI smoke passed
  again. The final management probe returned `eligible/ready` with no saved
  history (`ok=true`, `reason=ready`, `hasState=false`). The smoke evidence
  above now records this final run and exact restored name / sort value.
- All browser attachments were released. Both local CDP tunnels, ports 18081
  and 18082, were closed; `tunnel.sh status` reported `down` for each.

## Required changes

1. Complete full-package installation and the plan's live checks on
   `steamdeck-legos`, or obtain an explicit user-approved deferral. Repeated
   SSH attempts return `No route to host` for `10.168.168.219`.
2. Resolve the remaining launch authorization and fresh-entry initial-focus
   acceptance. Do not claim automatic initial selection from the direct-route
   observation above, and do not use `--allow-launch` without separate explicit
   authorization and the required matched fixture.
3. Keep the feature branch unmerged until the required device checks pass or
   the user approves explicit deferrals. No bulk or automatic rename, global
   setting, extra context-menu entry, direct VDF write, game launch, dev merge,
   or release was performed.

STATUS: CHANGES_REQUESTED
