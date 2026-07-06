# Plan: Locale-neutral Steam Activity type labels (locale-neutral-activity-labels)

## Context

The thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`, MAJOR 8) found that
the Steam Activity type labels rendered into the native Activity feed are hardcoded **Italian**
string literals shipped to **all** users — a leftover from the upstream author's locale. Every
non-Italian user sees Italian category strings inside an otherwise-localized Steam UI, and the
generic fallback is the Italian word `"Notizie"`.

**Verified against current code — `src/steam/activity.ts:234-244` and `260`:**

```ts
const DECKY_STEAM_ACTIVITY_TYPE_LABELS: Record<number, string> = {
  12: "Aggiornamento minore / Note della patch",
  13: "Aggiornamento standard",
  14: "Aggiornamento importante",
  15: "Pubblicazione contenuti scaricabili",
  23: "Evento: bottino",
  24: "Evento: vantaggi",
  25: "Evento: sfida",
  28: "Notizie",
  35: "Evento nel gioco",
};
...
const deckySteamActivityTypeLabel = (type: number) =>
  DECKY_STEAM_ACTIVITY_TYPE_LABELS[type] || "Notizie";
```

These labels feed real UI: `deckySteamActivityTypeLabel(...)` supplies `feedlabel`/`author` and
`GetCategoryAsString`/`GetEventTypeAsString` on the synthetic events (`activity.ts` ~176-177,
~466-467, ~548-549). Every other user-facing string in this plugin is English (e.g. the
`"Steam News"` fallback at `activity.ts:466`, all `ContentPanel.tsx`/`MetadataPage.tsx` strings).

The project has already been burned by locale assumptions — `tests/test_locale_neutral_tab_detection.py`
exists for exactly this class of bug — so a small regression guard is warranted.

**Intended outcome:** the activity-type labels and the fallback are English, matching every other
string the plugin renders. This is a **string-only** change; the numeric event-type mapping, tags,
and all surrounding logic are untouched. The Steam event-type numbers (12/13/14/15/23/24/25/28/35)
and their semantics stay exactly as they are; only the human-readable text changes.

### Relevant files
`src/steam/activity.ts` (`DECKY_STEAM_ACTIVITY_TYPE_LABELS` values + the `"Notizie"` fallback in
`deckySteamActivityTypeLabel`), `tests/` (a small guard asserting no Italian residue — TS-side or a
lightweight source-scan test consistent with the repo's existing test style), `dist/index.js`
(rebuilt), `docs/agent_conversations/`.

**Out of scope / deferred (needs its own effort):** full runtime internationalization (resolving
Steam's own localized event-type strings via a native lookup, or a Decky i18n layer) is a larger
effort deferred to its own plan. This plan only removes the hardcoded Italian by substituting
English defaults.

> Source: thermo-nuclear review (2026-07-05) MAJOR 8, verified against current code by the author.

**Slug used throughout this plan:** `locale-neutral-activity-labels`

---

## Orchestration Contract

**Slug:** `locale-neutral-activity-labels`

**Plan file:**

```text
docs/plans/2026-07-05_locale-neutral-activity-labels.md
```

**Implementation branch:**

```text
feat/locale-neutral-activity-labels
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/locale-neutral-activity-labels_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/locale-neutral-activity-labels_finalized
```

**Review notes:**

```text
docs/review/locale-neutral-activity-labels-review-*.md
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
git checkout -b feat/locale-neutral-activity-labels
```

Commit this plan first:

```bash
git add docs/plans/2026-07-05_locale-neutral-activity-labels.md
git commit -m "docs(plan): add locale-neutral-activity-labels implementation plan"
```

---

## Implementation Tasks

String-only change. Do not alter the numeric mapping, tags, or any logic around the labels.

### Task 1 — Replace Italian labels with English

In `src/steam/activity.ts`, replace the `DECKY_STEAM_ACTIVITY_TYPE_LABELS` values (~234-244) with
concise English equivalents that match Steam's own event-type vocabulary and the plugin's existing
English tone. Suggested mapping (the implementer may refine wording, but must be English and must
keep the same numeric keys):

```ts
const DECKY_STEAM_ACTIVITY_TYPE_LABELS: Record<number, string> = {
  12: "Minor update / Patch notes",
  13: "Update",
  14: "Major update",
  15: "Downloadable content",
  23: "Event: Loot",
  24: "Event: Perks",
  25: "Event: Challenge",
  28: "News",
  35: "In-game event",
};
```

- Update the fallback in `deckySteamActivityTypeLabel` (~260) from `|| "Notizie"` to `|| "News"`.
- Keep the existing `DECKY_STEAM_ACTIVITY_TYPE_TAGS` (~245-255) exactly as-is — those are internal
  tag strings, already English, not user-facing locale text.
- Do not change the `28`/`STEAM_PARTNER_EVENT_TYPE_NEWS` mapping or any surrounding logic.

### Task 2 — Regression guard against locale residue

Add a lightweight guard consistent with the repo's test style (the project already tests locale
neutrality in `tests/test_locale_neutral_tab_detection.py`). A source-scan test is sufficient and
robust: assert that `src/steam/activity.ts` contains none of the removed Italian tokens. For
example, a Python test under `tests/` that reads the file and asserts absence of:
`Aggiornamento`, `Notizie`, `Pubblicazione`, `bottino`, `vantaggi`, `sfida`, `nel gioco`.

- Place it as `tests/test_locale_neutral_activity_labels.py` (reads
  `src/steam/activity.ts`, asserts the Italian tokens are absent and that the English keys
  `"News"`/`"Update"` are present).
- Confirm it is **red** against the current file (Italian present) before Task 1, **green** after.
  If the implementer prefers a TS-side assertion, that is acceptable provided it runs under the
  existing gate; otherwise use the Python source-scan form above.

### Task 3 — Rebuild + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-05_locale-neutral-activity-labels.md`: the MAJOR 8
  finding and review source, the English substitution, the guard test red→green evidence, and the
  deferred full-i18n note.

### Scope discipline

Only the label strings and their fallback. Do NOT touch the event-type numbers, tags, image logic,
or any other `activity.ts` construct. Preserve all other behavior.

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
./run.sh uv run --with pytest -- pytest -q           # incl new locale guard test
scripts/orchestration/run-quality-gates
git status --short                                   # clean
```

Grep/scope gates:

```bash
# Task 1 — no Italian residue in the labels, English present:
grep -nE "Aggiornamento|Notizie|Pubblicazione|bottino|vantaggi|sfida|nel gioco" src/steam/activity.ts   # ZERO matches
grep -n "DECKY_STEAM_ACTIVITY_TYPE_LABELS" src/steam/activity.ts   # keys unchanged (12..35)
grep -n '|| "News"' src/steam/activity.ts                          # fallback now English
# also confirm no Italian leaked into the built bundle:
grep -nE "Aggiornamento|Notizie" dist/index.js                     # ZERO matches
# Task 2 — guard test exists:
ls tests/test_locale_neutral_activity_labels.py
git diff --name-only dev..HEAD                                      # scope: activity.ts, tests, dist, docs
```

Static review:
- All nine label values and the fallback are English; the numeric keys and the tag table are
  unchanged.
- The guard test proves red (Italian present) → green (removed), and greps show no Italian in either
  `activity.ts` or `dist/index.js`.
- No logic, event-type, tag, or image behavior changed — strings only.

### Deferred verification — on-device
Sideload and open the Activity feed for a matched non-Steam game; confirm the category/feed labels
render in English (e.g. "News", "Update", "In-game event") rather than Italian.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished locale-neutral-activity-labels
```

This writes:

```text
/tmp/Decky-Metadata/locale-neutral-activity-labels_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer locale-neutral-activity-labels`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/locale-neutral-activity-labels-review-*.md
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
   scripts/orchestration/clear-finished locale-neutral-activity-labels
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
   git add docs/review/locale-neutral-activity-labels-review-*.md
   git commit -m "docs(review): record locale-neutral-activity-labels review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished locale-neutral-activity-labels
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer locale-neutral-activity-labels` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed locale-neutral-activity-labels
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize locale-neutral-activity-labels
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/locale-neutral-activity-labels_finalized
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
scripts/orchestration/finalize locale-neutral-activity-labels
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/locale-neutral-activity-labels_finished
/tmp/Decky-Metadata/locale-neutral-activity-labels_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
