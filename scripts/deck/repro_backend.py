#!/usr/bin/env python3
"""Run the community fallback converter against the REAL on-device metadata store
using the LOCAL (working-tree) backend code — validate converter changes before a
full-plugin deploy (the dev loop's verify-change --device does NOT ship the
backend; see docs/runbooks/on-device-verification.md).

  scripts/deck/repro_backend.py <appid> [--page N] [--store PATH] [--host HOST]

With no --store, fetches the store from the Deck via ssh
(host = --host or DECKY_DECK_HOST, default steamdeck).
"""
import argparse
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, REPO)
from backend.providers import community as cp  # noqa: E402

STORE_PATH = "/home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("appid")
    ap.add_argument("--page", type=int, default=None,
                    help="single page; default shows pages 1 and 2")
    ap.add_argument("--store", help="local metadata store JSON (skip the ssh fetch)")
    ap.add_argument("--host", default=os.environ.get("DECKY_DECK_HOST", "steamdeck"))
    args = ap.parse_args()

    if args.store:
        data = json.load(open(args.store))
    else:
        raw = subprocess.run(
            ["ssh", args.host, f"cat {STORE_PATH}"],
            capture_output=True, text=True, check=True,
        ).stdout
        data = json.loads(raw)

    rec = (data.get("metadata") or {}).get(str(args.appid))
    if not isinstance(rec, dict):
        sys.exit(f"no metadata record for appid {args.appid}")

    ss = rec.get("screenshots") or []
    print(f"appid={args.appid} title={rec.get('title')!r} source={rec.get('source')} "
          f"steam_appid={rec.get('steam_appid')} screenshots={len(ss)} "
          f"source_url={rec.get('source_url')!r}")

    pages = [args.page] if args.page else [1, 2]
    for p in pages:
        items = cp.metadata_screenshots_to_fallback_items(
            ss, cp.clamp_page(p), rec.get("source_url", "")
        )
        print(f"--- page {p}: {len(items)} item(s)")
        if items:
            print(json.dumps(items[0], indent=1))


if __name__ == "__main__":
    main()
