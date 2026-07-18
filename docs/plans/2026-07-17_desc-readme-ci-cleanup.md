# Plan: Metadata description, README name, and CI Node action cleanup (desc-readme-ci-cleanup)

## Context

Three small, independent consistency/hygiene fixes left over after the self-update
work, the identity rename to `Decky Metadata`, and the description update. All are
low-risk metadata/CI edits — no runtime code changes.

1. **`package.json` `description` is stale.** It still reads *"A Decky Loader plugin
   that adds clean web metadata and Steam activity news to non-Steam games in Steam
   Big Picture."* — the old wording (mentions "clean", "Steam Big Picture", omits
   controller layouts). `plugin.json`'s `publish.description` was already updated to
   the current text and is the canonical source. They must agree.
2. **README uses the old hyphenated display name in one spot.** `README.md:23` says
   *"check for and install Decky-**M**etadata updates"* — but the plugin's display
   name is now `Decky Metadata` (space). (The zip asset `Decky-Metadata.zip` and repo
   name stay hyphenated — those are filenames, do NOT touch them.)
3. **CI workflows pin deprecated action majors.** All three workflows use
   `actions/checkout@v4` and `actions/setup-node@v4`, which target Node 20 and are
   being force-run on Node 24 with a deprecation warning. Bump both to `@v5`.

Exact current locations (verify before editing — line numbers may drift):
- `package.json` — the `"description"` field (single line).
- `plugin.json` — `publish.description` = the canonical string to copy:
  `Add game metadata, Steam activity news, and Steam community controller layouts to non-Steam games in Steam Gaming Mode.`
- `README.md:23` — the QAM capabilities sentence containing "Decky-Metadata updates".
- `.github/workflows/ci.yml` (checkout ~L17, setup-node ~L22),
  `.github/workflows/release.yml` (~L25, ~L30),
  `.github/workflows/dev-release.yml` (~L47, ~L53).

Out of scope (do NOT do these here): rewording the README beyond the single
hyphen→space fix (adding controller-layouts marketing prose is a separate content
decision); pruning merged local git branches; and clearing the `self-update-panel`
orchestration marker/branch state — those are local housekeeping with no committed
diff and are handled outside this plan.

**Slug used throughout this plan:** `desc-readme-ci-cleanup`

---

## Orchestration Contract

**Slug:** `desc-readme-ci-cleanup`

**Plan file:**

```text
docs/plans/2026-07-17_desc-readme-ci-cleanup.md
```

**Implementation branch:**

```text
feat/desc-readme-ci-cleanup
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/desc-readme-ci-cleanup_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/desc-readme-ci-cleanup_finalized
```

**Review notes:**

```text
docs/review/desc-readme-ci-cleanup-review-*.md
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
git checkout -b feat/desc-readme-ci-cleanup
```

Commit this plan first:

```bash
git add docs/plans/2026-07-17_desc-readme-ci-cleanup.md
git commit -m "docs(plan): add desc-readme-ci-cleanup implementation plan"
```

---

## Implementation Tasks

These are three independent edits; do them in one commit (or three small ones).
No tests change behavior here — this is metadata/CI. Do not touch any `src/`,
`backend/`, `main.py`, or `dist/` files.

1. **Sync `package.json` `description`.** Set it **verbatim equal** to
   `plugin.json`'s `publish.description`:
   `"Add game metadata, Steam activity news, and Steam community controller layouts to non-Steam games in Steam Gaming Mode."`
   Read the value from `plugin.json` rather than retyping it, to guarantee they match.
   Change nothing else in `package.json` (keep `version`, `name`, scripts, etc.).

2. **Fix the README display name.** In `README.md`, change the single phrase
   `check for and install Decky-Metadata updates` →
   `check for and install Decky Metadata updates` (hyphen → space). Do not change any
   other occurrence of `Decky-Metadata` in the README — the install/asset references
   (`Decky-Metadata.zip`, repo URLs, badge slugs) are filenames/identifiers and must
   stay hyphenated. Do not add or reword anything else.

3. **Bump the CI action majors.** In each of `.github/workflows/ci.yml`,
   `.github/workflows/release.yml`, and `.github/workflows/dev-release.yml`, replace:
   - `uses: actions/checkout@v4` → `uses: actions/checkout@v5`
   - `uses: actions/setup-node@v4` → `uses: actions/setup-node@v5`
   There are two such lines per file (six total). Change only the action version pins;
   leave every `with:` block (node-version, cache, ref, fetch-depth, etc.) unchanged —
   the v5 majors are drop-in for how these workflows use them.

4. Record a session summary under `docs/agent_conversations/` per AGENTS.md §9.

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
# 1. Descriptions now match exactly.
node -e "const a=require('./package.json').description,b=require('./plugin.json').publish.description; if(a!==b) throw new Error('mismatch:\n'+a+'\n'+b); console.log('descriptions match:', a)"

# 2. README fixed and no stray hyphenated display-name left; asset refs untouched.
grep -n 'Decky Metadata updates' README.md          # expect the fixed line
! grep -n 'Decky-Metadata updates' README.md         # expect NO match (exits nonzero => good)
grep -c 'Decky-Metadata.zip' README.md               # asset references still present, unchanged

# 3. All workflow action pins bumped; no v4 left.
grep -rnE 'actions/(checkout|setup-node)@v5' .github/workflows/   # expect 6 lines
! grep -rnE 'actions/(checkout|setup-node)@v4' .github/workflows/ # expect NO match

# 4. Project gates stay green (nothing behavioral changed).
scripts/orchestration/run-quality-gates
git status --short   # clean; only package.json, README.md, and the 3 workflow files (+ session log) changed
```

Also confirm the three workflow YAML files still parse:

```bash
python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]; print('workflows parse OK')"
```

Deferred verification (state in the session log, do not attempt here): confirming the
`@v5` actions actually run green on GitHub Actions happens on the next real push/tag
that triggers CI — it cannot be exercised locally. The change is a drop-in major bump,
so no runtime behavior change is expected.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished desc-readme-ci-cleanup
```

This writes:

```text
/tmp/Decky-Metadata/desc-readme-ci-cleanup_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer desc-readme-ci-cleanup`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/desc-readme-ci-cleanup-review-*.md
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
   scripts/orchestration/clear-finished desc-readme-ci-cleanup
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
   git add docs/review/desc-readme-ci-cleanup-review-*.md
   git commit -m "docs(review): record desc-readme-ci-cleanup review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished desc-readme-ci-cleanup
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer desc-readme-ci-cleanup` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed desc-readme-ci-cleanup
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize desc-readme-ci-cleanup
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/desc-readme-ci-cleanup_finalized
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
scripts/orchestration/finalize desc-readme-ci-cleanup
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/desc-readme-ci-cleanup_finished
/tmp/Decky-Metadata/desc-readme-ci-cleanup_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
