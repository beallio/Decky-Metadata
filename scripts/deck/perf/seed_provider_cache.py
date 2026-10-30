#!/usr/bin/env python3
"""Write a synthetic provider_cache.json for performance tests.

Every entry is valid for the backend loader. Copy the output to the plugin
settings directory (for example
/home/deck/homebrew/settings/Decky-Metadata/provider_cache.json) while the
plugin is stopped, then restart the Loader.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

TIERS = ("platinum", "gold", "silver", "bronze", "borked", None)
DAY_MS = 86_400_000


def build(entries: int, expired: bool, now_ms: int) -> dict:
    stamp = now_ms - (15 * DAY_MS if expired else 60_000)
    ratings = {str(index + 1): {"tier": TIERS[index % len(TIERS)], "updated_at": stamp} for index in range(entries)}
    name_ids = {
        str(0x80000000 + index): {"name": f"Perf Game {index}", "steam_appid": index + 1, "resolved_at": stamp}
        for index in range(entries)
    }
    hltb = {
        str(index + 1): {
            "status": "matched",
            "hltb_id": index + 1,
            "game_name": f"Perf Game {index}",
            "stats": {"main": 3600, "plus": 7200, "complete": 10800, "all": 5400},
            "steam_appid_used": index + 1,
            "title_used": f"Perf Game {index}",
            "pinned_id_used": None,
            "fetched_at": stamp,
        }
        for index in range(entries)
    }
    return {"version": 1, "protondb": {"ratings": ratings, "name_ids": name_ids}, "hltb": {"entries": hltb}}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--entries", type=int, default=2000, help="entries per section (max 20000)")
    parser.add_argument("--expired", action="store_true", help="timestamps 15 days old instead of fresh")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    if not 0 <= args.entries <= 20_000:
        parser.error("--entries must be between 0 and 20000")
    data = build(args.entries, args.expired, int(time.time() * 1000))
    args.output.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"{args.output} {args.output.stat().st_size} bytes, {args.entries} entries per section")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
