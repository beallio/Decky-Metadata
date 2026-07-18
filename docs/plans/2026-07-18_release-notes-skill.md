# Plan: Release-notes drafting and cut skill (release-notes-skill)

## Context

**Problem / intent.** A companion to the `changelog-release-gate` feature. That
feature adds a *deterministic* gate (`scripts/changelog.py` + CI + `scripts/release.sh`)
that refuses to publish a stable/manual-dev release unless `CHANGELOG.md` carries
curated, dated, summary-led notes. The gate enforces; it does not *author*. The
judgment-heavy, generative half — reading the commit range, grouping it into a good
changelog section with a title-worthy summary line, and performing the
`[Unreleased]` → `[X.Y.Z]` rollover — is exactly where a skill helps. This plan adds
an **assistive project skill** that drafts/refreshes the notes and prepares a
release cut, then hands off to the existing human-gated release flow. **The skill
never enforces and never publishes** — it produces notes that pass the gate.

**HARD DEPENDENCY — do not start until `changelog-release-gate` is finalized on
`dev`.** This skill calls `scripts/changelog.py` (`check`/`extract`) and edits the
`CHANGELOG.md` those introduce. Branch `feat/release-notes-skill` from a `dev` that
already contains them; if `scripts/changelog.py` or `CHANGELOG.md` is absent, stop
and report — do not re-implement the gate here.

**What the skill does (two modes).**
1. **Draft/refresh `[Unreleased]`** — resolve the highest stable tag with
   `scripts/version_guard.py highest` (currently `v0.3.1`), read
   `git log --no-merges <tag>..HEAD`, group commits by Conventional-Commit type,
   write a concise leading **summary line** (≤ ~72 chars, non-bullet — the future
   enriched title) plus bullets, and update `## [Unreleased]` in `CHANGELOG.md`
   (leaving historical sections untouched). Confirm with
   `scripts/changelog.py check --unreleased`, then show the diff for human review.
2. **Prepare a release cut `X.Y.Z`** — on `dev`, per the lifecycle documented in the
   gate plan's task 7: rename `## [Unreleased]` → `## [X.Y.Z] - <today>` (ensuring a
   leading non-bullet summary line and a real ISO date), insert a fresh empty
   `## [Unreleased]` above it, and confirm with `scripts/changelog.py check X.Y.Z`.
   Then **stop and hand off**: instruct the human to commit on `dev`, merge
   `dev → main --no-ff`, and run `scripts/release.sh X.Y.Z`. The skill does **not**
   run `release.sh`, tag, push, or promote — those keep their existing human gates.

**Repo skill conventions (match exactly — there is a structural test).**
- Project skills live at `skills/<name>/SKILL.md` with YAML frontmatter whose keys
  are **exactly** `name` and `description` (see `tests/test_decky_project_skill.py`,
  which splits on `---` and asserts `set(metadata) == {"name","description"}`), plus
  an `agents/openai.yaml` interface file (`display_name`, `short_description`,
  `default_prompt`) like `skills/decky-project-workflow/agents/openai.yaml`.
- Installation is a symlink created by `scripts/install_project_skill.sh`, which is
  **hardcoded** to `decky-project-workflow` today (`source_path=.../decky-project-workflow`,
  and the default `--dest` basename). It must be generalized to select a skill by
  name so a second skill can be installed, **without breaking** its current
  single-arg behavior or the existing `tests/test_install_project_skill.py`.

**Relevant files (verify before editing):**
- New: `skills/decky-release-notes/SKILL.md`, `skills/decky-release-notes/agents/openai.yaml`.
- Edit: `scripts/install_project_skill.sh` (add skill selection, back-compatible).
- New test: `tests/test_decky_release_notes_skill.py` (mirror
  `tests/test_decky_project_skill.py`). Edit: `tests/test_install_project_skill.py`
  (cover skill selection + back-compat default).
- Reference (do not duplicate): `scripts/changelog.py`, `CHANGELOG.md` (from the gate
  plan), `scripts/version_guard.py highest`, `scripts/release.sh`, `AGENTS.md` §7.

**Out of scope:** changing `scripts/changelog.py` or the CI gate (a separate,
already-planned feature); making the skill push/tag/promote or run `release.sh`;
auto-invocation (it is human-invoked); any `src/`/`backend/`/`main.py`/`dist/` change.

**Slug used throughout this plan:** `release-notes-skill`

---

## Orchestration Contract

**Slug:** `release-notes-skill`

**Plan file:**

```text
docs/plans/2026-07-18_release-notes-skill.md
```

**Implementation branch:**

```text
feat/release-notes-skill
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/release-notes-skill_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/release-notes-skill_finalized
```

**Review notes:**

```text
docs/review/release-notes-skill-review-*.md
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
git checkout -b feat/release-notes-skill
```

Commit this plan first:

```bash
git add docs/plans/2026-07-18_release-notes-skill.md
git commit -m "docs(plan): add release-notes-skill implementation plan"
```

---

## Implementation Tasks

**Precondition check (do first).** Confirm the dependency is present:
`test -f scripts/changelog.py && test -f CHANGELOG.md`. If either is missing, stop
and report that `changelog-release-gate` must be finalized to `dev` first — do not
build the gate here.

Write the installer/skill tests before or alongside the code (TDD where testable;
the SKILL.md body is prose, so its "tests" are structural assertions).

### 1. Create the skill: `skills/decky-release-notes/SKILL.md`

Frontmatter — **exactly two keys** `name` and `description` (the structural test
enforces `set(metadata) == {"name","description"}`; do not add others):

```markdown
---
name: decky-release-notes
description: Draft and maintain this repo's CHANGELOG release notes and prepare a stable release cut. Use when asked to write or refresh release notes / the changelog Unreleased section, summarize commits since the last release, or cut/prepare a stable release for Decky-Metadata. Produces notes that satisfy the scripts/changelog.py gate; it never pushes, tags, or promotes.
---
```

Body — direct, safe instructions. It **must** contain these literal command strings
(the structural test asserts them, and they keep the skill wired to the real tools):
`scripts/version_guard.py highest`, `git log --no-merges`, `scripts/changelog.py check`,
`scripts/changelog.py extract`, and `scripts/release.sh`. Structure the body as:

1. **Preamble / boundaries** — one short section stating the skill *authors* notes and
   *prepares* a cut but **never** runs `scripts/release.sh`, never tags, never pushes,
   and never performs the `dev → main` promotion; those remain human-gated per
   `AGENTS.md` §7. Include the literal phrases the safety test will check (see task 3):
   `never push`, `dev → main`, and `does not run scripts/release.sh`.
2. **Mode A — Draft/refresh `[Unreleased]`:**
   - `base="$(scripts/version_guard.py highest)"` (e.g. `v0.3.1`); if empty, use the
     repo's first commit.
   - `git log --no-merges "$base"..HEAD --format='%s'` and group by Conventional-Commit
     type (feat / fix / refactor / perf / docs / ci / chore); drop pure
     changelog/session-log housekeeping subjects.
   - Rewrite the `## [Unreleased]` body in `CHANGELOG.md` as: a **leading non-bullet
     summary line** (≤ ~72 chars, imperative, no trailing period needed) + a blank
     line + grouped `- ` bullets. Leave every other section byte-for-byte unchanged.
   - Verify: `scripts/changelog.py check --unreleased` must exit 0. Show the diff and
     stop for human review; commit only when the user asks, on the working branch
     (never direct-to-`dev`), Conventional message e.g.
     `docs(changelog): refresh Unreleased notes`.
3. **Mode B — Prepare a release cut `X.Y.Z`:**
   - Preconditions: on `dev`, clean tree, `X.Y.Z` is a valid stable SemVer and ahead
     of `scripts/version_guard.py highest`.
   - Optionally run Mode A first so `[Unreleased]` is current.
   - Edit `CHANGELOG.md`: **rename** the `## [Unreleased]` header to
     `## [X.Y.Z] - <today's date, YYYY-MM-DD>` (do **not** create a second `[X.Y.Z]`),
     ensure its body leads with a non-bullet summary line, and insert a fresh empty
     `## [Unreleased]` header above it.
   - Verify: `scripts/changelog.py check X.Y.Z` must exit 0.
   - **Hand off (do not execute):** tell the human to commit the changelog on `dev`,
     then follow `AGENTS.md` §7 — merge `dev → main --no-ff` and run
     `scripts/release.sh X.Y.Z` on clean `main`, which re-checks the gate and prints
     the push commands. The skill stops here.
4. A closing line noting the deterministic counterpart: the `scripts/changelog.py`
   gate (CI + `release.sh`) is what *enforces* these notes; this skill only helps
   produce them.

### 2. Create `skills/decky-release-notes/agents/openai.yaml`

Mirror `skills/decky-project-workflow/agents/openai.yaml`:

```yaml
interface:
  display_name: "Decky Release Notes"
  short_description: "Draft changelog notes and prepare a stable release cut"
  default_prompt: "Use $decky-release-notes to draft the CHANGELOG Unreleased notes or prepare a stable release cut for Decky-Metadata."
```

### 3. `tests/test_decky_release_notes_skill.py` (new)

Mirror `tests/test_decky_project_skill.py`. Point `SKILL` at
`skills/decky-release-notes/SKILL.md`. Assert:
- frontmatter splits on `---` and `set(metadata) == {"name", "description"}`;
- the description mentions the trigger words `release notes`, `changelog`, and `cut`
  (case-insensitive);
- the body contains each required command string from task 1
  (`scripts/version_guard.py highest`, `git log --no-merges`,
  `scripts/changelog.py check`, `scripts/changelog.py extract`, `scripts/release.sh`);
- the safety boundaries are present: `never push`, `dev → main`, and
  `does not run scripts/release.sh`.

### 4. Generalize `scripts/install_project_skill.sh` (back-compatible)

Today `source_path` and the default `--dest` basename are hardcoded to
`decky-project-workflow`. Add skill selection **without breaking** the existing CLI
or `tests/test_install_project_skill.py`:
- Accept an optional `--skill NAME` (and/or a positional NAME) that **defaults to
  `decky-project-workflow`**. Validate NAME against the directories that exist under
  `skills/` (reject unknown names with a clear message + `exit 2`), and reject a NAME
  containing `/` or `..`.
- Derive `source_path="$repo_root/skills/$skill"` and, when `--dest` is omitted, the
  destination basename from `$skill` (so `decky-release-notes` installs to
  `.../skills/decky-release-notes`). Keep every existing behavior: `--install`
  vs dry-run, `--agent claude|codex` default dirs, `--dest` override, the
  external-worktree guard + `--allow-external-worktree`, symlink idempotency, and the
  conflict `exit 1`.

### 5. Extend `tests/test_install_project_skill.py`

Keep the existing cases green (they exercise the default skill). Add cases:
- installing `--skill decky-release-notes` symlinks to
  `skills/decky-release-notes` (dry-run shows that `source`, `--install` creates the
  symlink);
- omitting `--skill` still targets `decky-project-workflow` (back-compat);
- an unknown `--skill nope` exits non-zero with an error and creates nothing;
- a `--skill ../evil` (path traversal) is rejected.

### 6. Docs

- `AGENTS.md`: in the skills area of §8 (or wherever `decky-project-workflow` is
  introduced), add one line naming `decky-release-notes` and pointing to the
  `CHANGELOG.md` release-notes lifecycle documented by the gate feature.
- Record a session summary under `docs/agent_conversations/` per AGENTS.md §9.

Keep commits atomic and Conventional (e.g. `feat(skill): add decky-release-notes`,
`feat(tooling): select skill in install_project_skill.sh`,
`test(skill): cover release-notes skill and installer selection`).

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

Run from the repo root with `set -euo pipefail`; a `must_fail` helper makes negative
checks self-failing (a bare `! cmd` is exempt from errexit).

```bash
set -euo pipefail
must_fail() { if "$@"; then echo "FAIL: unexpectedly succeeded: $*" >&2; exit 1; fi; }

# 0. Dependency present (this plan builds ON changelog-release-gate).
test -f scripts/changelog.py && test -f CHANGELOG.md && echo "dependency present"

# 1. Skill files exist with the exact structure the tests require.
test -f skills/decky-release-notes/SKILL.md
test -f skills/decky-release-notes/agents/openai.yaml
python3 - <<'PY'
text = open("skills/decky-release-notes/SKILL.md").read()
_, raw, body = text.split("---", 2)
meta = {k.strip(): v.strip() for k, v in (l.split(":", 1) for l in raw.strip().splitlines())}
assert set(meta) == {"name", "description"}, meta
assert meta["name"] == "decky-release-notes"
for kw in ("release notes", "changelog", "cut"):
    assert kw in meta["description"].lower(), kw
for cmd in ("scripts/version_guard.py highest", "git log --no-merges",
            "scripts/changelog.py check", "scripts/changelog.py extract", "scripts/release.sh"):
    assert cmd in body, cmd
for guard in ("never push", "dev → main", "does not run scripts/release.sh"):
    assert guard in body, guard
print("SKILL.md structure OK")
PY

# 2. New + existing skill/installer tests pass (repo cache wrapper + ephemeral uv).
./run.sh uv run --with pytest -- pytest -q \
  tests/test_decky_release_notes_skill.py \
  tests/test_install_project_skill.py \
  tests/test_decky_project_skill.py

# 3. Installer selects the new skill AND stays back-compatible. Use temp dests.
d1="$(mktemp -d)/decky-release-notes"; d2="$(mktemp -d)/decky-project-workflow"
scripts/install_project_skill.sh --skill decky-release-notes --dest "$d1" | grep -q 'decky-release-notes' && echo "new-skill dry-run OK"
scripts/install_project_skill.sh --dest "$d2" | grep -q 'decky-project-workflow' && echo "default back-compat OK"
must_fail scripts/install_project_skill.sh --skill nope --dest "$(mktemp -d)/nope"          # unknown skill rejected
must_fail scripts/install_project_skill.sh --skill ../evil --dest "$(mktemp -d)/evil"        # path traversal rejected
scripts/install_project_skill.sh --skill decky-release-notes --dest "$d1" --install && test -L "$d1" && echo "install symlink OK"

# 4. The skill's own workflow is exercisable end-to-end against changelog.py on a
#    throwaway fixture (proves the draft + cut steps produce gate-passing output).
work="$(mktemp -d)"; cp CHANGELOG.md "$work/CHANGELOG.md"
# Draft-mode shape: an Unreleased section with a summary line + bullet passes --unreleased.
printf '# Changelog\n\n## [Unreleased]\nRefine metadata editor and harden releases.\n\n- feat: x\n\n## [0.3.1] - 2026-07-01\nPrev.\n' > "$work/CHANGELOG.md"
python3 scripts/changelog.py --file "$work/CHANGELOG.md" check --unreleased && echo "draft-shape passes gate"
# Cut-mode shape: after the rename, check X.Y.Z passes and no duplicate is created.
printf '# Changelog\n\n## [Unreleased]\n\n## [0.3.2] - 2026-07-18\nRefine metadata editor and harden releases.\n\n- feat: x\n\n## [0.3.1] - 2026-07-01\nPrev.\n' > "$work/CHANGELOG.md"
python3 scripts/changelog.py --file "$work/CHANGELOG.md" check 0.3.2 && echo "cut-shape passes gate"
python3 scripts/changelog.py --file "$work/CHANGELOG.md" title 0.3.2 | grep -Eq '^v0\.3\.2 — .+$' && echo "cut title enriches"

# 5. Full project quality gate stays green; only this plan's files changed.
scripts/orchestration/run-quality-gates
git status --short
```

**Deferred verification (state in the session log; do NOT attempt here):** actually
*invoking* the skill as an interactive Claude/codex slash command, and running a real
`dev → main` cut through `scripts/release.sh`, require a human-driven session and the
real release flow — out of scope for the implementer. The checks above prove the
skill's files, structure, installer wiring, and that the shapes it is instructed to
produce satisfy `scripts/changelog.py`; the live invocation is confirmed the next
time a release is prepared. Do not push, tag, or run `scripts/release.sh` from this
plan.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished release-notes-skill
```

This writes:

```text
/tmp/Decky-Metadata/release-notes-skill_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer release-notes-skill`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/release-notes-skill-review-*.md
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
   scripts/orchestration/clear-finished release-notes-skill
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
   git add docs/review/release-notes-skill-review-*.md
   git commit -m "docs(review): record release-notes-skill review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished release-notes-skill
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer release-notes-skill` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed release-notes-skill
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize release-notes-skill
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/release-notes-skill_finalized
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
scripts/orchestration/finalize release-notes-skill
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/release-notes-skill_finished
/tmp/Decky-Metadata/release-notes-skill_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
