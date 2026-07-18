# Release-notes skill implementation

**Date:** 2026-07-18

## Objective

Implement the existing `release-notes-skill` plan: add an assistive project skill
for drafting `CHANGELOG.md` notes and preparing a stable release cut, while
preserving the human gates around promotion, publishing, tags, and pushes.

## Files modified

- Added `skills/decky-release-notes/SKILL.md` and its `agents/openai.yaml`
  interface.
- Added `tests/test_decky_release_notes_skill.py`.
- Generalized `scripts/install_project_skill.sh` and extended
  `tests/test_install_project_skill.py`.
- Documented the companion skill in `AGENTS.md`.

## Design decisions

- Kept the skill assistive: it authors and verifies notes but does not run the
  release script or perform release mutations.
- Preserved `decky-project-workflow` as the installer's default, with explicit
  `--skill NAME` selection for additional repository skills.
- Validated the selected skill against local `skills/` directories and rejected
  slash or `..` traversal before resolving a source or destination.
- Left runtime, frontend, backend, changelog-gate, and release-script behavior
  unchanged.

## Validation results

- Baseline and implementation-round project quality gates passed.
- Release-notes structural and installer tests passed, including the existing
  project-skill and installer cases.
- Manual installer verification passed for the new skill, the default skill,
  installation, unknown-skill rejection, and path-traversal rejection.
- Throwaway draft and release-cut changelog fixtures passed
  `scripts/changelog.py`; the release title was enriched from the summary line.

## Deferred verification

Interactive invocation of the installed skill and an actual `dev → main` release
cut remain human-driven checks. This implementation did not run
`scripts/release.sh`, promote branches, tag, push, or publish.
