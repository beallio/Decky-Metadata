#!/usr/bin/env python3
"""Print the Decky Metadata store as one JSON document, whichever layout is on disk.

  python3 scripts/deck/read_store.py SETTINGS_DIR
  ssh steamdeck "python3 - SETTINGS_DIR" < scripts/deck/read_store.py

Current versions keep one metadata/<game id>.json file per record beside
decky_metadata.json, which then holds the layout key instead of "metadata".
Older versions keep every record inside decky_metadata.json.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

SETTINGS_FILE = "decky_metadata.json"
RECORDS_DIR = "metadata"
LAYOUT_KEY = "metadata_layout"


def record_key(file_name: str) -> str | None:
    """Inverse of the backend's record file name: decimal IDs, or `~` plus UTF-8 hex."""
    if not file_name.endswith(".json"):
        return None
    stem = file_name[: -len(".json")]
    if stem.startswith("~"):
        try:
            return bytes.fromhex(stem[1:]).decode("utf-8")
        except ValueError:
            return None
    return stem if stem.isascii() and stem.isdigit() else None


def read_store(directory: str) -> dict[str, Any]:
    with open(os.path.join(directory, SETTINGS_FILE), encoding="utf-8") as handle:
        store = json.load(handle)
    if store.pop(LAYOUT_KEY, None) is None:
        return store
    records_dir = os.path.join(directory, RECORDS_DIR)
    records = {}
    for name in sorted(os.listdir(records_dir)) if os.path.isdir(records_dir) else ():
        key = record_key(name)
        if key is not None:
            with open(os.path.join(records_dir, name), encoding="utf-8") as handle:
                records[key] = json.load(handle)
    store["metadata"] = records
    return store


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    json.dump(read_store(sys.argv[1]), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
