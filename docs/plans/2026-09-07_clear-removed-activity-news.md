# Plan: Clear Activity news when metadata is removed (clear-removed-activity-news)

> **Historical plan — implementation is on `dev` (`3d10062`).**
> Do not launch this completed plan again. Original verification evidence
> remains below; use the [current workflow](../runbooks/agent-workflow.md).

## Context

### Problem and evidence

Fix [issue #3](https://github.com/beallio/Decky-Metadata/issues/3): Activity news
remains after **Remove metadata → Save → Done**.

This was reproduced on the Deck with `0.3.13+b512c9b`, using the Space Marine
shortcut `2155012430`. After Save, backend metadata had no Steam App ID and zero
news items, but the plugin Activity cache and Steam Activity store retained the
same six events. The old cards remained visible. The Activity source is unchanged
from the reporter's `v0.3.12`.

Local evidence, if still available:
`/tmp/Decky-Metadata/issue-3-live-results.json` and
`/tmp/Decky-Metadata/issue-3-live-after-remove-save.png`.
These temporary files are supporting evidence, not implementation dependencies.

### Smallest useful change

Clear the affected shortcut's injected Activity object from both stores when its
metadata is removed or its news list becomes empty. Use the existing metadata
application and Activity refresh paths. Preserve native Steam activity and news
for other shortcuts. Do not require a reload or uninstall.

Scope: `src/steam/activity.ts`, `src/steam/metadataPatch.ts`, their existing test
files, regenerated `dist/index.js`, this plan, and brief existing README/changelog
and implementation-session updates. No new dependencies, RPCs, settings, or
persisted data shapes.

Out of scope: automatic matching policy, removal tombstones, backend refresh
races, unrelated metadata restoration, partner-event registry redesign, polling,
new notification systems, and general cache refactoring. The separate possible
backend race was not needed to reproduce this defect and is not fixed here.

**Slug used throughout this plan:** `clear-removed-activity-news`

---

## Orchestration Contract

**Slug:** `clear-removed-activity-news`

**Plan file:**

```text
docs/plans/2026-09-07_clear-removed-activity-news.md
```

**Implementation branch:**

```text
feat/clear-removed-activity-news
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/clear-removed-activity-news_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/clear-removed-activity-news_finalized
```

**Review notes:**

```text
docs/review/clear-removed-activity-news-review-*.md
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
git checkout -b feat/clear-removed-activity-news
```

Commit this plan first:

```bash
git add docs/plans/2026-09-07_clear-removed-activity-news.md
git commit -m "docs(plan): add clear-removed-activity-news implementation plan"
```

---

## Implementation Tasks

1. **Add one small Activity-clear operation.**
   In `src/steam/activity.ts`, add an internal exported
   `clearDeckyNativeActivityForApp(appId, store?)` helper beside the existing
   refresh function. Remove that app's entry from `deckyNativeActivityCache`.
   Remove its entry from `appActivityStore.m_mapAppActivity` only when the stored
   object has the existing `__deckyNativeActivity` marker. Use the supplied store
   when present, as refresh already does. Make repeated calls harmless and avoid
   writes when nothing is present. Do not clear entire maps, touch other apps,
   or erase genuine Steam activity.

2. **Use it at the existing state boundaries.**
   - In `metadataPatch.ts`, call the helper from `applyMetadata` after confirming
     native-shortcut identity, when metadata is absent or its news list is empty.
     This covers editor Remove/Save and full metadata-cache replacement without
     adding separate editor handlers. Keep compatibility restoration unchanged.
   - In `getDeckyNativeActivityForApp`, inspect current metadata before returning
     a cached Activity object. Missing metadata or an empty news list must clear
     injected Activity and fall through to Steam's existing behavior.
   - In `refreshDeckyNativeActivityForApp`, clear injected Activity when metadata
     is absent or building the new Activity returns no events. Do not leave the
     previous object behind on these early returns.
   - Keep normal non-empty refresh behavior. Do not rebuild or delete Activity
     during unchanged renders. Use Steam's existing store update behavior rather
     than adding timers, a new React subscription, or a global reload.

3. **Keep focused regression coverage.**
   Extend `src/steam/activity.test.ts` and, for the shared removal boundary,
   `src/steam/metadataPatch.test.ts`. Exercise the actual patched getter and
   refresh behavior with a small Steam-store fixture:
   - Seed news, remove metadata, apply the change, and then save an empty record.
     Old plugin cards must not be returned at either stage.
   - Refresh an existing injected feed with absent/empty metadata; old cards
     must not return through the native-store fallback.
   - After those cases, prove that another shortcut's news and a genuine native
     Steam Activity object remain intact; valid news can appear again when
     metadata is restored.
   Assert observable Activity results, not helper-call counts or source text.
   Use existing test setup and teardown. Do not add a new testing framework.

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

Follow the plan-author skill's `references/verification-standards.md`.

### Local checks

Before editing, run `scripts/decky doctor` and
`scripts/decky verify-change dev --explain`. Record their actual results.
Add the focused regression first and show it fails on the old behavior. After
the fix, run the affected Vitest files through `./run.sh`. Temporarily omit the
Steam-store deletion and show the fallback regression fails; restore the fix.
Run the preservation/restoration controls after the removal cases.

Run `./scripts/orchestration-hooks/quality-gates` and `./run.sh npm test`.
Record exit status and test tallies. The gate must regenerate `dist/index.js`;
do not hand-edit the bundle.

### Deck acceptance

Use the committed device tools. Check `scripts/deck/tunnel.sh status` first:
the earlier refused connection was a closed local tunnel, not a failed Deck
debugger. Open a supervised tunnel if needed. Do not assume a failed capture
means the Deck is unavailable.

The user authorized this implementation run but explicitly selected **Do not
launch games**. Do not launch any game, including through automated smoke tests.
Deploy the frontend with `scripts/deck/deploy.sh`, then run
`scripts/deck/verify/run_all.sh --no-launch`. Report the launch check as unverified;
do not treat this as full-suite coverage. The metadata removal/restoration check
below remains required.

Use a native shortcut that currently has news; Space Marine `2155012430` was the
validated fixture, but recheck it. Confirm no game is running and back up its
metadata before mutation. Through the real UI:

1. Open Activity and record a visible news title.
2. Select **Remove metadata → Save → Done**.
3. Confirm the saved record has no news and the old title/cards are gone from
   Activity without reloading SteamUI. Leave and reopen the page; they must stay
   gone. Failure is any retained old plugin card.
4. Confirm another matched shortcut's Activity is unchanged.
5. Restore the fixture metadata and confirm its news appears again. Verify
   restored fields against the backup, allowing only `updated_at` to differ.
   Preserve the original release timestamp: the editor's date-only Save can
   change its time component.

Record before/after screenshots and actual outcomes below `/tmp/Decky-Metadata`.
Do not enumerate MobX store instances during rendering. Do not use a reload to
make the removal check pass. Restore the fixture even if a check fails.

### Completion

After behavior is verified, add a short `CHANGELOG.md` fix entry and one README
sentence that removing metadata also removes its Activity news. Record the
implementation and validation in `docs/agent_conversations/`; remove temporary
implementation scripts. Keep unrelated cleanup out of this change.

The game-launch check is intentionally excluded by the user's instruction.
Report it as unverified. All non-launch acceptance checks remain required; if
device access is unavailable, state the missing checks rather than claiming full
verification. Follow the generated orchestration contract for review and
finalization; do not publish, promote, or launch implementation while authoring
this plan.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished clear-removed-activity-news
```

This writes:

```text
/tmp/Decky-Metadata/clear-removed-activity-news_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer clear-removed-activity-news`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/clear-removed-activity-news-review-*.md
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
   scripts/orchestration/clear-finished clear-removed-activity-news
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
   git add docs/review/clear-removed-activity-news-review-*.md
   git commit -m "docs(review): record clear-removed-activity-news review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished clear-removed-activity-news
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer clear-removed-activity-news` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed clear-removed-activity-news
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize clear-removed-activity-news
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/clear-removed-activity-news_finalized
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
scripts/orchestration/finalize clear-removed-activity-news
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/clear-removed-activity-news_finished
/tmp/Decky-Metadata/clear-removed-activity-news_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
