# Plan: Harden Post-Review Findings (review-hardening)

## Context

The high-effort review of this session's three merged branches
(`nonsteam-launch-incall-truth`, `quicklinks-suppression-section-hook`,
`deck-tooling`) produced 20 candidate findings. The workflow's verify agents
died on a session rate limit, so verification was done inline. Six survived as
worth fixing; the rest were intended design, cosmetic, or noise (recorded in
the session transcript, not repeated here). None invalidate what shipped — all
six are latent robustness gaps in either the plugin or the verify tooling that
guards it.

Fix ordering is deliberate: **tooling first, then plugin** (Group A before
Group B, one commit each). The plugin fixes require on-device verification, and
the tooling fixes are what makes that verification trustworthy — a false-PASS or
wrong-game-terminate in the launch smoke would undermine the very check used to
sign off Group B.

**Relevant files:** `scripts/deck/verify/smoke_launch.sh`,
`scripts/deck/verify/check_launch.py` (new), `tests/test_check_launch.py` (new),
`scripts/deck/js/click_play.js`, `scripts/orchestration-hooks/quality-gates`,
`src/steam/routerPatches.ts`, `src/steam/metadataPatch.ts`,
`src/steam/inCallTruth.ts` (new helper) + its vitest.

**Slug used throughout this plan:** `review-hardening`

---

## Orchestration Contract

**Slug:** `review-hardening`

**Plan file:**

```text
docs/plans/2026-07-11_review-hardening.md
```

**Implementation branch:**

```text
feat/review-hardening
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/review-hardening_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/review-hardening_finalized
```

**Review notes:**

```text
docs/review/review-hardening-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/review-hardening
```

Commit this plan first:

```bash
git add docs/plans/2026-07-11_review-hardening.md
git commit -m "docs(plan): add review-hardening implementation plan"
```

---

## Implementation Tasks

Two commits on `feat/review-hardening`, in order. Commit 1 = Group A
(`fix(verify): harden launch smoke + gate`). Commit 2 = Group B
(`fix(steam): make quick-links install + in-call truth robust`). The plan commit
from Setup precedes both.

### Group A — verify-tooling trustworthiness (commit 1)

**A1 + A2. Launch smoke can false-PASS / terminate the wrong game, and the
RunGame checker is brittle.** `scripts/deck/verify/smoke_launch.sh` (the inline
`python3 - … <<'PY'` heredoc, ~lines 23-35). Today it asserts on `running[0]`
without confirming the target appid launched, then terminates `running[0]`'s
gameid; and `int(gid)` raises an uncaught `ValueError` on a non-numeric first
arg while `int(gid) <= 0xFFFFFFFF` trips on any legitimate 32-bit-gameid
`RunGame` Steam itself makes during the trace window.

- Extract the dump→verdict decision into a NEW pure module
  `scripts/deck/verify/check_launch.py`. Inputs: the `tracer_rungame_dump.js`
  JSON (argv or stdin) + the target appid. Output: exit 0 with the winning
  64-bit gameid on stdout, or non-zero with a `FAIL: …` line on stderr.
  - Require the **target** appid to be present in `running` (the dump already
    returns `appid` per running app) — do not assert on `running[0]` blindly.
  - Scope the bare-appid assertion to RunGame calls **for the target appid**
    (compare against the target's own bare appid, not "any small integer").
  - Parse defensively: guarded int-conversion so a non-numeric / empty / URL
    first arg is a clean skip, not a `ValueError` crash.
  - Report the gameid of the running app whose `appid === target` (this is what
    `smoke_launch.sh` will terminate — only that one).
- Cover `check_launch.py` with pytest at `tests/test_check_launch.py`
  (the gate already runs `tests/`): target launched with a 64-bit gameid → pass;
  nothing running → fail; bare-appid gameid for the target → fail; an unrelated
  32-bit `RunGame` call present **and** the target ok → pass; a non-numeric
  `RunGame` arg present → no crash.
- Rewrite `smoke_launch.sh` to call `check_launch.py` instead of the heredoc,
  terminate only the target's gameid, and add a pre-flight: if a game is already
  running, either abort with a clear message or snapshot-and-diff the running set
  so a pre-existing app cannot produce a false PASS.

**A3. Play-button click can grab a stale button mid-transition.**
`scripts/deck/js/click_play.js` (~lines 10-13). The poll starts immediately
after `Navigate` and matches "Play" anywhere in the document, so within the
first ~50 ms it can dispatch to the previous page's Play button before React
commits the new route.

- Gate the match on the new route being committed — accept the Play button only
  once the page shows the target appid's context. Prefer passing the expected
  appid as `--var APPID=…` and requiring it present in the page (the
  appid-in-page guard adds no new coupling to Steam internals) before
  dispatching. Update `smoke_launch.sh` to pass the appid through.

**A4. Quality gate silently skips vitest on a stale node_modules.**
`scripts/orchestration-hooks/quality-gates` (~line 43). The
`[[ -x node_modules/.bin/vitest ]]` guard turns "vitest not installed" into a
green gate, so a `node_modules` predating the vitest devDependency passes without
ever running the tests that pin the launch-regression precedence.

- `package.json` now declares vitest, so treat its absence as a gate **failure**,
  not a skip. Reuse the existing `npm ci` / `pnpm install` bootstrap the gate
  already runs for tsc/rollup so vitest is present, then run it unconditionally
  via `npm test` (matches the committed script).

### Group B — plugin robustness (commit 2; verify with the Group-A-hardened tooling)

**B1. Quick-links suppression silently uninstalls on fingerprint miss.**
`src/steam/routerPatches.ts` (`installNeverOnSteamQuickLinksSuppression`, ~lines
54-74). It finds the section-wrapper class via a `findModuleChild` fingerprint
(class whose minified render source contains `"RegisterSection"`) and returns
with a bare `return` — no `frontendLog`, no error — if it finds nothing.
`safeInstallStep` only catches throws, and `steamPatchTargetsReady` (`core.ts`)
gates only on `appStore`/`appDetailsStore`, not this UI chunk. So either a Steam
update that renames/inlines `RegisterSection`, **or the chunk simply not being
loaded yet at boot**, silently disables the feature with nothing in the logs —
the same failure class that let the original `d63263f` ship broken.

- Log a `warning` (`frontendLog`/`log.warn`) when the fingerprint yields nothing,
  so a future miss is diagnosable and shows up in `logs.sh`.
- Address the chunk-not-loaded-at-boot case with a **bounded retry** for this
  specific install (a few delayed attempts) — do **not** add the class to
  `steamPatchTargetsReady` (that would delay every other patch). Cancel the retry
  on plugin unload (respect the existing `patchesCancelled` pattern) and push a
  real unpatcher.

**B2. In-call truth window is not exception- or nesting-safe.**
`src/steam/metadataPatch.ts` (the `GetGameID`/`GetPrimaryAppID` patch, ~lines
492-502). It does `bypassCounter = -1` → `original(...)` → `bypassCounter = 0`
with no `try/finally` and a hardcoded reset to `0`.

- **Exception:** if the wrapped original throws, the `= 0` reset is skipped and
  the counter sticks at `-1`, which under the current `decideBIsModOrShortcut`
  precedence is an absolute truth override — permanently disabling the spoof and
  the render shield until reload (rich pages stop rendering).
- **Nesting:** if Steam's `GetGameID` internally calls the patched
  `GetPrimaryAppID`, the inner call's `= 0` closes the truth window mid-way
  through the outer call, so `GetGameID`'s later `BIsModOrShortcut` checks are
  spoofed again → plain-appid gameid → the launch regression returns.

Both are latent on the current Steam build, but the fix is cheap and removes a
sharp edge under the strong new precedence.

- Save the previous `bypassCounter`, set `-1`, run in `try`, and **restore the
  saved value in `finally`** (not a hardcoded `0`). Saving/restoring makes nested
  patched calls re-enter and leave the outer window intact.
- Extract the save/set/restore into a small testable helper (e.g.
  `withInCallTruth(state, fn)` in a new `src/steam/inCallTruth.ts` alongside
  `spoofDecision.ts`) and add a vitest case proving a nested invocation preserves
  the outer `-1` window and that a throwing `fn` still restores the prior value.

### Non-fixes (reviewed, deliberately NOT changing — do not touch these)

- Precedence in `spoofDecision.ts` (shield no longer drained by early returns;
  in-call truth outranking the home guard) — intended, documented design.
- One-time info-section remount when metadata cache loads after first render —
  cosmetic, narrow cold-boot window.
- Suppression wrapper persisting on already-mounted pages just after unload —
  self-heals on remount.
- Overlap with the CSS-based `installUnmatchedAppLinksHider` — adjacent but
  different populations; consolidation is a separate future cleanup.
- Hot-path allocations in the decision call, silent traversal budget in
  `reactTreeWalk`, `_lib.sh` tunnel-on-source, duplicated Deck paths — noise or
  acceptable trade-offs at current scale.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

**Automated (must pass before marking the round complete):**

1. `scripts/orchestration/run-quality-gates` — green, now including vitest
   unconditionally (A4), the new `check_launch.py` pytest (A2), and the
   `withInCallTruth` vitest (B2).

Record a session log in `docs/agent_conversations/2026-07-11_review-hardening.md`
covering what changed and the automated results.

**Deferred — on-device (hardware not available to the implementer; the
orchestrator/human runs this before the dev→main promotion):**

2. Using the Group-A-hardened suite:
   - `scripts/deck/deploy.sh` then `scripts/deck/verify/run_all.sh` — all green
     (quick-links both directions, re-render churn, launch with a 64-bit
     gameid). Test appids: MK8 `3462906031` as the never-on-Steam case and a
     matched game for launch.
   - B1 negative check: confirm a `warning` is logged (via `logs.sh`) if the
     section-class fingerprint is forced to miss; confirm suppression still
     installs on a normal boot.
   - B2: re-run `smoke_launch.sh` on a matched game (during-shield press must
     still launch); spot-check `logs.sh reasons` shows `in-call-truth` intact.

The implementer must not attempt on-device steps; note them as deferred in the
session log.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished review-hardening
```

This writes:

```text
/tmp/Decky-Metadata/review-hardening_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer review-hardening`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/review-hardening-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished review-hardening
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/review-hardening-review-*.md
   git commit -m "docs(review): record review-hardening review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished review-hardening
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer review-hardening` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed review-hardening
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize review-hardening
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/review-hardening_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize review-hardening
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/review-hardening_finished
/tmp/Decky-Metadata/review-hardening_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
