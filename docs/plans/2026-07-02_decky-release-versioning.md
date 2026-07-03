# Plan: Local release-version automation (version guard + set-release-version + drift gate) (decky-release-versioning)

## Context

Decky Metadata (Decky plugin: TS/React `src/*` → `dist/index.js`, Python `main.py`, packaged by
`scripts/package.mjs`) has no release-version discipline: the base `version` in `package.json` /
`plugin.json` has stayed `0.1.0` across many changes, and nothing stops shipping a stale or
duplicate version. The reference plugin `beallio/SDH-Ludusavi` solves this with a small
stdlib-only toolset. This plan **ports that toolset locally** so releasing is one command and a
stale version fails the quality gate.

### Source to port (read these — they are the design of record)

Local checkout at `/home/beallio/Dropbox/Scripts/SDH-ludusavi/scripts/`:

- `version_guard.py` — `parse_semver`, `next_patch_version`, `highest_stable_version`,
  `is_base_ahead_of_stable` (strict: base must be **>** highest stable tag), `is_version_behind_stable`
  (soft drift: base **<** highest stable tag; equality is OK). Reads git tags. CLI: `check-base`,
  `next-patch`.
- `set_release_version.py` — validates a stable `X.Y.Z` and writes it into `plugin.json` +
  `package.json`.

Port these into `scripts/`, adapting paths/names to this repo, keeping them **stdlib-only** and
**project-agnostic** (logic functions take an explicit `tags` iterable so they are unit-testable
without touching real git tags).

### Prerequisite already done (do NOT redo)

The stale upstream `1.4.0` git tag has already been deleted (it predated the `0.1.x` rebrand and
was not on `origin`). The repo now has **no stable tags**, so the drift guard passes for `0.1.0`.
Do not create or delete tags in this plan.

### Intended outcome

1. `scripts/version_guard.py` (ported) with a CLI usable by the gate and by release commands.
2. `scripts/set_release_version.py <X.Y.Z>` to bump both metadata files together.
3. The **soft drift guard wired into the quality gate** (`scripts/orchestration-hooks/quality-gates`)
   so a base version that is *behind* the highest stable tag fails the gate — making "forgot to
   bump after a release" impossible. It must **pass when there are no tags or git is unavailable**.
4. A small post-release "bump to next patch" helper + a documented one-command release flow.

### Relevant files

`scripts/version_guard.py` (new), `scripts/set_release_version.py` (new),
`scripts/orchestration-hooks/quality-gates` (add the guard), `scripts/bump_next_patch.sh` (new
helper), `tests/` (pytest for both scripts), `README.md` / `AGENTS.md` (release flow),
`docs/agent_conversations/`.

**Out of scope:** GitHub Actions CI (`release.yml`/`dev-release.yml` — local only here), the
per-commit `package.mjs` hash behavior (already shipped), bumping the base version itself, and
creating git tags. Do not modify `main.py` or `src/`.

**Slug used throughout this plan:** `decky-release-versioning`

---

## Orchestration Contract

**Slug:** `decky-release-versioning`

**Plan file:**

```text
docs/plans/2026-07-02_decky-release-versioning.md
```

**Implementation branch:**

```text
feat/decky-release-versioning
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-release-versioning_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-release-versioning_finalized
```

**Review notes:**

```text
docs/review/decky-release-versioning-review-*.md
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
git checkout -b feat/decky-release-versioning
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-release-versioning.md
git commit -m "docs(plan): add decky-release-versioning implementation plan"
```

---

## Implementation Tasks

Work in order. Follow TDD (these are pure Python — pytest is in the gate). Read the fork source
files named in Context before writing. Keep everything **stdlib-only**.

### Task 1 — Port `scripts/version_guard.py` (+ pytest)

Port from `/home/beallio/Dropbox/Scripts/SDH-ludusavi/scripts/version_guard.py`, adapting to this
repo. Keep these pure functions (they must accept an explicit `tags` iterable, not read git
themselves — so they are unit-testable):

- `parse_semver(text) -> (int,int,int)` (strips a leading `v`; rejects non-`X.Y.Z`).
- `next_patch_version(version) -> str`.
- `highest_stable_version(tags) -> tuple|None`.
- `is_base_ahead_of_stable(base, tags) -> bool` (base **>** highest; `True` when no stable tags).
- `is_version_behind_stable(version, tags) -> bool` (version **<** highest; `False` when no stable
  tags; equality is **not** behind).

Add a thin CLI `main()` that reads **real** git tags via `subprocess` (`git tag -l`), tolerating
absence (no git / no tags → empty list), and dispatches:

- `check-drift <version>` → exit **1** iff `is_version_behind_stable(version, tags)` (print a clear
  message naming the offending tag and telling the dev to bump); exit **0** otherwise. **This is
  what the gate calls.**
- `check-base <version>` → exit 1 unless `is_base_ahead_of_stable` (strict; for release-time use).
- `next-patch <version>` → print `next_patch_version`.
- `highest` → print the highest stable tag (or nothing).

Critical: the tool must **never crash the gate** — any git failure, missing git, or no tags must
result in `check-drift` exiting **0**.

Add `tests/test_version_guard.py` (pytest): cover `parse_semver` (valid/`v`-prefixed/invalid),
`next_patch_version`, `highest_stable_version`, `is_base_ahead_of_stable` and
`is_version_behind_stable` with injected tag lists (including the empty-list → pass cases and the
equality → not-behind case). Do **not** depend on the repo's real tags.

### Task 2 — Port `scripts/set_release_version.py` (+ pytest)

Port from the fork's `set_release_version.py`. It takes a positional `X.Y.Z` (+ optional
`--project-root`, default cwd), validates it is stable semver, and writes `version` into
**both** `plugin.json` and `package.json` (preserve 2-space indent + trailing newline, matching
the existing files). Exit non-zero with a clear message on invalid version or missing files.

Add `tests/test_set_release_version.py`: run it against a **temp project root** containing minimal
`plugin.json`/`package.json`, assert both files' `version` updated and JSON otherwise intact;
assert a bad version string exits non-zero and leaves files unchanged.

### Task 3 — Wire the soft drift guard into the quality gate

In `scripts/orchestration-hooks/quality-gates`, after the existing frontend + backend checks,
add a step that reads the base version from `package.json` and runs
`python3 scripts/version_guard.py check-drift "<base>"`, failing the gate (non-zero) if it
reports drift. Because there are currently no tags, this **passes today**; it only bites after a
release tag exists and the base wasn't bumped. Keep it stdlib `python3` (no uv needed). Print the
guard's message on failure so the fix ("bump with scripts/set_release_version.py") is obvious.
Do not duplicate this into `check_tdd.sh` (keep the pre-commit hook light).

### Task 4 — Post-release bump helper + documented release flow

- Add `scripts/bump_next_patch.sh`: resolves the highest stable tag, computes
  `version_guard.py next-patch`, and calls `set_release_version.py` to set the base to that next
  patch (so `dev` moves ahead after a release). If there are no tags, print a note and no-op.
- Document the local release flow in `README.md` (and/or `AGENTS.md` §7 near the existing
  "cutting a release tag" note):

  ```bash
  scripts/set_release_version.py 0.1.1        # bump plugin.json + package.json
  git commit -am "release: v0.1.1"
  git tag v0.1.1
  node scripts/package.mjs --release          # hash-free Decky-Metadata_0.1.1_Installer.zip
  scripts/bump_next_patch.sh                  # dev -> 0.1.2 so the drift guard stays green
  ```

### Task 5 — Session log

Record `docs/agent_conversations/2026-07-02_decky-release-versioning.md`: the ported tools, the
gate wiring (soft `check-drift`, passes with no tags / no git), the release flow, and the fact
that the stale `1.4.0` tag was already removed as a prerequisite.

### Scope discipline

Release tooling only. Do NOT: modify `main.py` or `src/`, create/delete git tags, bump the base
version, add CI workflows, or change `package.mjs`'s hash behavior. The drift guard must be
fail-safe (git/tag absence → pass).

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

Automated (run via `./run.sh`):

```bash
./run.sh uv run --with pytest -- pytest -q       # full suite incl. new version tests
./run.sh python3 -m py_compile scripts/version_guard.py scripts/set_release_version.py
scripts/orchestration/run-quality-gates          # now includes the drift guard; must PASS (no tags)
git status --short                               # clean
```

Guard + tooling behaviour (manual sanity):

```bash
# No tags today -> drift guard passes:
python3 scripts/version_guard.py check-drift 0.1.0 ; echo "exit=$? (expect 0)"
python3 scripts/version_guard.py next-patch 0.1.0 ; echo "-> expect 0.1.1"
# Prove it WOULD fail if behind (temporary throwaway tag, then delete):
git tag v0.2.0 && python3 scripts/version_guard.py check-drift 0.1.0 ; echo "exit=$? (expect 1)" ; git tag -d v0.2.0
# set-release-version writes both files (inspect, do not commit the bump):
python3 scripts/set_release_version.py 0.1.1 && grep '"version"' package.json plugin.json
git checkout -- package.json plugin.json         # revert the sanity bump
```

Grep/scope gates:

```bash
grep -nE "check-drift" scripts/orchestration-hooks/quality-gates    # guard wired into the gate
git diff --name-only dev..HEAD -- main.py src/                       # expect empty (untouched)
```

Static review:

- Task 1/2: `version_guard.py` logic functions take injected `tags` and are covered by pytest;
  the CLI is fail-safe (no git / no tags → `check-drift` exits 0); `set_release_version.py` writes
  both metadata files and validates input.
- Task 3: the gate runs `check-drift <base>` and passes with no tags; fails clearly when behind.
- Task 4: `bump_next_patch.sh` exists; README/AGENTS document the release flow.

### Deferred verification — none device-specific

This is tooling only; no on-device/Gaming-Mode step. The one human action for an actual release
is running the documented flow (set version → commit → tag → `--release` package → bump next
patch); the guard then keeps `dev` from drifting behind the tag.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-release-versioning
```

This writes:

```text
/tmp/Decky-Metadata/decky-release-versioning_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-release-versioning`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-release-versioning-review-*.md
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
   scripts/orchestration/clear-finished decky-release-versioning
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
   git add docs/review/decky-release-versioning-review-*.md
   git commit -m "docs(review): record decky-release-versioning review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-release-versioning
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-release-versioning` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-release-versioning
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-release-versioning
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-release-versioning_finalized
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
scripts/orchestration/finalize decky-release-versioning
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-release-versioning_finished
/tmp/Decky-Metadata/decky-release-versioning_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
