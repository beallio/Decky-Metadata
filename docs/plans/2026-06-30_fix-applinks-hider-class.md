# Plan: Resolve hashed LinkRow class at runtime for the hider (fix-applinks-hider-class)

## Context

The `hide-applinks-unmatched` feature (hide the native Store/Community/Discussions/Guides/
Market button row on **unmatched** non-Steam games) does not work on-device: the buttons are
still visible. Root cause: it targets `body.playhub-hide-applinks [class*="LinkRow"]`, but
Steam **hashes** its CSS-module class names — in the live DOM the link-row class is a hash
like `_1tN7mH20YhTaXLqtoW2hR-`, which does **not** contain the literal `LinkRow`, so the
selector matches nothing. (Confirmed in the Deck's steamui JS: the CSS module exports
`{ teLinkSection:"…", LinkRow:"_1tN7mH20YhTaXLqtoW2hR-", LinkRowText:"…", LinkRowIcon:"…" }`.
There are two `LinkRow` modules; the app-details one is the module that also exports
`LinkRowText`/`LinkRowIcon`/`teLinkSection`.)

Fix: resolve the **actual hashed class at runtime** from the Steam CSS module that exports it
(robust across Steam updates, which change the hash), and target that exact class. The
body-class toggle logic (`shouldHideUnmatchedAppLinks`, which already correctly detects an
unmatched non-Steam game-detail page) is fine and stays; only the CSS selector needs to use
the resolved hash.

Relevant code (all `src/steam.ts`): `installUnmatchedAppLinksHider` (~3867) and its style
block (3880-3894); `findModuleChild` (imported from `@decky/ui`, used throughout, e.g. line
1017) for locating the CSS module; the `PLAYHUB_HIDE_APP_LINKS_*` constants.

**Intended outcome:** the link-button row is actually hidden on unmatched games (the resolved
hashed class is targeted), matched games keep their working buttons, and it survives Steam UI
updates because the class is resolved at runtime rather than hardcoded.

**Out of scope:** the community-media swap, the delisted-appid override.

**Slug used throughout this plan:** `fix-applinks-hider-class`

---

## Orchestration Contract

**Slug:** `fix-applinks-hider-class`

**Plan file:**

```text
docs/plans/2026-06-30_fix-applinks-hider-class.md
```

**Implementation branch:**

```text
feat/fix-applinks-hider-class
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-class_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-class_finalized
```

**Review notes:**

```text
docs/review/fix-applinks-hider-class-review-*.md
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
git checkout -b feat/fix-applinks-hider-class
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_fix-applinks-hider-class.md
git commit -m "docs(plan): add fix-applinks-hider-class implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`, in/around `installUnmatchedAppLinksHider`. No TS test runner
(gate = `tsc --noEmit` + build + py_compile + pytest). Never throw.

1. **Add a runtime class resolver** `resolveAppDetailsLinkRowClasses(): string[]`:
   - use `findModuleChild` to locate the app-details link-section CSS module — a module
     (or one of its export values) that is an object with **string** properties `LinkRow`
     **and** `LinkRowText` **and** `LinkRowIcon` (this disambiguates from the unrelated second
     `LinkRow` module). Return that object's `LinkRow` value;
   - return an array of the resolved class string(s) (so we can target one or more), filtered
     to non-empty strings; on failure return `[]`. Wrap in try/catch (module access can throw).

2. **Build the style from resolved classes.** In `installUnmatchedAppLinksHider`, replace the
   hardcoded `[class*="LinkRow"]` rule. Resolve the classes via task 1; if any are found, set
   the `<style>` content to hide each by its **exact** class, scoped to the body class, e.g.
   ```
   body.playhub-hide-applinks .<resolvedClassA>,
   body.playhub-hide-applinks .<resolvedClassB> { display: none !important; }
   ```
   (CSS-escape / validate the class — it may start with `_` and contain `-`, which are valid
   in a class selector; just prefix with `.`). As a defensive fallback when resolution returns
   nothing, keep the old `[class*="LinkRow"]` rule too (harmless). Update the existing style
   element's `textContent` (do not create a second style node).

3. **Resolve lazily / retry.** The CSS module may not be available at first install. Resolve
   the classes inside the periodic `update()` (or on a short retry) and, once resolved
   (non-empty and different from what the style currently targets), (re)write the style
   `textContent`. Cache the resolved classes so the module lookup isn't repeated every tick.
   Keep the existing 400ms interval + teardown.

4. **Scope discipline:** only the class resolution + style content. Do not change
   `shouldHideUnmatchedAppLinks`, the body-class toggle, matching, or anything else. No npm
   deps; no `main.py` change.

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

1. Rebuild from `dev`, sideload.
2. Open an **unmatched** non-Steam game (e.g. *X-Men Origins: Wolverine*) — confirm the
   Store/Community/Discussions/Guides/Market button row is now **hidden**, the rest of the page
   intact.
3. Open a **matched** game (Space Marine / Wobbly Life) — confirm its buttons are still
   **visible and working**.
4. Confirm no unrelated UI is hidden. If the row is still visible, the resolved class didn't
   match the live DOM element — capture the button's actual `class` attribute (devtools/
   screenshot) to refine the resolver.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-applinks-hider-class
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-class_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-applinks-hider-class`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-applinks-hider-class-review-*.md
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
   scripts/orchestration/clear-finished fix-applinks-hider-class
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
   git add docs/review/fix-applinks-hider-class-review-*.md
   git commit -m "docs(review): record fix-applinks-hider-class review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-applinks-hider-class
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-applinks-hider-class` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-applinks-hider-class
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-applinks-hider-class
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-applinks-hider-class_finalized
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
scripts/orchestration/finalize fix-applinks-hider-class
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-class_finished
/tmp/Playhub-Metadata-local/fix-applinks-hider-class_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
