# 2026-07-02 Decky Release Versioning

## Objective

Implement local release-version automation for Decky Metadata from the existing
`decky-release-versioning` plan.

## Changes

- Ported `scripts/version_guard.py` from SDH-Ludusavi with pure semver helpers,
  release-tag lookup, `check-drift`, `check-base`, `next-patch`, and `highest`.
- Added `scripts/set_release_version.py` to update `plugin.json` and
  `package.json` together with stable `X.Y.Z` validation.
- Wired `scripts/version_guard.py check-drift` into
  `scripts/orchestration-hooks/quality-gates` after the existing frontend and
  backend checks.
- Added `scripts/bump_next_patch.sh` for the post-release dev-base bump.
- Documented the local release flow in `README.md` and `AGENTS.md`.

## Design Notes

- Version helper logic accepts explicit tag iterables so pytest can exercise the
  release invariants without depending on repository tags.
- `check-drift` is intentionally soft: missing `git`, git failures, and no stable
  tags behave like an empty tag list and pass the quality gate.
- Equality with the highest stable tag is not drift; only versions lower than the
  highest stable tag fail `check-drift`.
- The stale upstream `1.4.0` tag was already removed before this plan and was not
  recreated or deleted here.

## Validation

- `./run.sh uv run --with pytest -- pytest -q`
- `./run.sh python3 -m py_compile scripts/version_guard.py scripts/set_release_version.py`
- `./run.sh python3 scripts/version_guard.py check-drift 0.1.0`
- `./run.sh python3 scripts/version_guard.py next-patch 0.1.0`
- `./run.sh scripts/bump_next_patch.sh`
- `scripts/orchestration/run-quality-gates`
- `grep -nE "check-drift" scripts/orchestration-hooks/quality-gates`
- `git diff --name-only -- main.py src/`

All completed successfully. The repository currently has no stable release tag,
so the drift guard passed for base version `0.1.0`; the bump helper no-opped.
