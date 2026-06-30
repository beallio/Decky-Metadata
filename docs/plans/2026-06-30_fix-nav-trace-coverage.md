# Plan: Fix nav trace to capture non-enumerable methods (fix-nav-trace-coverage)

## Context

The diagnostic `installNavigationTrace` (steam.ts:3913) is meant to reveal which Steam
navigation methods the native app-page buttons (Store / Community / Discussions / Guides)
call. On-device it captured **only `SteamClient.Apps.*` methods** (`GetLaunchOptionsForApp`,
`GetGameActionForApp`, `SetCachedAppDetails`…) and **never any `Navigation.*` call** — so the
button taps produced no useful trace. Two root causes:

1. **It enumerates with `Object.keys(target)`** (steam.ts:3928), which returns only
   **enumerable own** properties. `Navigation`'s methods (e.g. `NavigateToSteamWeb`) are
   **non-enumerable / on the prototype** — proven by the fact that the redirect, which patches
   them by explicit name (`patchUrlOpener(Navigation, "NavigateToSteamWeb")`), works, while the
   trace's key-enumeration found nothing on `Navigation`. So the trace was blind to exactly the
   objects we need.
2. **Noise**: the match pattern includes `app`, so `SetCachedAppDetails` / `RegisterForAppDetails`
   / `GetLaunchOptionsForApp` flood the log (~1.5 MB of cache spam), burying any real signal.

Also note: the earlier `SteamClient.Apps.ShowStore` patch did **not** fix the app-page Store
button (tapping it produced no `ShowStore` trace line), so that button uses a different method
— which this improved trace will finally reveal.

Relevant code (all in `src/steam.ts`): `installNavigationTrace` (3913), `patchTraceTarget`
(3924, the `Object.keys` enumeration), `shouldTraceNavigationCall` (3908),
`NAVIGATION_TRACE_METHOD_PATTERN` (3894), `navigationTraceArg` (3896).

**Intended outcome:** the trace wraps non-enumerable + prototype methods across the relevant
Steam objects and excludes the cache/launch noise, so a single round of button taps records
the exact method (+ appid) each native button calls — enabling a precise redirect follow-up.

**Out of scope:** patching the discovered methods (the follow-up, once the trace data is in);
anything outside the trace.

**Slug used throughout this plan:** `fix-nav-trace-coverage`

---

## Orchestration Contract

**Slug:** `fix-nav-trace-coverage`

**Plan file:**

```text
docs/plans/2026-06-30_fix-nav-trace-coverage.md
```

**Implementation branch:**

```text
feat/fix-nav-trace-coverage
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-nav-trace-coverage_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-nav-trace-coverage_finalized
```

**Review notes:**

```text
docs/review/fix-nav-trace-coverage-review-*.md
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
git checkout -b feat/fix-nav-trace-coverage
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_fix-nav-trace-coverage.md
git commit -m "docs(plan): add fix-nav-trace-coverage implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`, refining the existing diagnostic. No TS test runner (gate =
`tsc --noEmit` + build + py_compile + pytest).

1. **Enumerate non-enumerable + prototype methods.** Replace the `for (const name of
   Object.keys(target))` loop in `patchTraceTarget` (steam.ts:3928) with a collector that
   gathers function-valued property names from `target` **and walks its prototype chain**
   (stop before `Object.prototype`), de-duplicated:
   ```ts
   const collectMethodNames = (obj: any): string[] => {
     const names = new Set<string>();
     let cur = obj;
     let depth = 0;
     while (cur && cur !== Object.prototype && depth < 6) {
       for (const n of Object.getOwnPropertyNames(cur)) {
         if (n === "constructor") continue;
         try { if (typeof obj[n] === "function") names.add(n); } catch { /* getter throws */ }
       }
       cur = Object.getPrototypeOf(cur);
       depth += 1;
     }
     return [...names];
   };
   ```
   Wrap each collected method by **reading/writing it on `target` directly**
   (`target[name] = patched`, capturing `const original = target[name]`); keep the existing
   idempotency (`seenTargets`), the per-method try/catch, the "always call original / never
   throw" behavior, and the teardown that restores `original` only if still our wrapper. Skip
   a name if `target[name]` is not a function or assignment throws.

2. **Cut the noise.** Tighten `shouldTraceNavigationCall` so cache/launch chatter is never
   logged even if it matches: return `false` immediately when `methodName` matches
   `/cached|registerfor|getlaunch|getgameaction|appdetails|appdata|appoverview|appachievement/i`.
   Then keep logging when the name matches a **navigation** pattern (drop the over-broad `app`
   token): `/store|community|hub|forum|discuss|guide|workshop|market|navigate|openurl|executesteamurl|browser|web|overlay|showstore|link/i`,
   OR when a numeric arg is a known shortcut appid (`steamAppIdForApp(arg) > 0`).

3. **Wrap more targets.** In addition to `SteamClient.Apps`, `Navigation`, `SteamClient.Router`,
   and the global `Router`, also call `patchTraceTarget` for (guard each for presence):
   `(window as any)?.SteamClient?.URL` ("SteamClient.URL"),
   `(window as any)?.SteamClient?.System` ("SteamClient.System"),
   `(window as any)?.SteamClient?.Overlay` ("SteamClient.Overlay"), and
   `(window as any)?.MainWindowBrowserManager` ("MainWindowBrowserManager"). The `seenTargets`
   guard prevents double-wrapping if any alias the same object.

4. **Scope discipline:** only the trace's enumeration, noise filter, and target list. Do not
   touch the redirect (`installSteamLinkRedirect`), matching, appdetails, or anything else. No
   npm deps; no `main.py` change.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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

Run and confirm:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected: `tsc`/build pass; pytest unchanged-green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload, open a matched game's page.
2. Tap **each** native button once: Store Page, Community Hub, Discussions, Guides.
3. Read `playhub-metadata.log` and confirm `[playhub:trace]` lines now include
   `Navigation.*` / `SteamClient.URL.*` / `SteamClient.Overlay.*` (etc.) entries with the
   tapped method name + appid — and that the log is no longer flooded with
   `SetCachedAppDetails`. Record exactly which method + appid each button invoked; that data
   drives the precise redirect follow-up.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-nav-trace-coverage
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-nav-trace-coverage_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-nav-trace-coverage`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-nav-trace-coverage-review-*.md
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
   scripts/orchestration/clear-finished fix-nav-trace-coverage
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
   git add docs/review/fix-nav-trace-coverage-review-*.md
   git commit -m "docs(review): record fix-nav-trace-coverage review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-nav-trace-coverage
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-nav-trace-coverage` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-nav-trace-coverage
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-nav-trace-coverage
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-nav-trace-coverage_finalized
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
scripts/orchestration/finalize fix-nav-trace-coverage
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-nav-trace-coverage_finished
/tmp/Playhub-Metadata-local/fix-nav-trace-coverage_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
