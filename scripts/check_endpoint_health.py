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
from scripts.endpoint_health import native_probe_results, run_probe, utc_now
from scripts.endpoint_health_probes import NATIVE_PROBES, PROBES

RESULT_ORDER = (
    "ign-search", "ign-metadata", "ign-trailers", "steam-search", "steam-appdetails",
    "steam-trailers", "steam-news", "steam-events", "steam-deck-compatibility",
    "protondb-summary", "protondb-algolia", "steam-community", "steam-tracker",
    "github-releases", "github-release-assets", "hltb-lookup",
)


def collect_results(only: list[str] | None = None) -> list[dict]:
    selected = set(only) if only is not None else None
    python_probes = [probe for probe in PROBES if selected is None or probe.id in selected]
    native_probes = [probe for probe in NATIVE_PROBES if selected is None or probe[0] in selected]
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(run_probe, probe) for probe in python_probes]
        results = native_probe_results(native_probes)
        results.extend(future.result() for future in futures)
    by_id = {result["id"]: result for result in results}
    return [by_id[probe_id] for probe_id in RESULT_ORDER if probe_id in by_id]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True, help="Sanitized JSON output path")
    parser.add_argument("--only", action="append", choices=RESULT_ORDER,
                        help="Run only these endpoints (local/manual diagnostics)")
    args = parser.parse_args()
    results = collect_results(args.only)
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
