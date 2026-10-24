#!/usr/bin/env python3
"""Run the native community fallback converter against the on-device metadata store.

  scripts/deck/repro_backend.py <appid> [--page N] [--store PATH] [--host HOST]

Without --store, fetches the store from the Deck over ssh (host = --host or
DECKY_DECK_HOST, default steamdeck).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.endpoint_health import DiagnosticsError, redact, run_diagnostics

SETTINGS_DIR = "/home/deck/homebrew/settings/Decky-Metadata"
READ_STORE = Path(__file__).with_name("read_store.py")


def _error(message: str) -> int:
    print(f"community fallback failed: {redact(message)}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("appid")
    parser.add_argument("--page", type=int, default=None,
                        help="single page; default shows pages 1 and 2")
    parser.add_argument("--store", help="local metadata store JSON (skip the ssh fetch)")
    parser.add_argument("--host", default=os.environ.get("DECKY_DECK_HOST", "steamdeck"))
    args = parser.parse_args()

    try:
        if args.store:
            raw = Path(args.store).read_text(encoding="utf-8")
        else:
            result = subprocess.run(
                ["ssh", args.host, f"python3 - {SETTINGS_DIR}"],
                input=READ_STORE.read_text(encoding="utf-8"),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="strict",
                check=True,
            )
            raw = result.stdout
    except (OSError, UnicodeError, subprocess.SubprocessError) as error:
        return _error(f"could not read metadata store ({type(error).__name__})")

    command = ["--appid", args.appid]
    if args.page is not None:
        command.extend(("--page", str(args.page)))
    command.extend(("--input", "-"))
    try:
        process = run_diagnostics("community-fallback", *command, input_text=raw)
    except DiagnosticsError as error:
        return _error(str(error))
    if process.returncode != 0:
        return _error(process.stderr.strip() or f"backend-diagnostics exited with status {process.returncode}")
    try:
        report = json.loads(process.stdout)
    except (ValueError, UnicodeError):
        return _error("backend-diagnostics returned malformed JSON")
    if (not isinstance(report, dict) or not isinstance(report.get("app"), dict)
            or not isinstance(report.get("pages"), list)):
        return _error("backend-diagnostics returned an invalid community result")
    app = report["app"]
    if not all(key in app for key in ("appid", "title", "source", "steam_appid", "screenshot_count", "source_url")):
        return _error("backend-diagnostics returned an invalid app result")
    if not all(isinstance(page, dict) and type(page.get("page")) is int
               and isinstance(page.get("items"), list) for page in report["pages"]):
        return _error("backend-diagnostics returned invalid community pages")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
