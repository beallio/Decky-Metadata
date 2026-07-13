# Plan: Matched Non-Steam Game Info Idle-Decay Fix (matched-quicklinks-idle-decay)

## Context

**Slug used throughout this plan:** `matched-quicklinks-idle-decay`

### Problem and outcome

On a **matched** non-Steam game (a shortcut with a real `steam_appid`), open its
Game Info tab: the quick-links row (Store Page / Community Hub / Discussions /
Guides / Support) and our injected rich metadata render, then **decay while the
page sits idle** — no navigation, no input. Steam periodically rebuilds the
shortcut's `details` object and wipes our injected fields (evidence:
`strFullDescription:""` and `links.length === 0` after ~48s idle, while the
spoof `BIsModOrShortcut()` still returns `false`). Leaving and re-entering the
page restores them briefly, then they decay again.

**Outcome:** for matched non-Steam games, the injected link-driving fields and
description **survive an idle `details` rebuild** — the quick-links row and
description persist across a >60s idle without navigation. If the links turn out
to depend on genuinely async store data that cannot be re-asserted, the outcome is
instead a **documented limitation** recorded with evidence rather than a brittle
fix.

This was originally task 5 of
`docs/plans/2026-07-12_live-community-media.md` and was carved out into its own
plan because it is an open, on-device CDP investigation whose fix-vs-document
outcome is genuinely uncertain, unlike the bounded items in that plan.

### Prior investigation (authoritative — read first)

`docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md` contains the live
CDP evidence, the ruled-out causes, the current best hypothesis (Steam rebuilds
`details` bound to the shortcut appid and drops our injected state), the exact
Steam-bundle and React-anchor locations to inspect, the concrete next steps, and a
self-contained CDP how-to (tunnel + `cdp_eval.py`). Treat its "Concrete next
steps" as the investigation spine.

### Relevant files

- `src/steam/metadataPatch.ts` — `applyMetadata` injects
  `descriptionsData`/`associationData`/screenshots via
  `appDetailsCache.SetCachedDataForApp(...)`. The idle rebuild wipes these, so the
  re-assert must survive a `details` rebuild, not just a render.
- `src/steam/routerPatches.ts` — the GAME_DETAIL_ROUTES render patch re-applies on
  render; the idle decay happens **without** a render, so a render-only re-apply
  will not hold.
- `docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md` — evidence + how-to.
- Device Steam bundle (read-only, on device): `~/.local/share/Steam/steamui/`
  (`chunk~2dcc5aaf7.js` assembles the links array around
  `#AppDetails_Links_Store`).

### Constraints and scope

- **Matched non-Steam games only.** Unmatched (no `steam_appid`) games already have
  their quick-links row removed by `hide-quicklinks-row-nonsteam`; do not touch
  that path.
- Do not regress the route shield / `BIsModOrShortcut` spoof — the spoof is not the
  cause (it stays `false` throughout) and must remain intact.
- `dev` is local-only; never push to origin, never merge to `main` here.
- Backend is out of scope — this is a SteamUI-injection lifecycle fix in `src/steam/`.
- This decay is distinct from `gameinfo-shield-exhaustion` (merged),
  `hide-quicklinks-row-nonsteam`, and `gameinfo-focus-reset`; do not conflate.

---

## Orchestration Contract

**Slug:** `matched-quicklinks-idle-decay`

**Plan file:**

```text
docs/plans/2026-07-12_matched-quicklinks-idle-decay.md
```

**Implementation branch:**

```text
feat/matched-quicklinks-idle-decay
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/matched-quicklinks-idle-decay_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/matched-quicklinks-idle-decay_finalized
```

**Review notes:**

```text
docs/review/matched-quicklinks-idle-decay-review-*.md
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
git checkout -b feat/matched-quicklinks-idle-decay
```

Commit this plan first:

```bash
git add docs/plans/2026-07-12_matched-quicklinks-idle-decay.md
git commit -m "docs(plan): add matched-quicklinks-idle-decay implementation plan"
```

---

## Implementation Tasks

This is an investigation-then-fix task. The static gates cannot exercise the fix;
on-device CDP work is required and its verification is deferred (see Verification).
Work in order.

### 1. Reproduce and instrument the decay (on-device CDP)

Follow the CDP how-to in the research doc (tunnel + `cdp_eval.py`, or the committed
`scripts/deck/cdp.py`). On a matched non-Steam game (the doc used Transformers:
Devastation, shortcut `3015223078` → Steam `338930`):

1. Confirm fresh-open state: quick-links section child has `links.length === 5`
   and the injected `strFullDescription` is present.
2. Let the page sit idle (>60s) and capture the decayed state: `links.length === 0`,
   `strFullDescription === ""`, `BIsModOrShortcut() === false`.
3. Subscribe to / poll `appDetailsStore.GetAppData(<shortcutId>).details` and log
   when the object identity changes and which link-driving fields flip. Identify
   the trigger (timer, store subscription, focus/visibility event).

Record the captured evidence in the session log.

### 2. Enumerate the link-builder inputs

Read the full `l = [...]` link-assembly in the device Steam bundle
(`~/.local/share/Steam/steamui/chunk~2dcc5aaf7.js`, search `#AppDetails_Links_Store`
/ `#AppDetails_Link_Discussions`). List the exact `details`/`overview` fields each
of the 5 store/community links reads (candidates from the doc: `rgCards`,
`bAvailableContentOnStore`, async store-item data). This tells you precisely which
injected state is present-then-dropped and must be re-asserted.

### 3. Implement the re-assert fix (or prove it must be a documented limitation)

In `src/steam/metadataPatch.ts` / `src/steam/routerPatches.ts`, detect the idle
`details` rebuild for matched non-Steam games and **re-assert** the link-driving
fields and description on the rebuilt `details`, then force the section to
re-render — so the links return **and persist** across idle. The re-assert must
key on the `details` rebuild (subscribe to the store / patch the getter or cache),
not on a render event, because the decay occurs without a render.

Test the hypothesis on-device first (re-assert on the idle page, confirm links
return and hold). If — and only if — the links depend on genuinely async store
data for the shortcut appid that cannot be re-asserted without continuously faking
store-item fetches, STOP and record it as a **documented limitation** in the
research doc (with the enumerated fields and why re-assert is insufficient) instead
of shipping a brittle fix.

### 4. Guard against regression where testable

Where the fix introduces pure, unit-testable logic (e.g. a helper deciding whether
a given app is a matched non-Steam shortcut that should be re-asserted, or field
merge/selection), add a vitest covering it. The end-to-end persistence behavior
itself is on-device only (deferred verification) — do not fake a green unit test
that claims to prove idle persistence.

### 5. Docs

Update `docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md` with the
findings and the outcome (the fix mechanism, or the documented limitation with
evidence). Flip its status from OPEN accordingly. Record a session log in
`docs/agent_conversations/`.

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

Static gates (run and confirm green before the round-complete marker):

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
```

This must pass `tsc --noEmit`, the rollup build (regenerate `dist/index.js` when
the frontend changed), vitest, `main.py` byte-compile, pytest, version-drift, and
`git diff --check`. Any unit tests added in task 4 pass.

**The core behavior of this plan is on-device only and cannot be proven by the
static gates.** Deferred on-device verification (manual; required before this
change ships to `main`; full-plugin path per `docs/runbooks/on-device-verification.md`):

1. On a matched non-Steam game, the quick-links row and injected description are
   present on fresh open, and **still present after a >60s idle** with no
   navigation or input (the decay no longer occurs). Confirm over CDP that
   `links.length` stays at its fresh value and `strFullDescription` is non-empty
   after idle.
2. Leaving and re-entering the page, and repeated idle cycles, do not reintroduce
   the decay.
3. No regression to the `BIsModOrShortcut` spoof (`=== false` throughout) or to
   unmatched-game behavior (their row stays removed).
4. `scripts/deck/verify/run_all.sh` (including `smoke_idle_quicklinks.sh` if used)
   is green; no game launch without explicit `--allow-launch`.

**If the outcome is the documented-limitation path instead of a fix:** the deferred
checks above are replaced by confirming the research doc records the enumerated
link-builder inputs and the concrete reason re-assert is insufficient; no runtime
behavior change ships.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished matched-quicklinks-idle-decay
```

This writes:

```text
/tmp/Decky-Metadata/matched-quicklinks-idle-decay_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer matched-quicklinks-idle-decay`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/matched-quicklinks-idle-decay-review-*.md
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
   scripts/orchestration/clear-finished matched-quicklinks-idle-decay
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
   git add docs/review/matched-quicklinks-idle-decay-review-*.md
   git commit -m "docs(review): record matched-quicklinks-idle-decay review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished matched-quicklinks-idle-decay
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer matched-quicklinks-idle-decay` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed matched-quicklinks-idle-decay
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize matched-quicklinks-idle-decay
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/matched-quicklinks-idle-decay_finalized
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
scripts/orchestration/finalize matched-quicklinks-idle-decay
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/matched-quicklinks-idle-decay_finished
/tmp/Decky-Metadata/matched-quicklinks-idle-decay_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
