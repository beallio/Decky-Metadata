# Plan: Codify On-Device Tooling and Deterministic Verification (deck-tooling)

## Context

The launch-regression and quick-links sessions (2026-07-10/11) rebuilt the
same instruments from scratch repeatedly — a stdlib CDP client (at least three
times), SSH tunnels by hand (one died mid-session), readiness polls, Play-button
clickers (one ad-hoc variant silently clicked a text-bearing ancestor), launch
tracers, and cache-write counters. Two shipped fixes were wrong in ways only
the live Steam tree reveals, and their "deferred on-device verification"
checklists nearly went unrun. One prototyping mistake (enumerating MobX
observables in a render-phase walk) wedged the renderer and cost a Steam
restart.

## Deliverables

1. **`scripts/deck/` tooling** (committed, stdlib/bash only):
   - `cdp.py` — CDP client: `list`, `eval` (inline/`@file`/stdin, `--var`
     substitution of `__KEY__` in snippets), `reload` (hard, cache-busting),
     `wait-ready` (Decky + DFL + appStore loaded).
   - `tunnel.sh up|down|status` — idempotent tunnel keyed to its exact
     forward spec so it never kills unrelated ssh sessions.
   - `deploy.sh [--no-build]` — build → scp bundle → hard reload → wait-ready.
   - `logs.sh reasons|hijacks|gameactions|launches|tail|sync` — canned log
     queries, including the launch-killer signature (render-shield decisions
     with `bypassCounterBefore='-1'`).
   - `js/` — parameterized probes: nav, goback, click_play (innermost-focusable
     fix), state, check_quicklinks, fiber_walk, RunGame tracer pair,
     cache-write counter pair, terminate.
2. **`scripts/deck/verify/` smoke suite** — `smoke_launch.sh` (Play inside the
   shield window must start the game with a 64-bit gameid), `smoke_quicklinks.sh`
   (row present for matched, suppressed for never-on-Steam, metadata intact),
   `smoke_rerender.sh` (0 cache writes across same-app subsection round-trips),
   `run_all.sh` (auto-picks test appids from the device metadata store).
3. **`docs/runbooks/on-device-verification.md`** — change-type → required
   checks mapping, debugging recipes, hazards.
4. **Frontend unit tests (vitest)** — extract the `BIsModOrShortcut`
   precedence rules into pure `src/steam/spoofDecision.ts` (the launch
   regression was an ordering bug here) and the safe tree walker into
   `src/steam/reactTreeWalk.ts`; tests pin the in-call-truth-beats-shield
   ordering, truth-window decrement semantics, and MobX-safety of the walker.
   Wire `vitest run` into `scripts/orchestration-hooks/quality-gates`.
5. **AGENTS.md** — vitest + on-device checks added to the definition of done;
   MobX render-walk hazard documented.

## Validation

- Quality gates (now including vitest) green.
- Refactor deployed to the Deck via `deploy.sh`; `verify/run_all.sh` passes
  end-to-end (launch, quick-links both directions, re-render churn) — this
  validates both the tooling and behavior-parity of the pure-function
  refactor.
