#!/usr/bin/env python3
"""Validate a RunGame trace and print the target app's 64-bit gameid."""

from __future__ import annotations

import json
import sys
from typing import Any


MAX_APPID = 0xFFFFFFFF


class LaunchCheckError(ValueError):
    """The launch trace does not prove that the target launched correctly."""


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def check_launch(dump: dict[str, Any], target_appid: int) -> str:
    """Return the target's 64-bit gameid or raise ``LaunchCheckError``."""
    running = dump.get("running")
    calls = dump.get("runGameCalls")
    if not isinstance(running, list) or not running:
        raise LaunchCheckError(
            f"nothing running after Play press (RunGame calls: {calls})"
        )

    target = next(
        (
            app
            for app in running
            if isinstance(app, dict) and _safe_int(app.get("appid")) == target_appid
        ),
        None,
    )
    if target is None:
        running_appids = [
            app.get("appid") for app in running if isinstance(app, dict)
        ]
        raise LaunchCheckError(
            f"target appid {target_appid} is not running (running appids: {running_appids})"
        )

    if isinstance(calls, list):
        for call in calls:
            if not isinstance(call, list) or not call:
                continue
            gameid = _safe_int(call[0])
            if gameid == target_appid:
                raise LaunchCheckError(
                    f"RunGame received a bare appid gameid: {call[0]} "
                    "(launch-regression signature)"
                )

    gameid = target.get("gameid")
    parsed_gameid = _safe_int(gameid)
    if parsed_gameid is None or parsed_gameid <= MAX_APPID:
        raise LaunchCheckError(
            f"target appid {target_appid} has no 64-bit running gameid: {gameid!r}"
        )
    return str(gameid)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) not in (1, 2):
        print("usage: check_launch.py <target-appid> [dump-json]", file=sys.stderr)
        return 2

    try:
        target_appid = int(args[0])
        payload = args[1] if len(args) == 2 else sys.stdin.read()
        dump = json.loads(payload)
        if not isinstance(dump, dict):
            raise LaunchCheckError("trace dump must be a JSON object")
        gameid = check_launch(dump, target_appid)
    except (json.JSONDecodeError, LaunchCheckError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    print(gameid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
