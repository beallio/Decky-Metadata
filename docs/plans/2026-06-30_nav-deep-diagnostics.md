# Plan: Deep click and route diagnostics for native buttons (nav-deep-diagnostics)

## Context

We are trying to discover how the native app-page **Store Page / Community Hub / Discussions
/ Guides** buttons navigate, so we can redirect them to the matched `steam_appid`. The
prototype-walking `installNavigationTrace` (steam.ts:3913) now wraps `Navigation`,
`Router`, `SteamClient.Apps/URL/System/Overlay`, and `MainWindowBrowserManager` — yet on-device
a full round of button taps produced **zero** trace lines. Three possibilities remain and we
must disambiguate them: (a) the trace didn't actually install, (b) the click never reaches the
JS layer (native-layer navigation, un-interceptable), or (c) the buttons navigate via a path
none of the wrapped objects covers (e.g. a route change via `history.pushState`).

This plan adds **diagnostics that answer those three** unambiguously, all via the existing
`frontend_log` bridge (`frontendLog`, used by `logSteamLinkNavigation`, steam.ts:3808) so the
output lands in `playhub-metadata.log`:

1. **Install confirmation + coverage counts** — log, once, that the trace installed and how
   many methods it wrapped per target. If this line is absent, the trace isn't installing
   (case a). If present but no taps log, the click isn't reaching those methods (case b/c).
2. **Capture-phase DOM click listener** — logs the actual element tapped (tag, truncated text,
   `href`, role/aria, key `data-*`). If a tap logs a click, the event reaches JS and the
   element/href reveals the target; if it logs nothing, the buttons are native-layer (case b).
3. **`history.pushState`/`replaceState` tracing** — captures route-based navigation (case c),
   e.g. an in-app store/community route.

Relevant code (all in `src/steam.ts`): `installNavigationTrace` (3913), `frontendLog` /
`logSteamLinkNavigation` (3808), `installSteamPatches` (where it is installed onto
`unpatchers`), the `__playhubNavTrace` idempotency global.

**Intended outcome:** the next single round of button taps yields a definitive log — either
the exact element/route/method the Store button uses (so we can redirect it) or proof that it
never enters JS (so we pivot to plugin-owned buttons). This is diagnostics only; no behavior
change.

**Out of scope:** patching the discovered path; the Community-tab content.

**Slug used throughout this plan:** `nav-deep-diagnostics`

---

## Orchestration Contract

**Slug:** `nav-deep-diagnostics`

**Plan file:**

```text
docs/plans/2026-06-30_nav-deep-diagnostics.md
```

**Implementation branch:**

```text
feat/nav-deep-diagnostics
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/nav-deep-diagnostics_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/nav-deep-diagnostics_finalized
```

**Review notes:**

```text
docs/review/nav-deep-diagnostics-review-*.md
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
git checkout -b feat/nav-deep-diagnostics
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_nav-deep-diagnostics.md
git commit -m "docs(plan): add nav-deep-diagnostics implementation plan"
```

---

## Implementation Tasks

Frontend-only diagnostics in `src/steam.ts`, extending `installNavigationTrace`. No TS test
runner (gate = `tsc --noEmit` + build + py_compile + pytest). Everything must be wrapped in
try/catch, never throw, and be torn down via `unpatchers`.

1. **Install confirmation + coverage counts.** Have `patchTraceTarget` return the number of
   methods it wrapped, and after wrapping all targets emit one line:
   `void frontendLog("trace", "nav trace installed", { counts: { "SteamClient.Apps": n, "Navigation": n, "Router": n, "SteamClient.URL": n, "SteamClient.System": n, "SteamClient.Overlay": n, "MainWindowBrowserManager": n } }).catch(()=>undefined);`
   (Only the install path; keep idempotency — log it once per install under the existing
   `__playhubNavTrace` guard.)

2. **Capture-phase DOM click listener.** Add `installClickTrace(unpatchers)` (called from
   `installSteamPatches`, idempotent via a `__playhubClickTrace` global). Register
   `document.addEventListener("click", handler, true)` (capture phase). In the handler:
   - from `event.target as Element`, walk up to ~6 ancestors to find the nearest actionable
     node (`button`, `a`, `[role="button"]`, or an element with an `onclick`/`href`);
   - build a compact descriptor: `tag`, `text` (the actionable node's `textContent` trimmed and
     truncated to ~60 chars), `href` (if any), `role`/`aria-label`, and any `data-*` attribute
     keys+values (truncated);
   - **only log when** the text/aria matches `/store|community|hub|discuss|guide|market|support/i`
     (so we capture the buttons of interest and avoid logging every click / PII). Log via
     `frontendLog("trace", "click", descriptor)`.
   - Wrap the whole handler in try/catch (never throw, never preventDefault, never stopPropagation
     — passive observation only). Remove the listener on teardown.

3. **`history` route tracing.** In `installNavigationTrace` (or `installClickTrace`), wrap
   `window.history.pushState` and `window.history.replaceState` so each call logs the path
   argument: `frontendLog("trace", "history", { method: "pushState"|"replaceState", url: <args[2] stringified, truncated> })`. Restore originals on teardown. Guard for absence and never throw.

4. **Scope discipline:** diagnostics only — the confirmation log, the click listener, and the
   history wrap. Do not change the redirect, matching, appdetails, or button behavior. No npm
   deps; no `main.py` change.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting this is
   temporary instrumentation to be removed once the button path is identified.

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

1. Rebuild from `dev`, sideload, and **re-open** a matched game's page fresh (after the
   plugin settles post-install).
2. In `playhub-metadata.log` confirm a `[playhub:trace] nav trace installed counts=…` line
   appears (proves the trace installed and shows per-object method counts).
3. Tap each native button once (Store/Community/Discussions/Guides). Confirm whether
   `[playhub:trace] click …` and/or `[playhub:trace] history …` lines appear:
   - if `click` lines appear → record the element `text`/`href`/`data-*` for each button;
   - if `history` lines appear → record the route path;
   - if neither appears for the Store button → that button does not navigate via the JS/DOM
     layer (native-layer), which is the signal to pivot to plugin-owned buttons.
   Paste the captured lines back as the next-step input.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished nav-deep-diagnostics
```

This writes:

```text
/tmp/Playhub-Metadata-local/nav-deep-diagnostics_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer nav-deep-diagnostics`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/nav-deep-diagnostics-review-*.md
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
   scripts/orchestration/clear-finished nav-deep-diagnostics
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
   git add docs/review/nav-deep-diagnostics-review-*.md
   git commit -m "docs(review): record nav-deep-diagnostics review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished nav-deep-diagnostics
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer nav-deep-diagnostics` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed nav-deep-diagnostics
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize nav-deep-diagnostics
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/nav-deep-diagnostics_finalized
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
scripts/orchestration/finalize nav-deep-diagnostics
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/nav-deep-diagnostics_finished
/tmp/Playhub-Metadata-local/nav-deep-diagnostics_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
