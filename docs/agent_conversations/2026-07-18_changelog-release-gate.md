# Changelog release gate

## Date

2026-07-18

## Objective

Implement the existing `changelog-release-gate` plan so stable and manual
development releases publish curated notes from `CHANGELOG.md`, while preserving
the ungated rolling development prerelease used by the on-device sideload loop.

## Files modified

- `CHANGELOG.md`: seeded substantive `Unreleased` notes and dated historical
  sections for `v0.1.0` through `v0.3.1` from verified tag history.
- `scripts/changelog.py`: added the standard-library parser, validator,
  extractor, and enriched-title CLI.
- `tests/test_changelog.py`: added parser, classifier, date, SemVer, duplicate,
  extraction, title, and CLI coverage.
- `scripts/release.sh`: added the stable changelog preflight, made the metadata
  commit conditional, and moved packaging before the final tag mutation.
- `.github/workflows/release.yml`: exported the stable version and replaced
  generated notes with checked/extracted changelog notes and an enriched title.
- `.github/workflows/dev-release.yml`: validated and prepared `Unreleased` notes
  before pushing a development tag, then published with `--notes-file`.
- `AGENTS.md`: documented changelog requirements and the release rollover.

No files under `src/`, `backend/`, `main.py`, or `dist/` were intentionally
changed, so no on-device verification was required.

## Design decisions

- All subcommands share bracket-key duplicate detection and section extraction,
  so a malformed duplicate header cannot make `check`, `extract`, and `title`
  disagree.
- The notes classifier is the plan-specified heuristic against accidental empty
  or placeholder notes, not a complete CommonMark parser or security boundary.
- Stable sections require a real ISO date and a leading non-bullet summary;
  `Unreleased` intentionally requires only substantive content.
- A stable changelog section must already reach clean `main` through the
  `dev` → `main` merge. `scripts/release.sh` checks that section but never creates
  or edits it.
- Packaging now precedes tagging, so a package failure leaves no tag behind and
  the release can be retried. If metadata is already at the release version, the
  script skips the no-op commit and tags the current `HEAD`.
- Right after a stable cut, the fresh `Unreleased` section is empty and the
  manual dev-release workflow intentionally refuses to publish until new notes
  exist.

## Validation

- Confirmed the required TDD red state before adding `scripts/changelog.py`.
- `./run.sh uv run --with pytest -- pytest -q tests/test_changelog.py`: PASS
  (52 tests).
- Parsed both edited workflows with PyYAML and asserted exact step contents and
  package → validate → tag → publish ordering: PASS.
- Checked `scripts/release.sh` syntax and asserted changelog check → quality gate
  → version setter → package → tag ordering, exactly one tag command, and the
  no-op commit guard: PASS.
- Ran the stable and manual-dev publish command shapes with a stubbed `gh` and
  `/tmp/Decky-Metadata` note files; both populated `--notes-file` inputs and the
  stable title was enriched: PASS.
- `scripts/orchestration/run-quality-gates`: PASS.
- `scripts/orchestration/check-review-notes-not-deleted`: PASS.
- `git diff --check`: PASS.

GitHub-hosted `gh release create` with real credentials and a real tag/manual
dispatch is deferred to the next actual release. This implementation did not
push tags or dispatch workflows.
