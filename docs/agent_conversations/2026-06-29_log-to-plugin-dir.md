# 2026-06-29 Log to Plugin Dir

## Objective

Implement `docs/plans/2026-06-29_log-to-plugin-dir.md` by persisting backend logs
to a bounded file in Decky's plugin log directory.

## Files Modified

- `main.py`
- `tests/test_log_file.py`
- `docs/agent_conversations/2026-06-29_log-to-plugin-dir.md`

## Design Decisions

- Added an idempotent `_install_file_logging()` helper with a module-level handler
  guard and an existing-handler check to avoid duplicate file handlers across
  reloads.
- Resolved the log directory through Decky's log/runtime/settings directory
  attributes and returned an empty string on setup failure so logging setup cannot
  break plugin startup.
- Installed the file handler at the start of `_main`, before the existing startup
  log line, and kept the debug logging toggle as the logger-level gate.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates`: passed before code changes.
- Red test run: `./run.sh uv run --with pytest -- pytest -q tests/test_log_file.py`
  failed because `main._install_file_logging` did not exist.
- Focused green run: `./run.sh uv run --with pytest -- pytest -q tests/test_log_file.py`
  passed.

## Deferred Hardware Verification

On a real Steam Deck, launch the plugin and confirm `playhub-metadata.log` appears
under the Decky plugin log directory, contains `[playhub:load]` and
`[playhub:shortcuts]` entries with debug logging enabled, and does not contain API
keys.
