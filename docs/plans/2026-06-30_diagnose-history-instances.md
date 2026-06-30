# Plan: Enumerate and trace Steam history instances (diagnose-history-instances)

## Context

The native app-page Store/Community/Discussions/Guides buttons navigate to `/routes/steamweb`
with the target URL in the route state (`state.url`, e.g.
`store.steampowered.com/app/<synthetic>` / `steamcommunity.com/app/<synthetic>/...`). We need
to rewrite that synthetic appid to the matched `steam_appid` **at the React Router history
that the buttons actually use** — but on-device that turned out NOT to be
`Router.WindowStore.GamepadUIMainWindowInstance.m_history` (our rewrite there never fired),
while the global `window.history.pushState` fires but is downstream of React Router and can't
change what the page loads. So the buttons use a **different history instance** we have not
identified.

This plan is **diagnostics only**: enumerate every history-like instance reachable from
Steam's `Router` tree, label each by where it lives, and trace its `push`/`replace` calls so a
single button tap reveals which instance (and which call) carries the `/routes/steamweb`
navigation. A follow-up will patch that specific instance's `push`/`replace` to rewrite
`state.url` (reusing `rewriteSteamLinkToMatchedApp`).

Relevant code (all `src/steam.ts`): `installSteamPatches` (where the diagnostic installs onto
`unpatchers`); the existing `m_history` access pattern
(`(globalThis as any).Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history`,
steam.ts:4807); `historyPathFromArgs` / `historyStateFromArgs` (arg helpers);
`frontendLog` (the log bridge); the existing idempotency-global pattern
(`__playhubNavTrace`, etc.).

**Intended outcome:** the log lists the discovered history instances at install
(`history instances`) and, on a button tap, shows `history call instance='<label>'
method='push' path='/routes/steamweb' url='…app/<synthetic>…'` — identifying the exact
instance to patch next.

**Out of scope:** the actual rewrite patch on the discovered instance (the follow-up); the
Community-tab content; removing existing diagnostics.

**Slug used throughout this plan:** `diagnose-history-instances`

---

## Orchestration Contract

**Slug:** `diagnose-history-instances`

**Plan file:**

```text
docs/plans/2026-06-30_diagnose-history-instances.md
```

**Implementation branch:**

```text
feat/diagnose-history-instances
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/diagnose-history-instances_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/diagnose-history-instances_finalized
```

**Review notes:**

```text
docs/review/diagnose-history-instances-review-*.md
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
git checkout -b feat/diagnose-history-instances
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_diagnose-history-instances.md
git commit -m "docs(plan): add diagnose-history-instances implementation plan"
```

---

## Implementation Tasks

Frontend-only diagnostics in `src/steam.ts`. No TS test runner (gate = `tsc --noEmit` + build +
py_compile + pytest). Everything must be passive, never throw, never alter navigation, and tear
down via `unpatchers`.

1. **Add `installHistoryInstanceTrace(unpatchers)`**, called from `installSteamPatches` (push
   teardown to `unpatchers`; idempotent via a `globalState.__playhubHistoryInstanceTrace`
   guard).

2. **Enumerate history-like instances** reachable from the Steam Router tree:
   - roots to scan: `(globalThis as any).Router`, `(globalThis as any).Router?.WindowStore`,
     `(window as any).SteamUIStore`, `(window as any).App` (guard each for presence);
   - bounded BFS/DFS (max depth ~4, max ~400 nodes, dedupe with a `WeakSet`), only recursing
     into object-valued own keys whose name matches `/window|instance|store|history|nav|main|browser|gamepad|overlay/i`
     (to avoid walking the whole graph); wrap every property access in try/catch (getters can
     throw);
   - treat an object as a **history instance** when it has `typeof obj.push === "function"` AND
     `typeof obj.replace === "function"` AND (`obj.location` is an object OR `obj.entries` is an
     array OR a numeric `obj.length`); also, for any object with a `m_history` whose
     `push`/`replace` are functions, record that `m_history` as an instance;
   - record each as `{ label, history }` where `label` is the dotted path from the root (e.g.
     `Router.WindowStore.GamepadUIMainWindowInstance.m_history`).

3. **Log discovered instances once** at install:
   `void frontendLog("trace", "history instances", { labels: <array of labels>, count }).catch(()=>undefined);`

4. **Trace each instance's `push`/`replace`** (dedupe instances so the same object isn't wrapped
   twice): wrap with a function that, **only when** the navigation target includes `steamweb`
   (use the existing `historyPathFromArgs(args)` to get the path) OR the resolved state has a
   store/community `url`, logs
   `void frontendLog("trace", "history call", { instance: label, method, path, url: <historyStateFromArgs(args)?.url truncated> }).catch(()=>undefined);`
   then **always** calls `original.apply(this, args)` unchanged. Never throw (try/catch around
   the log only). Register teardown to restore each wrapped `push`/`replace` if still ours.

5. **Scope discipline:** diagnostics only — enumeration + labelled push/replace trace + the
   install summary. Do not change matching, appdetails, the existing redirects, or navigation
   behavior. No npm deps; no `main.py` change.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9 (temporary
   instrumentation to be removed once the instance is identified).

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

1. Rebuild from `dev`, sideload, re-open a matched game's page fresh.
2. In `playhub-metadata.log` confirm a `[playhub:trace] history instances labels=[…]` line
   (the discovered instances).
3. Tap **Store Page** (and the others). Confirm a `[playhub:trace] history call instance='…'
   method='push' path='/routes/steamweb' url='…app/<synthetic>…'` line appears, and record the
   `instance` label — that is the exact history instance to patch in the follow-up. Paste it
   back.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished diagnose-history-instances
```

This writes:

```text
/tmp/Playhub-Metadata-local/diagnose-history-instances_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer diagnose-history-instances`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/diagnose-history-instances-review-*.md
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
   scripts/orchestration/clear-finished diagnose-history-instances
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
   git add docs/review/diagnose-history-instances-review-*.md
   git commit -m "docs(review): record diagnose-history-instances review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished diagnose-history-instances
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer diagnose-history-instances` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed diagnose-history-instances
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize diagnose-history-instances
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/diagnose-history-instances_finalized
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
scripts/orchestration/finalize diagnose-history-instances
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/diagnose-history-instances_finished
/tmp/Playhub-Metadata-local/diagnose-history-instances_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
