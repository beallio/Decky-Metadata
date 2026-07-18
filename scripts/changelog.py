#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Sequence


SECTION_HEADER_RE = re.compile(r"^##\s+\[(?P<key>[^\]]+)\](?P<suffix>.*)$")
LEVEL_TWO_HEADER_RE = re.compile(r"^##(?:\s|$)")
DATE_SUFFIX_RE = re.compile(r"^\s+-\s+(?P<date>\d{4}-\d{2}-\d{2})\s*$")
STABLE_VERSION_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
LIST_ITEM_RE = re.compile(r"^(?:[-*+]|\d+[.)])(?:\s+(?P<rest>.*\S))?\s*$")
TASK_CHECKBOX_RE = re.compile(r"^\[[ xX]\]\s+")
PLACEHOLDER_RE = re.compile(r"^(?:todo|tbd|tbc|wip|fixme)\b", re.IGNORECASE)
PLACEHOLDERS = {
    "todo",
    "tbd",
    "tbc",
    "wip",
    "fixme",
    "n/a",
    "na",
    "none",
    "nothing yet",
    "placeholder",
    "_placeholder_",
}
DEFAULT_CHANGELOG = Path(__file__).resolve().parents[1] / "CHANGELOG.md"


class DuplicateSectionError(ValueError):
    """Raised when a changelog key appears more than once."""


@dataclass(frozen=True)
class Section:
    key: str
    body: str
    date: str | None
    suffix: str


def _parse_date(suffix: str) -> str | None:
    if not suffix:
        return None
    match = DATE_SUFFIX_RE.fullmatch(suffix)
    if match is None:
        return None
    value = match.group("date")
    try:
        date.fromisoformat(value)
    except ValueError:
        return None
    return value


def _trim_blank_edges(lines: list[str]) -> list[str]:
    start = 0
    end = len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end]


def find_section(text: str, key: str) -> Section | None:
    """Return one bracket-keyed section, rejecting duplicate keys first."""

    lines = text.splitlines()
    matches: list[tuple[int, re.Match[str]]] = []
    for index, line in enumerate(lines):
        match = SECTION_HEADER_RE.fullmatch(line)
        if match is not None and match.group("key") == key:
            matches.append((index, match))

    if len(matches) > 1:
        raise DuplicateSectionError(f'duplicate section "## [{key}]"')
    if not matches:
        return None

    header_index, header = matches[0]
    body_end = len(lines)
    for index in range(header_index + 1, len(lines)):
        if LEVEL_TWO_HEADER_RE.match(lines[index]):
            body_end = index
            break

    body_lines = _trim_blank_edges(lines[header_index + 1 : body_end])
    suffix = header.group("suffix")
    return Section(
        key=key,
        body="\n".join(body_lines),
        date=_parse_date(suffix),
        suffix=suffix,
    )


def classify_line(raw_line: str) -> tuple[bool, bool, str]:
    """Classify one comment-free changelog body line."""

    s = raw_line.strip()
    if not s:
        return False, False, ""
    if re.match(r"^#", s):
        return False, False, ""

    compact = re.sub(r"\s", "", s)
    if re.fullmatch(r"(?:-{3,}|\*{3,}|_{3,})", compact):
        return False, False, ""
    if re.fullmatch(r"<!--.*-->", s):
        return False, False, ""
    if re.match(r"^(?:`{3,}|~{3,})", s):
        return False, False, ""
    if re.fullmatch(r">[>\s]*", s):
        return False, False, ""
    if re.match(r"^\[[^\]]+\]:\s*\S", s):
        return False, False, ""

    list_match = LIST_ITEM_RE.fullmatch(s)
    is_bullet = list_match is not None
    if list_match is not None:
        payload = list_match.group("rest") or ""
        payload = TASK_CHECKBOX_RE.sub("", payload, count=1).strip()
        if not payload:
            return False, True, ""
    else:
        payload = s

    normalized = payload.strip()
    if normalized.endswith((".", ":")):
        normalized = normalized[:-1].rstrip()
    lowered = normalized.casefold()
    if lowered in PLACEHOLDERS or PLACEHOLDER_RE.match(normalized):
        return False, is_bullet, payload

    return True, is_bullet, payload


def _classified_body(body: str) -> list[tuple[bool, bool, str]]:
    comment_free = re.sub(r"<!--.*?(?:-->|\Z)", "", body, flags=re.S)
    return [classify_line(line) for line in comment_free.splitlines()]


def _first_substantive(section: Section) -> tuple[bool, str] | None:
    for substantive, is_bullet, payload in _classified_body(section.body):
        if substantive:
            return is_bullet, payload
    return None


def check_section(section: Section, *, stable: bool) -> bool:
    """Check one parsed section against stable or Unreleased requirements."""

    if stable and section.date is None:
        return False
    first = _first_substantive(section)
    if first is None:
        return False
    if stable and first[0]:
        return False
    return True


def render_title(version: str, section: Section) -> str:
    """Render a non-empty stable release title from the leading summary."""

    canonical = f"v{version}"
    first = _first_substantive(section)
    if first is None or first[0]:
        return canonical
    summary = first[1].strip()
    if summary.endswith("."):
        summary = summary[:-1].rstrip()
    return f"{canonical} — {summary}" if summary else canonical


def _stable_key(value: str) -> str:
    key = value[1:] if value.startswith("v") else value
    if STABLE_VERSION_RE.fullmatch(key) is None:
        raise ValueError(
            f'"{value}" is not a stable version; expected X.Y.Z or vX.Y.Z'
        )
    return key


def _section_key(args: argparse.Namespace) -> tuple[str, bool]:
    if args.unreleased:
        if args.version is not None:
            raise ValueError("--unreleased cannot be combined with VERSION")
        return "Unreleased", False
    if args.version is None:
        raise ValueError("VERSION is required unless --unreleased is used")
    return _stable_key(args.version), True


def _section_label(key: str) -> str:
    return f'"## [{key}]"'


def _load_section(path: Path, key: str) -> Section | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    try:
        return find_section(text, key)
    except DuplicateSectionError as exc:
        raise ValueError(f"{exc} in {path}") from exc


def _run_check(path: Path, key: str, stable: bool) -> int:
    section = _load_section(path, key)
    label = _section_label(key)
    if section is None:
        raise ValueError(f"no {label} section found in {path}")
    if stable and section.date is None:
        raise ValueError(f"{label} is missing a valid YYYY-MM-DD date in {path}")
    first = _first_substantive(section)
    if first is None:
        raise ValueError(f"{label} needs substantive release notes in {path}")
    if stable and first[0]:
        raise ValueError(
            f"{label} needs a non-bullet summary line before its bullets in {path}"
        )
    return 0


def _add_section_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("version", nargs="?")
    parser.add_argument(
        "--unreleased",
        action="store_true",
        help="Use the Unreleased section instead of a stable version.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate and extract curated Decky Metadata release notes."
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_CHANGELOG,
        help="Changelog file (default: repository CHANGELOG.md).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    check = subparsers.add_parser("check", help="Validate a changelog section.")
    _add_section_arguments(check)

    extract = subparsers.add_parser("extract", help="Print a changelog section body.")
    _add_section_arguments(extract)

    title = subparsers.add_parser("title", help="Print an enriched stable release title.")
    title.add_argument("version")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    path = args.file.resolve()
    try:
        if args.command == "title":
            key = _stable_key(args.version)
            stable = True
        else:
            key, stable = _section_key(args)

        section = _load_section(path, key)
        if args.command == "check":
            return _run_check(path, key, stable)
        if section is None:
            raise ValueError(f"no {_section_label(key)} section found in {path}")
        if args.command == "extract":
            print(section.body)
            return 0
        if args.command == "title":
            print(render_title(key, section))
            return 0
    except ValueError as exc:
        print(f"changelog: {exc}", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
