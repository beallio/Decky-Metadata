#!/usr/bin/env python3
"""Check external endpoint contracts and write a sanitized, per-endpoint report."""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.endpoint_health import run_probe, utc_now
from scripts.endpoint_health_probes import PROBES


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True, help="Sanitized JSON output path")
    parser.add_argument("--only", action="append", choices=[probe.id for probe in PROBES],
                        help="Run only these endpoints (local/manual diagnostics)")
    args = parser.parse_args()
    selected = [probe for probe in PROBES if args.only is None or probe.id in args.only]
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(run_probe, selected))
    report = {"version": 1, "checked_at": utc_now(), "results": results}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for result in results:
        suffix = "" if result["ok"] else f": {result['error']['type']}: {result['error']['message']}"
        print(f"{'OK' if result['ok'] else 'FAIL'} {result['id']} ({result['fixture']}){suffix}")
    passed = sum(result["ok"] for result in results)
    print(f"Endpoint health: {passed}/{len(results)} passed. Report: {args.report}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
