# Autonomous release-cut mode

**Date:** 2026-07-18

## Objective

Implement the existing `autonomous-release-cut` plan: add a deterministic
changelog rollover command and upgrade `decky-release-notes` Mode B to perform
the full local stable-release cut while retaining an explicit push gate.

## Files modified

- `docs/plans/2026-07-18_autonomous-release-cut.md`: committed the supplied plan
  as the implementation branch's first commit.
- `scripts/changelog.py`: added the `rollover X.Y.Z` subcommand.
- `tests/test_changelog.py`: added rollover success, refusal, newline, date, and
  idempotency coverage.
- `skills/decky-release-notes/SKILL.md`: changed Mode B from a handoff to an
  autonomous local cut with an explicit publish opt-in.
- `tests/test_decky_release_notes_skill.py`: updated the skill's structural and
  safety-boundary assertions.
- `AGENTS.md`: documented the new Mode B behavior in the release and
  orchestration contracts.

No files under `src/`, `backend/`, `main.py`, or `dist/` were intentionally
changed, so on-device verification was not required.

## Design decisions

- Reused the existing strict stable-version parser, changelog section parser,
  substantive-line classifier, stable check path, and title renderer instead of
  creating rollover-specific variants.
- Used `scripts/version_guard.py`'s tag reader and stable-version comparison to
  require the requested version to be strictly ahead of the highest stable tag.
- Kept rollover mutation fail-closed: every precondition runs before the write,
  the targeted header edit preserves existing newline bytes and untouched
  sections, and a failed post-write stable check restores the original bytes.
- Preserved Mode A verbatim. Mode B now treats invocation as authorization for
  local changelog, merge, tag, package, and version-commit work, but never pushes
  by default. Only an explicit instruction for the current invocation authorizes
  publishing.

## Validation results

- Confirmed the TDD red state before implementing `rollover` and before updating
  the release-notes skill.
- `./run.sh uv run --with pytest -- pytest -q tests/test_changelog.py`: PASS (64
  tests).
- Combined changelog and release-notes skill tests: PASS (66 tests).
- Direct `python3 scripts/changelog.py --help` execution: PASS, including the new
  `rollover` subcommand.
- The plan's fixture/refusal verification and the full project quality gate:
  PASS.
- Review-note deletion/commit integrity checks and `git diff --check`: PASS.

## Deferred verification

Actually invoking Mode B end to end remains a real, human-driven release check.
This implementation did not merge `dev` to `main`, run `scripts/release.sh`, tag,
push, publish, or bump the live development version.
