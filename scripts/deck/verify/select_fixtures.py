#!/usr/bin/env python3
"""Select stable semantic Deck verification fixtures from metadata JSON."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROLES = ("listed_match", "delisted_match", "never_on_steam")


def classify(appid: str, entry: dict[str, object]) -> str | None:
    steam = entry.get("steam_appid")
    state = str(entry.get("steam_store_state") or entry.get("store_state") or "").lower()
    if not steam:
        return "never_on_steam"
    if state in {"delisted", "unavailable", "removed"} or entry.get("delisted") is True:
        return "delisted_match"
    return "listed_match"


def select(data: object, overrides: dict[str, str] | None = None) -> dict[str, object]:
    if not isinstance(data, dict): raise ValueError("metadata root must be an object")
    metadata = data.get("metadata", data)
    if not isinstance(metadata, dict): raise ValueError("metadata must be an object")
    candidates: dict[str, list[dict[str, object]]] = {role: [] for role in ROLES}
    by_id: dict[str, dict[str, object]] = {}
    for appid, raw in metadata.items():
        if not isinstance(raw, dict): continue
        role = classify(str(appid), raw)
        if not role: continue
        item = {"appid": str(appid), "title": str(raw.get("title") or raw.get("name") or ""), "steam_appid": str(raw.get("steam_appid") or ""), "store_state": str(raw.get("steam_store_state") or raw.get("store_state") or "unknown"), "reason": f"stable {role} candidate"}
        candidates[role].append(item); by_id[str(appid)] = item
    for values in candidates.values(): values.sort(key=lambda item: (item["title"].casefold(), int(item["appid"]) if item["appid"].isdigit() else item["appid"]))
    overrides = overrides or {}
    selected: dict[str, object] = {}
    for role in ROLES:
        explicit = overrides.get(role)
        if explicit:
            if explicit not in by_id or classify(explicit, metadata[explicit]) != role: raise ValueError(f"override for {role} is not a valid candidate: {explicit}")
            selected[role] = {**by_id[explicit], "reason": f"explicit {role} override"}
        else: selected[role] = candidates[role][0] if candidates[role] else None
    return {"schema_version": 1, "fixtures": selected}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path)
    for role in ROLES: parser.add_argument(f"--{role.replace('_', '-')}")
    args = parser.parse_args()
    try:
        data = json.load(args.source.open() if args.source else sys.stdin)
        overrides = {role: getattr(args, role) or os.environ.get(f"DECKY_FIXTURE_{role.upper()}") for role in ROLES}
        print(json.dumps(select(data, {key: value for key, value in overrides.items() if value}), sort_keys=True, separators=(",", ":")))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"select-fixtures: {error}", file=sys.stderr); return 1


if __name__ == "__main__": raise SystemExit(main())
