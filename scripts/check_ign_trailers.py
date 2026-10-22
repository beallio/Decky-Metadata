#!/usr/bin/env python3
"""Check that IGN game lookup, trailer selection, and direct MP4 delivery still work."""
from __future__ import annotations

import json
import sys
from pathlib import Path

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.endpoint_health import DiagnosticsError, redact, run_diagnostics


def _failure(message: str) -> int:
    print(f"IGN trailer capability check failed: {redact(message)}", file=sys.stderr)
    return 1


def main() -> int:
    try:
        process = run_diagnostics("ign-trailers")
    except DiagnosticsError as error:
        return _failure(str(error))
    try:
        result = json.loads(process.stdout)
    except (ValueError, UnicodeError):
        return _failure("backend-diagnostics returned malformed trailer results")
    if (not isinstance(result, dict) or "error" not in result
            or not isinstance(result.get("checked"), list)
            or not all(isinstance(item, str) for item in result["checked"])):
        return _failure("backend-diagnostics returned malformed trailer results")
    checked = result["checked"]
    error = result["error"]
    if (process.returncode == 1 and isinstance(error, dict)
            and isinstance(error.get("type"), str) and isinstance(error.get("message"), str)):
        return _failure(error["message"])
    expected = ("Deadpool: ", "Bloodborne: ")
    if (process.returncode != 0 or error is not None or len(checked) != len(expected)
            or any(not item.startswith(prefix) or not item[len(prefix):].strip()
                   for item, prefix in zip(checked, expected))):
        return _failure(f"backend-diagnostics returned an inconsistent result (exit {process.returncode})")
    for item in checked:
        print(f"OK: {redact(item)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
