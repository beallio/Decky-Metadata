# Session: Codify on-device tooling and deterministic verification

**Date:** 2026-07-11
**Branch:** `deck-tooling` → `dev`
**Objective:** Extract the instruments rebuilt ad hoc across the last few
sessions (CDP client, tunnel, deploy loop, probes, smoke checks) into
committed, deterministic tooling, and make the regression-prone pure logic
unit-testable.

## What was built

- `scripts/deck/cdp.py|tunnel.sh|deploy.sh|logs.sh` — see the plan doc; all
  stdlib/bash, no new runtime deps.
- `scripts/deck/js/` — 11 parameterized CDP probes (`--var KEY=VALUE` fills
  `__KEY__`). `click_play.js` picks the *innermost* focusable with text
  "Play" — the ad-hoc loose selector had silently clicked a text-bearing
  ancestor and produced a false "launch broken" reading during verification.
- `scripts/deck/verify/` — launch / quick-links / re-render smokes plus
  `run_all.sh`, which auto-picks a matched and a never-on-Steam appid from the
  device's `decky_metadata.json`.
- `docs/runbooks/on-device-verification.md` — required checks per change
  type, debugging recipes, hazards.
- **vitest** (devDependency) + `npm test`; wired into
  `scripts/orchestration-hooks/quality-gates`. Pure logic extracted:
  - `src/steam/spoofDecision.ts` — the `BIsModOrShortcut` precedence rules;
    `metadataPatch.ts` afterPatch now delegates to it and only handles side
    effects (counter write-back, shield snapshots, tracing).
  - `src/steam/reactTreeWalk.ts` — the MobX-safe element walker used by the
    quick-links suppression (moved from `routerPatches.ts`).
  - 18 tests, including the exact launch-regression ordering (in-call truth
    must not consult the shield) and a Proxy-based guard that the walker
    never touches non-children props.
- AGENTS.md: vitest + on-device checks added to the definition of done; MobX
  render-walk hazard recorded.

## Validation

- Quality gates green (tsc, rollup, vitest 18/18, py_compile, pytest).
- End-to-end on device using only the new tooling: `deploy.sh` (build → scp →
  hard reload → wait-ready) then `verify/run_all.sh` — all three smokes PASS
  against the refactored bundle, with auto-picked appids (Assassin's Creed
  `2312439508` launched with 64-bit gameid `9931852060871884800` and was
  terminated; MK8 `3462906031` suppressed). This simultaneously validated the
  tooling and behavior-parity of the spoofDecision refactor.
- `logs.sh reasons` shows `in-call-truth` (774×) now protecting launches on
  the live device.
