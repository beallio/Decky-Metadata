# Plan: Ungate the steamweb navigation rewrite from debug logging (fix-debug-gated-nav-rewrite)

## Context

The thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`, BLOCKER 2) found a
**correctness defect**: a functional navigation rewrite runs only when debug logging is enabled.
Steam's `window.history.pushState`/`replaceState` and the Steam router `m_history.push`/`replace`
are patched by **three separate modules**, and the `window.history` steamweb URL rewrite lives
exclusively inside a diagnostics module that `install.ts` installs *only* when
`getDebugLogging()` resolves true. So for the vast majority of users (debug off), a
`store.steampowered.com/app/<id>` link opened through `window.history` is **not** rewritten to the
matched Steam appid.

**Verified against current code:**

1. **The debug-gated functional rewrite (the bug).** `src/steam/diagnostics.ts:251-262`, inside
   `installNavigationTrace`, wraps `window.history.pushState`/`replaceState` and — when the URL
   contains `steamweb` — calls `rewriteSteamwebNavState(args[0])` (the deep-walk state mutator in
   `src/steam/core.ts:216-256`) and forwards the rewritten state:
   ```ts
   const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);
   if (rewrote) { ... return original.apply(this, [newState, args[1], args[2]] as any); }
   ```
   `install.ts:69-76` installs `installNavigationTrace` only inside
   `getDebugLogging().then((debugLoggingEnabled) => { if (!debugLoggingEnabled) return; ... })`.
   **Behavior therefore depends on a log level.**

2. **The unconditional `window.history` wrapper does news-only, no steamweb rewrite.**
   `src/steam/activity.ts:1131-1160` (`installNativeNewsHistoryRedirects`) already patches
   `window.history.pushState`/`replaceState` **unconditionally** (installed at `install.ts:81`), but
   only for the decky-native-news push→replace/back logic — it does **not** rewrite steamweb URLs.
   This is the natural home for the ungated rewrite.

3. **The Steam router `m_history` steamweb rewrite is duplicated (both unconditional).**
   - `src/steam/navigationRedirect.ts:135-160` (`installMainWindowHistoryRedirect`, installed at
     `install.ts:68`) resolves
     `SteamUIStore.m_WindowStore.MainWindowInstance.m_history ?? Router.WindowStore.GamepadUIMainWindowInstance.m_history`
     and rewrites `state.url` via `rewriteSteamLinkToMatchedApp` when the path contains `steamweb`.
   - `src/steam/activity.ts:1107-1118` (inside `installNativeNewsHistoryRedirects`) resolves
     `Router.WindowStore.GamepadUIMainWindowInstance.m_history` and performs the **same** idempotent
     `state.url` rewrite.

**Intended outcome:** the steamweb `window.history` rewrite runs for **all** users regardless of
debug logging; the diagnostics module becomes **observation-only** (tracing/logging, no navigation
mutation); the router-history steamweb rewrite has a single owner. No behavior changes for users who
already had debug logging on — this only restores the rewrite for the debug-off majority.

### Relevant files
`src/steam/activity.ts` (add ungated `window.history` steamweb rewrite to the existing unconditional
wrapper; remove the duplicated router `state.url` rewrite), `src/steam/diagnostics.ts` (strip the
functional rewrite from `installNavigationTrace`, keep tracing only), `src/steam/navigationRedirect.ts`
(canonical owner of the router `m_history` steamweb rewrite; unchanged unless the router de-dup
requires it), `src/steam/core.ts` (`rewriteSteamwebNavState` / `rewriteSteamLinkToMatchedApp` are
reused, not modified), `dist/index.js` (rebuilt), `docs/agent_conversations/`.

**Out of scope / deferred (needs its own effort):** the larger `activity.ts` decomposition (1,283
lines; split event-construction from history/store patching) is a subjective restructuring deferred
to its own plan — do NOT attempt it here.

> Source: thermo-nuclear review (2026-07-05) BLOCKER 2, verified against current code by the author.

**Slug used throughout this plan:** `fix-debug-gated-nav-rewrite`

---

## Orchestration Contract

**Slug:** `fix-debug-gated-nav-rewrite`

**Plan file:**

```text
docs/plans/2026-07-05_fix-debug-gated-nav-rewrite.md
```

**Implementation branch:**

```text
feat/fix-debug-gated-nav-rewrite
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/fix-debug-gated-nav-rewrite_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/fix-debug-gated-nav-rewrite_finalized
```

**Review notes:**

```text
docs/review/fix-debug-gated-nav-rewrite-review-*.md
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
git checkout -b feat/fix-debug-gated-nav-rewrite
```

Commit this plan first:

```bash
git add docs/plans/2026-07-05_fix-debug-gated-nav-rewrite.md
git commit -m "docs(plan): add fix-debug-gated-nav-rewrite implementation plan"
```

---

## Implementation Tasks

Locate code by symbol. This is a correctness fix (ungate the rewrite) plus a behavior-preserving
de-duplication. Reuse the existing `rewriteSteamwebNavState` and `rewriteSteamLinkToMatchedApp`
helpers from `src/steam/core.ts` — do not rewrite them.

### Task 1 — Make the `window.history` steamweb rewrite unconditional

In `src/steam/activity.ts`, inside `installNativeNewsHistoryRedirects`, the existing
**unconditional** `window.history.pushState`/`replaceState` wrapper (~1131-1160) currently handles
only the decky-native-news push→replace/back logic. Add the steamweb rewrite there so it runs for
all users:

- After the news-route handling and before `return original.apply(this, args as any);`, add a
  guarded block: when `String(args[2] || "")` (the URL arg) — lowercased — contains `steamweb`,
  call `rewriteSteamwebNavState(args[0])`; if `rewrote`, forward with the rewritten state:
  `return original.apply(this, [newState, args[1], args[2]] as any);`.
- Wrap the added block in its own `try { … } catch (_error) { /* nav must continue */ }` so a
  rewrite failure never breaks navigation (match the existing defensive style in this file).
- Import `rewriteSteamwebNavState` from `./core` in `activity.ts` (it currently imports
  `rewriteSteamLinkToMatchedApp` at ~25; add the sibling import).

This is exactly the logic that today lives in `diagnostics.ts`, moved into the always-installed
wrapper. Do not alter the news push→replace/back branches.

### Task 2 — Make `installNavigationTrace` observation-only (remove the functional rewrite)

In `src/steam/diagnostics.ts` `installNavigationTrace` (~239-281, specifically the `steamweb`
block at ~251-262):

- **Keep** the diagnostic `frontendLog("trace", "history", …)` and
  `frontendLog("trace", "history-state", …)` calls.
- **Remove** the `rewriteSteamwebNavState(args[0])` call and the early
  `return original.apply(this, [newState, args[1], args[2]] as any);` — the wrapper must fall
  through to the unmodified `return original.apply(this, args);` at the end.
- Remove the now-unused `rewriteSteamwebNavState` import from `diagnostics.ts` (line ~8) if nothing
  else in the file uses it (verify: `grep -n rewriteSteamwebNavState src/steam/diagnostics.ts`).

After this task, `diagnostics.ts` performs zero navigation mutation — it only observes/logs.

### Task 3 — Single owner for the router `m_history` steamweb rewrite (behavior-preserving de-dup)

The router `m_history` steamweb `state.url` rewrite exists in two unconditional places
(`navigationRedirect.ts:135-160` and `activity.ts:1107-1118`). Consolidate to one owner:

- **Verification step first (required):** confirm the two wrappers target the same history object at
  runtime, or that the rewrite is idempotent. `rewriteSteamLinkToMatchedApp` is idempotent (a second
  pass over an already-mapped appid returns `rewrote: false`), so double-application is a no-op.
- **Keep** the canonical rewrite in `navigationRedirect.ts` `installMainWindowHistoryRedirect`
  (the module named for redirects, which resolves the superset history via its `??` fallback).
- **Remove** the steamweb `state.url` rewrite block from `activity.ts:1107-1118` so
  `installNativeNewsHistoryRedirects`'s **router** wrapper handles only the native-news
  push→replace/back logic. (The `window.history` steamweb rewrite added in Task 1 stays.)
- If — and only if — the implementer's runtime verification shows the two wrappers can target
  **different** history objects such that removal would drop coverage, do NOT remove it; instead
  leave both (they are idempotent) and record the finding in the session log. State clearly in the
  session log which path was taken and why.

### Task 4 — Rebuild + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-05_fix-debug-gated-nav-rewrite.md`: the BLOCKER 2 finding
  and review source, the ungating fix (Task 1/2), the router de-dup decision and its verification
  evidence (Task 3), and the deferred `activity.ts` decomposition note.

### Scope discipline

Only the steamweb-rewrite ungating and the router de-dup above. Do NOT refactor the fake
PartnerEvent machinery, split `activity.ts`, or touch the community-feed patch. Preserve all other
navigation behavior.

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

Automated (via `./run.sh`):

```bash
./run.sh npx tsc --noEmit
./run.sh npm run build                              # dist rebuilt
scripts/orchestration/run-quality-gates
git status --short                                   # clean
```

Grep/scope gates:

```bash
# Task 1 — steamweb rewrite now lives in the unconditional activity.ts window wrapper:
grep -n "rewriteSteamwebNavState" src/steam/activity.ts        # present (imported + used)
# Task 2 — diagnostics no longer mutates navigation:
grep -n "rewriteSteamwebNavState" src/steam/diagnostics.ts     # ZERO matches
grep -n "return original.apply(this, \[newState" src/steam/diagnostics.ts   # ZERO matches
grep -n "frontendLog(\"trace\", \"history\"" src/steam/diagnostics.ts       # still present (tracing kept)
# Task 3 — router steamweb rewrite has a single owner (unless verification kept both):
grep -n "steamweb" src/steam/navigationRedirect.ts             # canonical rewrite present
grep -cn "rewriteSteamLinkToMatchedApp(state.url)" src/steam/activity.ts   # 0 (removed) OR justified in session log
# install.ts still gates ONLY diagnostics (tracing) behind debug logging:
grep -n "debugLoggingEnabled" src/steam/install.ts             # only wraps navigationTrace/historyInstanceTrace/clickTrace
git diff --name-only dev..HEAD                                  # scope: activity.ts, diagnostics.ts, (navigationRedirect.ts), dist, docs
```

Static review:
- The steamweb `window.history` rewrite is now installed unconditionally (in
  `installNativeNewsHistoryRedirects`), not inside the debug-gated `installNavigationTrace`.
- `diagnostics.ts` `installNavigationTrace` only logs; it forwards `original.apply(this, args)`
  unchanged. No `rewriteSteamwebNavState` reference remains in that file.
- The router `m_history` rewrite is owned by `navigationRedirect.ts` (or both kept, with a
  documented object-identity justification in the session log).
- `getDebugLogging()` in `install.ts` continues to gate only the three trace installers.

### Deferred verification — on-device
Sideload with debug logging **OFF**. Open a matched non-Steam game, trigger a store/community link
that routes through `window.history` (e.g. a "Store page" / news link), and confirm it opens the
**matched Steam appid's** page — the behavior that previously required debug logging on. Toggle debug
logging on and confirm navigation is unchanged and traces still log.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-debug-gated-nav-rewrite
```

This writes:

```text
/tmp/Decky-Metadata/fix-debug-gated-nav-rewrite_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-debug-gated-nav-rewrite`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-debug-gated-nav-rewrite-review-*.md
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
   scripts/orchestration/clear-finished fix-debug-gated-nav-rewrite
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
   git add docs/review/fix-debug-gated-nav-rewrite-review-*.md
   git commit -m "docs(review): record fix-debug-gated-nav-rewrite review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-debug-gated-nav-rewrite
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-debug-gated-nav-rewrite` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-debug-gated-nav-rewrite
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-debug-gated-nav-rewrite
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/fix-debug-gated-nav-rewrite_finalized
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
scripts/orchestration/finalize fix-debug-gated-nav-rewrite
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/fix-debug-gated-nav-rewrite_finished
/tmp/Decky-Metadata/fix-debug-gated-nav-rewrite_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
