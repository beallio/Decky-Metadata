# Plan: Delisted Market Button Visibility (delisted-market-button-visibility)

## Context

For delisted Steam games matched to non-Steam shortcuts, Steam's Game Info
quick links now mostly work, but the `Market` quick link can appear on the first
Game Info render and then disappear after navigating into a subsection such as
Discussions and returning.

The observed behavior is consistent with the current frontend metadata patch:

```text
src/steam/metadataPatch.ts
appData.details.bCommunityMarketPresence = true;
```

That flag is set while injecting screenshots, so the plugin can temporarily
make Steam believe a shortcut has Community Market presence even when the
matched Steam app is delisted and has no market/store surface. After a
Steamweb subsection round-trip, Steam rebuilds enough native detail state that
the real delisted state wins and the `Market` link disappears.

The intended behavior is simpler: delisted Steam matches should never show the
`Market` button. Other Game Info quick links, including Community/Discussions,
Guides, screenshots, and Activity behavior, must keep working.

The existing metadata shape does not durably preserve that an app id came from
the delisted index once IGN or other metadata backfills the title/description.
Do not solve this with frontend title/app-id special cases. Add durable store
availability/provenance data to metadata and use it when applying native Steam
detail fields.

Primary files:

- `main.py`
- `backend/providers/delisted.py` only if a small helper is needed
- `src/types.ts`
- `src/steam/metadataPatch.ts`
- `dist/index.js`
- `dist/index.js.map`
- `tests/test_scan_counter_reconciliation.py` or a focused new backend test file
- `docs/agent_conversations/2026-07-07_delisted-market-button-visibility.md`

**Slug used throughout this plan:** `delisted-market-button-visibility`

---

## Orchestration Contract

**Slug:** `delisted-market-button-visibility`

**Plan file:**

```text
docs/plans/2026-07-07_delisted-market-button-visibility.md
```

**Implementation branch:**

```text
feat/delisted-market-button-visibility
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/delisted-market-button-visibility_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/delisted-market-button-visibility_finalized
```

**Review notes:**

```text
docs/review/delisted-market-button-visibility-review-*.md
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
git checkout -b feat/delisted-market-button-visibility
```

Commit this plan first:

```bash
git add docs/plans/2026-07-07_delisted-market-button-visibility.md
git commit -m "docs(plan): add delisted-market-button-visibility implementation plan"
```

---

## Implementation Tasks

### 1. Confirm current behavior and create the session log

1. Follow `AGENTS.md` session initialization and use `./run.sh` for project
   commands.
2. Confirm the current source still sets
   `appData.details.bCommunityMarketPresence = true` in
   `src/steam/metadataPatch.ts`.
3. Create and maintain:

   ```text
   docs/agent_conversations/2026-07-07_delisted-market-button-visibility.md
   ```

   Record the root cause, files changed, behavior decisions, validation
   results, and any deferred on-device verification.

### 2. Add durable Steam store availability metadata

1. Extend the backend metadata record with an explicit field that can represent
   Steam store availability for matched Steam app ids. Use this field name:

   ```text
   steam_store_state
   ```

2. Use only these string values:

   ```text
   available
   delisted
   unknown
   ```

3. Update backend sanitization/loading so the field is preserved and normalized.
   Invalid or missing values should become `unknown`, except where existing
   repo evidence can classify the app id as `delisted` or `available`.
4. When `_delisted_scan_match_sync` resolves an app id from the cached delisted
   index, persist `steam_store_state: "delisted"` with that metadata.
5. When normal Steam appdetails resolution succeeds for a matched app id, persist
   `steam_store_state: "available"` unless existing metadata is already
   explicitly `delisted`.
6. Preserve the delisted state through IGN/manual metadata backfill. A delisted
   app id must not lose `steam_store_state: "delisted"` simply because its
   title, description, source, screenshots, or news were backfilled from another
   provider.
7. For existing metadata records that have a `steam_appid` but no
   `steam_store_state`, classify as `delisted` when the current cached delisted
   index contains that app id. Do not force a network refresh on ordinary
   metadata load just to classify older records; use the cached in-memory/disk
   index when available.
8. Update TypeScript metadata types in `src/types.ts` to include the new field.
9. Do not remove or rename existing fields such as `steam_appid` or
   `steam_store_url`.

### 3. Stop forcing Community Market presence for delisted matches

1. In `src/steam/metadataPatch.ts`, stop setting
   `appData.details.bCommunityMarketPresence = true` for records where
   `metadata.steam_store_state === "delisted"`.
2. For delisted records, explicitly force known market-presence fields on
   `appData.details` to false when those fields exist or are safe to assign.
   At minimum, set `bCommunityMarketPresence` to `false`.
3. For non-delisted records, preserve the current screenshot/detail behavior as
   much as possible. This plan is not a request to remove Market for available
   Steam games.
4. Keep the Game Info spoofing/route-shield behavior intact. The delisted
   market change must not bring back disappearing Community/Guides/Discussions
   quick links.
5. Keep Steam navigation URL rewriting intact so delisted matched app ids still
   navigate Community/Discussions to the matched Steam app id.
6. Do not add title-specific or app-id-specific hacks for Transformers. The
   behavior must derive from `steam_store_state`.

### 4. Tests and build artifacts

1. Add backend tests proving:
   - delisted scan matches persist `steam_store_state: "delisted"`;
   - IGN/manual backfill preserves an existing delisted store state;
   - normal Steam appdetails success can mark a record `available`;
   - sanitization preserves valid values and normalizes invalid/missing values.
2. If a lightweight frontend test pattern already exists for source text
   contracts, add coverage that delisted metadata does not force
   `bCommunityMarketPresence = true`. If no such pattern exists, rely on
   TypeScript build plus reviewer source inspection.
3. Rebuild the frontend bundle so `dist/index.js` and `dist/index.js.map` match
   the TypeScript source.
4. Update the session log with final validation.

---

## Quality Gates

Run before marking any round complete:

```bash
./run.sh npm run build
./run.sh scripts/orchestration/run-quality-gates
./run.sh scripts/orchestration/check-review-notes-not-deleted
git diff --check dev...HEAD
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

Automated/local verification:

1. `./run.sh npm run build`
2. `./run.sh scripts/orchestration/run-quality-gates`
3. `./run.sh scripts/orchestration/check-review-notes-not-deleted`
4. `git diff --check dev...HEAD`
5. `git status --short`

Deferred on-device verification:

1. Package and install the plugin on the Steam Deck.
2. Use a delisted matched shortcut such as `Transformers Fall of Cybertron`
   (`3276984150` matched to Steam app id `213120`) or `Transformers
   Devastation` (`3015223078` matched to Steam app id `338930`).
3. Open Game Info and confirm the `Market` quick link is not visible on the
   initial render.
4. Open Discussions, Guide, or another Steamweb subsection and return to Game
   Info. Confirm `Market` is still not visible.
5. Confirm other expected quick links still work for the matched Steam app:
   Community/Discussions should still rewrite to the matched Steam app id and
   return to Game Info without losing the remaining quick links.
6. Spot-check an available/non-delisted matched Steam app. Confirm this change
   did not remove Market there if Steam normally exposes it.

The implementer must not claim on-device verification is complete unless these
Deck checks are actually performed. If only local gates are run, record the Deck
checks as deferred in the session log.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished delisted-market-button-visibility
```

This writes:

```text
/tmp/Decky-Metadata/delisted-market-button-visibility_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer delisted-market-button-visibility`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/delisted-market-button-visibility-review-*.md
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
   scripts/orchestration/clear-finished delisted-market-button-visibility
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
   git add docs/review/delisted-market-button-visibility-review-*.md
   git commit -m "docs(review): record delisted-market-button-visibility review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished delisted-market-button-visibility
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer delisted-market-button-visibility` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed delisted-market-button-visibility
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize delisted-market-button-visibility
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/delisted-market-button-visibility_finalized
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
scripts/orchestration/finalize delisted-market-button-visibility
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/delisted-market-button-visibility_finished
/tmp/Decky-Metadata/delisted-market-button-visibility_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
