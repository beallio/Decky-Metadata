# 2026-07-03 debrand-authorship

## Task objective

Reattribute Decky Metadata fork ownership to beallio and remove stale
Playhub/Windows-packaging references from the in-scope docs, manifests, and
tooling.

## Files modified

- `plugin.json`: changed the plugin author to beallio.
- `package.json`: changed the package author to beallio and removed the
  `package:win` script.
- `NOTICE`: renamed the project reference to Decky Metadata and added the fork
  acknowledgment for Playhub Metadata, ZazaMastro, and upstream contributors.
- `README.md`: changed supported platforms to SteamOS / Steam Deck via Decky
  Loader and added the fork credit under License & Credits.
- `AGENTS.md`: updated the project platform description to SteamOS / Steam Deck
  (Steam Gaming Mode).
- `.envrc`: aligned cache paths with `/tmp/Decky-Metadata`, matching `run.sh`.
- `scripts/orchestration-hooks/finalize-release`: removed stale Playhub,
  Windows, `package-win.ps1`, and `pwsh` comments without changing executable
  behavior.
- `package-win.ps1`: removed the obsolete Windows packaging script.

## Design decisions

- Left runtime platform behavior untouched. The `main.py` Windows runtime code,
  Windows-related tests, frontend `is_windows` data field, and Steam
  `WindowStore` references are intentionally preserved for a separate future
  plan.
- Left `LICENSE` unchanged because it contains only GPL-3.0 boilerplate.
- Left archival docs and all review records unchanged:
  `docs/plans/playhub-metadata-steamos-native-spec.md`,
  `docs/specs/steamos-native-gap-analysis.md`, and `docs/review/`.
- Left `dist/` unchanged because no frontend source changed and the plan
  explicitly forbids rebuilding or restaging it.

## Validation results

- `plugin.json` and `package.json` parse as valid JSON and report
  `author: beallio`.
- `package-win.ps1` is deleted, and `package.json` no longer contains
  `package:win` or `package-win`.
- No `Windows` references remain in `README.md`, `AGENTS.md`, or
  `scripts/orchestration-hooks/finalize-release`.
- The only remaining `Playhub` references in in-scope files are the required
  fork acknowledgments in `NOTICE` and `README.md`.
- Scope guard found no changes under `src`, `main.py`, `dist`, `LICENSE`,
  `docs/review`, `docs/plans/playhub-metadata-steamos-native-spec.md`, or
  `docs/specs/steamos-native-gap-analysis.md`.
- `scripts/orchestration/run-quality-gates` passed.
- `scripts/orchestration/check-review-notes-not-deleted` passed.
