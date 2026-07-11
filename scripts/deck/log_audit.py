#!/usr/bin/env python3
"""Deterministically audit current and rotated Decky-Metadata logs."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

LEVEL = re.compile(r"\b(ERROR|WARNING)\b", re.I)
APPID = re.compile(r"(?:appid|AppID)[= '\[]+(\d+)", re.I)
URL = re.compile(r"https?://[^\s'\"]+")
TIME = re.compile(r"\b\d{4}-\d\d-\d\d[T ][0-9:.+-]+")
VOLATILE = [
    (re.compile(r"\bpid[= :]\d+", re.I), "pid=<PID>"),
    (re.compile(r"\b0x[0-9a-f]+", re.I), "<ADDR>"),
    (re.compile(r"\b\d+(?:\.\d+)?ms\b", re.I), "<DURATION>"),
]
KNOWN = {
    "backend_import_failure": re.compile(r"ModuleNotFoundError|ImportError", re.I),
    "patch_install_failure": re.compile(r"patch.+(?:fail|error)|failed.+patch", re.I),
    "render_shield_hijack": re.compile(r"render-shield.*bypassCounterBefore='-1'", re.I),
    "cache_write_churn": re.compile(r"cache.+write", re.I),
    "http_failure": re.compile(r"HTTP(?:Error| failure| [45]\d\d)|status[=: ]+[45]\d\d", re.I),
}
FATAL = {"backend_import_failure", "patch_install_failure", "render_shield_hijack"}


def normalize(line: str) -> str:
    value = TIME.sub("<TIMESTAMP>", line.strip())
    for pattern, replacement in VOLATILE:
        value = pattern.sub(replacement, value)
    return value


def source_files(source: Path) -> list[Path]:
    if source.is_file():
        return [source]
    if not source.is_dir():
        raise ValueError(f"source does not exist: {source}")
    files = [path for path in source.iterdir() if path.is_file() and "log" in path.name]
    def order(path: Path) -> tuple[int, str]:
        match = re.search(r"\.(\d+)(?:\.txt)?$", path.name)
        return (-(int(match.group(1))) if match else 1, path.name)
    return sorted(files, key=order)


def audit(source: Path, since: str | None = None, appid: str | None = None) -> dict[str, object]:
    files = source_files(source)
    groups: Counter[str] = Counter()
    group_evidence: dict[str, dict[str, object]] = {}
    known: Counter[str] = Counter()
    levels: Counter[str] = Counter()
    unknown: list[dict[str, object]] = []
    sources: list[dict[str, object]] = []
    sessions: list[str] = []
    versions: list[str] = []
    urls: set[str] = set()
    appids: set[str] = set()
    for path in files:
        lines = path.read_text(errors="replace").splitlines()
        selected: list[str] = []
        for number, line in enumerate(lines, 1):
            if since and (match := TIME.search(line)) and match.group(0) < since:
                continue
            found_appids = APPID.findall(line)
            if appid and appid not in found_appids:
                continue
            selected.append(line)
            appids.update(found_appids)
            urls.update(URL.findall(line))
            if re.search(r"startup|session (?:start|begin)", line, re.I): sessions.append(f"{path}:{number}")
            if match := re.search(r"(?:packaged )?version[=: ]+([\w.+-]+)", line, re.I): versions.append(match.group(1))
            normalized = normalize(line)
            if level := LEVEL.search(line):
                levels[level.group(1).upper()] += 1
            if "Traceback (most recent call last)" in line: levels["TRACEBACK"] += 1
            signatures = [name for name, pattern in KNOWN.items() if pattern.search(line)]
            for name in signatures: known[name] += 1
            if signatures or LEVEL.search(line) or "Traceback" in line:
                groups[normalized] += 1
                occurrence = {"source": str(path), "line": number, "message": line}
                evidence = group_evidence.setdefault(normalized, {"first": occurrence, "last": occurrence})
                evidence["last"] = occurrence
                if not signatures:
                    unknown.append({"source": str(path), "line": number, "message": line})
        sources.append({"path": str(path), "line_count": len(lines), "selected_count": len(selected), "first_line": selected[0] if selected else "", "last_line": selected[-1] if selected else ""})
    return {
        "schema_version": 1,
        "sources": sources,
        "sessions": sessions,
        "versions": sorted(set(versions)),
        "counts": {key: levels[key] for key in sorted(levels)},
        "known_signatures": {key: known[key] for key in sorted(known)},
        "groups": [
            {
                "signature": key,
                "count": groups[key],
                "first": group_evidence[key]["first"],
                "last": group_evidence[key]["last"],
            }
            for key in sorted(groups)
        ],
        "unknown_errors": unknown,
        "appids": sorted(appids, key=int),
        "urls": sorted(urls),
        "fatal": any(known[name] for name in FATAL),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--since")
    parser.add_argument("--appid")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        report = audit(args.source, args.since, args.appid)
    except (OSError, ValueError) as error:
        print(f"log-audit: {error}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(report, sort_keys=True, separators=(",", ":")))
    else:
        print(f"sources={len(report['sources'])} fatal={str(report['fatal']).lower()}")
        for name, count in report["known_signatures"].items(): print(f"{name}: {count}")
        print(f"unknown_errors: {len(report['unknown_errors'])}")
    return 1 if report["fatal"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
