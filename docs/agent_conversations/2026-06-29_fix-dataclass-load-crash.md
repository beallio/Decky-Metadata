# 2026-06-29 Fix Dataclass Load Crash

## Task Objective

Implement `docs/plans/2026-06-29_fix-dataclass-load-crash.md`: make `main.py`
importable when Decky's loader executes the plugin module without registering
the module name in `sys.modules`.

## Files Modified

- `main.py`
- `tests/test_import_sandbox.py`
- `docs/agent_conversations/2026-06-29_fix-dataclass-load-crash.md`

## Design Decisions

- Converted `SteamInstall` from a frozen dataclass to a plain class with the
  same constructor fields and attribute names.
- Kept `from __future__ import annotations` unchanged.
- Removed the now-unused `dataclass` import after confirming no other
  `dataclass` references remained in `main.py`.
- Added a regression test that compiles and executes `main.py` under a module
  name absent from `sys.modules`, with a lightweight `decky` stub.

## Validation Results

- Baseline before implementation:
  `scripts/orchestration/run-quality-gates` passed.
- Red test:
  `./run.sh uv run --with pytest -- pytest -q tests/test_import_sandbox.py`
  failed before the fix with
  `AttributeError: 'NoneType' object has no attribute '__dict__'` from
  `dataclasses._is_type`. Captured at
  `/tmp/Playhub-Metadata-local/import_sandbox_red.log`.
- Green test:
  `./run.sh uv run --with pytest -- pytest -q tests/test_import_sandbox.py`
  passed after converting `SteamInstall` to a plain class.
- Direct sandbox sanity check:
  `./run.sh python3 - <<'PY' ... PY` printed
  `import OK; SteamInstall.root = /x`.
- Full quality gate:
  `scripts/orchestration/run-quality-gates` passed with 43 pytest tests.

## Deferred Verification

Hardware verification is still required after merge/release: rebuild and sideload
the plugin on a real Steam Deck, then confirm the backend reaches startup/ready
logging and the UI controls are live.
