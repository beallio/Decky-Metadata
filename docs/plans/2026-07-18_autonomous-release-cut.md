# Plan: Autonomous release-cut mode for the release-notes skill (autonomous-release-cut)

## Context

**Intent.** Upgrade the existing `decky-release-notes` skill so a maintainer can cut
a stable release with a single invocation and **no note-review pause**, while
keeping the one irreversible, outward-facing step — the `git push` that publishes
the GitHub release + self-updater assets — behind an explicit opt-in. The skill runs
the whole *local* flow autonomously (draft notes → roll the changelog over → commit
on `dev` → merge `dev → main --no-ff` → `scripts/release.sh X.Y.Z`) and by default
**stops before pushing**, presenting the prepared tag/package and the exact push
commands. When — and only when — the maintainer's request explicitly authorizes
publishing (e.g. "cut **and push** 0.3.2", "**publish** 0.3.2"), the skill also runs
the pushes and `scripts/bump_next_patch.sh`.

**Two dependencies already on `dev` (verify present before starting):**
`scripts/changelog.py` and `CHANGELOG.md` (from `changelog-release-gate`), and
`skills/decky-release-notes/SKILL.md` + `tests/test_decky_release_notes_skill.py`
(from `release-notes-skill`). If any is missing, stop — those plans must be finalized
to `dev` first.

**Why a deterministic `rollover` subcommand.** The release-cut's structural edit —
rename `## [Unreleased]` → `## [X.Y.Z] - <today>` and insert a fresh empty
`## [Unreleased]` above it — is mechanical and error-prone if done freehand by an
LLM. Making it a `scripts/changelog.py rollover` subcommand keeps the skill using
judgment only for *writing* the notes (the LLM-valuable part) and makes the
structural rollover deterministic and unit-tested. It must produce a section that
passes the existing `check X.Y.Z` (dated, substantive, summary-led), so the gate and
the rollover can never disagree.

**Safety model (unchanged boundary, less friction):** everything up to and including
`scripts/release.sh` is local and reversible; the maintainer invoking the skill *is*
the human authorization for the local `dev → main` promotion. The `git push origin
main` + tag push is the only irreversible/public act and stays gated: **default =
stop before push**; the explicit publish phrase in the request is the per-invocation
authorization. If the wording is ambiguous, the skill stops rather than guessing.

**Relevant files:**
- Edit: `scripts/changelog.py` (add the `rollover` subcommand), `tests/test_changelog.py`.
- Edit: `skills/decky-release-notes/SKILL.md` (upgrade Mode B to the autonomous cut +
  push opt-in), `tests/test_decky_release_notes_skill.py`.
- Reference (do not change behavior): `scripts/release.sh` (already gated + conditional
  commit + package-before-tag), `scripts/version_guard.py highest`,
  `scripts/bump_next_patch.sh`, `AGENTS.md` §7.

**Out of scope:** changing the CI gate or `release.sh`; making the *default* push
without an explicit request; auto-invocation of the skill (stays human-invoked); any
`src/`/`backend/`/`main.py`/`dist/` change.

**Slug used throughout this plan:** `autonomous-release-cut`

---

## Orchestration Contract

**Slug:** `autonomous-release-cut`

**Plan file:**

```text
docs/plans/2026-07-18_autonomous-release-cut.md
```

**Implementation branch:**

```text
feat/autonomous-release-cut
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/autonomous-release-cut_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/autonomous-release-cut_finalized
```

**Review notes:**

```text
docs/review/autonomous-release-cut-review-*.md
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
git checkout -b feat/autonomous-release-cut
```

Commit this plan first:

```bash
git add docs/plans/2026-07-18_autonomous-release-cut.md
git commit -m "docs(plan): add autonomous-release-cut implementation plan"
```

---

## Implementation Tasks

**Precondition (do first):** confirm `scripts/changelog.py`, `CHANGELOG.md`,
`skills/decky-release-notes/SKILL.md`, and `tests/test_decky_release_notes_skill.py`
all exist. If any is missing, stop and report the missing dependency.

Follow TDD for the `rollover` subcommand (write its tests first).

### 1. Add `rollover VERSION` to `scripts/changelog.py`

Reuse the existing helpers (`find_section`, the classifier, the SemVer/date rules) —
do not fork them. Behavior of `rollover X.Y.Z` (default target: the repo-root
`CHANGELOG.md`; honor the existing global `--file PATH`):

1. Resolve/validate `X.Y.Z` with the **same** strict-SemVer rule `check` uses (strip
   one optional leading `v`; reject leading zeros / pre-release / build).
2. Preconditions (fail non-zero with a clear message, mutating nothing, if any fail):
   - a `## [Unreleased]` section exists and is **substantive** (reuse the `check
     --unreleased` logic) **and** its first substantive line is a **non-bullet
     summary** (so the resulting stable section will pass `check X.Y.Z`);
   - no `## [X.Y.Z]` section already exists (would create a duplicate);
   - `X.Y.Z` is strictly ahead of `scripts/version_guard.py highest` (import/compare
     via the existing version tooling, or shell out to `version_guard.py highest` and
     compare) — refuse a re-release or a backwards version.
3. Edit: rename the `## [Unreleased]` **header line** to `## [X.Y.Z] - <today>` where
   `<today> = datetime.date.today().isoformat()`, and insert a fresh
   `## [Unreleased]` header (with a trailing blank line) **above** it. The moved
   body stays attached to the dated header; every other section is byte-for-byte
   unchanged. Preserve the file's newline style.
4. **Post-condition self-check:** after writing, the result must satisfy
   `check X.Y.Z` (call the same code path); if not, restore the original file and
   fail. Print the new title (`title X.Y.Z`) and the section body on success.

This subcommand only edits the file; it does not `git add`/commit/tag/push.

### 2. `tests/test_changelog.py` — cover `rollover` (write first)

Add cases (prefer the pure helper + a thin CLI check via `--file`):
- rollover on a substantive, summary-led `[Unreleased]` → produces
  `## [X.Y.Z] - <today>` with the moved body + a fresh empty `## [Unreleased]`
  above; `check X.Y.Z` then passes and `check --unreleased` then fails (empty);
- rollover refuses (non-zero, file unchanged) when: `[Unreleased]` is empty/
  placeholder; `[Unreleased]` leads with a bullet (no summary); a `## [X.Y.Z]`
  already exists; `X.Y.Z` is not ahead of the highest tag; `X.Y.Z` is malformed;
- the date written equals `datetime.date.today().isoformat()` (inject/monkeypatch or
  assert it matches today);
- idempotency guard: running rollover twice for the same version fails the second
  time (duplicate `[X.Y.Z]`).

### 3. Upgrade `skills/decky-release-notes/SKILL.md` — Mode B becomes the autonomous cut

Keep Mode A (draft/refresh `[Unreleased]`) as-is. Replace Mode B with an autonomous
local cut that uses the new subcommand and stops at the push gate by default. The
body MUST still contain the literal strings the structural test checks
(`scripts/version_guard.py highest`, `git log --no-merges`, `scripts/changelog.py
check`, `scripts/changelog.py extract`, `scripts/release.sh`) plus the safety phrases
(`never push`, `dev → main`, `does not run scripts/release.sh` is now **out of date**
— see below). Mode B steps:

1. Preconditions: on `dev`, clean tree. If `[Unreleased]` isn't current, run Mode A
   first (draft from `git log --no-merges "$(scripts/version_guard.py highest)"..HEAD`).
2. `scripts/changelog.py rollover X.Y.Z` (deterministic rename + fresh Unreleased).
3. Commit the changelog on `dev` (Conventional, e.g. `docs(changelog): roll over to
   X.Y.Z`).
4. `git checkout main && git merge --no-ff dev`.
5. `scripts/release.sh X.Y.Z` on clean `main` (re-checks the gate, builds the tag +
   package locally; it does not push).
6. **Push gate — default STOP.** Present the prepared tag, package, and the exact
   `git push origin main` / `git push origin vX.Y.Z` commands, and stop. Run the
   pushes **only if** the maintainer's request for *this invocation* explicitly
   authorizes publishing — an unambiguous directive such as "push", "publish", or
   "release it live". If it does, run both pushes, then
   `git checkout dev && scripts/bump_next_patch.sh` and commit the next base. **If
   there is any ambiguity about whether to push, do NOT push — stop and ask.**

Update the **Boundaries** section to match the new reality: the skill *may* perform
the local `dev → main` merge and run `scripts/release.sh` (the maintainer invoking it
authorizes the local cut), but it **never pushes by default** and only publishes on
an explicit per-invocation instruction; the public `git push` is the one gate. Retain
the literal safety phrases the test asserts — see task 4 for the updated expected
strings.

### 4. Update `tests/test_decky_release_notes_skill.py`

Adjust the safety/structure assertions to the upgraded skill. It must assert:
- frontmatter is still exactly `{name, description}`;
- the body contains `scripts/changelog.py rollover` and the existing required command
  strings;
- the push boundary is present as literal phrases: `never push` **by default** wording
  and an explicit-opt-in phrase (assert both a "default" stop-before-push statement and
  that pushing requires an explicit publish instruction — pick exact substrings you put
  in the SKILL.md, e.g. `push only if` / `explicitly` and `git push origin main`);
- keep `dev → main` present. Drop the now-false `does not run scripts/release.sh`
  assertion (the skill now *does* run it locally) and replace it with a check that the
  skill still never **pushes** without explicit authorization.
Make the SKILL.md wording and the test's expected substrings consistent (define the
phrases once, assert those exact ones).

### 5. Docs

- `AGENTS.md` §7 / §8: note that `decky-release-notes` Mode B now performs the full
  local cut and stops before the push by default, publishing only on an explicit
  request. Keep it to a couple of sentences.
- Session summary under `docs/agent_conversations/` per AGENTS.md §9.

Commits: Conventional and atomic (e.g. `feat(changelog): add rollover subcommand`,
`test(changelog): cover rollover`, `feat(skill): autonomous release cut with push
opt-in`).

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

Run from the repo root with `set -euo pipefail`; `must_fail` makes negative checks
self-failing.

```bash
set -euo pipefail
must_fail() { if "$@"; then echo "FAIL: unexpectedly succeeded: $*" >&2; exit 1; fi; }
cl() { python3 scripts/changelog.py "$@"; }

# 1. Dependencies present.
for f in scripts/changelog.py CHANGELOG.md skills/decky-release-notes/SKILL.md \
         tests/test_decky_release_notes_skill.py; do test -f "$f"; done && echo "deps present"

# 2. Unit tests (rollover + skill) pass via the cache wrapper + ephemeral uv.
./run.sh uv run --with pytest -- pytest -q tests/test_changelog.py tests/test_decky_release_notes_skill.py

# 3. rollover happy path on a fixture: produces a dated [X.Y.Z] that passes check,
#    plus a fresh empty [Unreleased] that then fails check --unreleased.
f=/tmp/Decky-Metadata/rollover-fix.md; today="$(date +%F)"
printf '# Changelog\n\n## [Unreleased]\nHarden the release pipeline.\n\n- feat: a\n\n## [0.3.1] - 2026-07-17\nPrev.\n' > "$f"
cl --file "$f" rollover 0.3.2
grep -q "## \[0.3.2\] - $today" "$f" && echo "dated header written ($today)"
cl --file "$f" check 0.3.2 && echo "rolled section passes gate"
cl --file "$f" title 0.3.2 | grep -Eq '^v0\.3\.2 — .+$' && echo "title enriches"
must_fail cl --file "$f" check --unreleased    # fresh Unreleased is empty

# 4. rollover refusals (each must fail AND leave the file unchanged).
chk_unchanged() { before="$(md5sum "$f")"; must_fail cl --file "$f" rollover "$1"; test "$(md5sum "$f")" = "$before"; }
printf '# Changelog\n\n## [Unreleased]\n- only a bullet\n' > "$f"; chk_unchanged 0.4.0 && echo "bullet-first refused, unchanged"
printf '# Changelog\n\n## [Unreleased]\nTODO\n' > "$f";          chk_unchanged 0.4.0 && echo "placeholder refused, unchanged"
printf '# Changelog\n\n## [Unreleased]\nReal.\n\n## [0.4.0] - 2026-07-18\nx\n' > "$f"; chk_unchanged 0.4.0 && echo "existing-version refused, unchanged"
printf '# Changelog\n\n## [Unreleased]\nReal.\n' > "$f";          chk_unchanged 0.3.0 && echo "not-ahead-of-tag refused, unchanged"  # highest tag is v0.3.1
printf '# Changelog\n\n## [Unreleased]\nReal.\n' > "$f";          chk_unchanged 1.2.3-dev && echo "malformed refused, unchanged"

# 5. SKILL.md structure + upgraded boundaries.
python3 - <<'PY'
text = open("skills/decky-release-notes/SKILL.md").read()
_, raw, body = text.split("---", 2)
meta = {k.strip(): v.strip() for k, v in (l.split(":", 1) for l in raw.strip().splitlines())}
assert set(meta) == {"name", "description"}, meta
for cmd in ("scripts/version_guard.py highest","git log --no-merges","scripts/changelog.py check",
            "scripts/changelog.py extract","scripts/changelog.py rollover","scripts/release.sh",
            "git push origin main"):
    assert cmd in body, cmd
assert "dev → main" in body
# Push must be gated: default stop, explicit opt-in required. (Assert the exact phrases
# the SKILL.md uses — keep these in sync with task 3/4.)
assert "never pushes by default" in body.lower() or "stop before" in body.lower(), "missing default-stop wording"
assert "explicit" in body.lower(), "missing explicit-opt-in wording"
print("SKILL.md structure + boundaries OK")
PY

# 6. Full project quality gate stays green; only this plan's files changed.
scripts/orchestration/run-quality-gates
git status --short
```

**Deferred verification (state in the session log; do NOT attempt here):** actually
invoking the upgraded skill end-to-end (a real `dev → main` merge + `scripts/release.sh`
run, and especially any `git push`) requires a human-driven release and must not be
run from this plan. The checks above prove the deterministic `rollover` subcommand,
its refusals, the skill's structure/boundaries, and that a rolled section satisfies the
gate; the live cut + the push opt-in are exercised only during a real, human-invoked
release. Do not push, tag, merge to `main`, or run `scripts/release.sh` from this plan.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished autonomous-release-cut
```

This writes:

```text
/tmp/Decky-Metadata/autonomous-release-cut_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer autonomous-release-cut`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/autonomous-release-cut-review-*.md
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
   scripts/orchestration/clear-finished autonomous-release-cut
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
   git add docs/review/autonomous-release-cut-review-*.md
   git commit -m "docs(review): record autonomous-release-cut review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished autonomous-release-cut
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer autonomous-release-cut` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed autonomous-release-cut
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize autonomous-release-cut
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/autonomous-release-cut_finalized
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
scripts/orchestration/finalize autonomous-release-cut
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/autonomous-release-cut_finished
/tmp/Decky-Metadata/autonomous-release-cut_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
