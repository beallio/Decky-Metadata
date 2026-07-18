from __future__ import annotations

from pathlib import Path

import pytest

from scripts import changelog


def stable_text(
    body: str = "Release hardening and CI cleanup.\n\n- fix(ci): pin actions",
    *,
    version: str = "0.3.2",
    suffix: str = " - 2026-07-17",
    newline: str = "\n",
) -> str:
    text = f"# Changelog\n\n## [{version}]{suffix}\n{body}\n"
    return text.replace("\n", newline)


def unreleased_text(body: str, *, suffix: str = "") -> str:
    return f"# Changelog\n\n## [Unreleased]{suffix}\n{body}\n"


def section_for(text: str, key: str = "0.3.2") -> changelog.Section:
    section = changelog.find_section(text, key)
    assert section is not None
    return section


def run_cli(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    text: str,
    *args: str,
) -> tuple[int, str, str]:
    path = tmp_path / "CHANGELOG.md"
    path.write_text(text, encoding="utf-8")
    result = changelog.main(["--file", str(path), *args])
    captured = capsys.readouterr()
    return result, captured.out, captured.err


def test_dated_stable_section_with_summary_and_bullets_passes() -> None:
    section = section_for(stable_text())

    assert section.date == "2026-07-17"
    assert changelog.check_section(section, stable=True)


def test_missing_and_immediately_empty_sections_fail(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, error = run_cli(tmp_path, capsys, stable_text(), "check", "9.9.9")
    assert code == 1
    assert "no \"## [9.9.9]\" section" in error

    text = "# Changelog\n\n## [0.3.2] - 2026-07-17\n\n## [0.3.1] - 2026-07-16\nOlder.\n"
    code, _, error = run_cli(tmp_path, capsys, text, "check", "0.3.2")
    assert code == 1
    assert "substantive" in error


@pytest.mark.parametrize(
    "body",
    ["- TODO", "- TBD.", "TODO: write notes", "WIP", "-", "-   "],
)
def test_placeholder_only_stable_bodies_fail(body: str) -> None:
    assert not changelog.check_section(section_for(stable_text(body)), stable=True)


def test_none_prefix_real_bullet_is_substantive() -> None:
    section = section_for(stable_text("Summary.\n\n- None of the caches are cleared"))
    assert changelog.check_section(section, stable=True)


@pytest.mark.parametrize(
    "body",
    [
        "### Added",
        "<!-- comment -->",
        "<!--\ninner prose that must stay hidden\n-->",
        "<!--\nunterminated prose that must stay hidden",
        "---",
        "- - -",
        "-\t-\t-",
        "```\n```",
        ">",
        "[x]: https://example.com",
        "[x]:https://example.com",
    ],
)
def test_markdown_structure_only_is_not_substantive(body: str) -> None:
    assert not changelog.check_section(
        section_for(unreleased_text(body), "Unreleased"), stable=False
    )


@pytest.mark.parametrize("body", ["1. TODO", "- [ ] TODO"])
def test_ordered_and_task_list_placeholders_fail(body: str) -> None:
    assert not changelog.check_section(
        section_for(unreleased_text(body), "Unreleased"), stable=False
    )


@pytest.mark.parametrize("body", ["1. Real ordered note", "- [x] Shipped the thing"])
def test_real_ordered_and_task_list_items_are_substantive(body: str) -> None:
    assert changelog.check_section(
        section_for(unreleased_text(body), "Unreleased"), stable=False
    )


def test_stable_requires_first_substantive_line_to_be_non_bullet() -> None:
    body = "- Real bullet first\n\nA later sentence is not a summary."
    stable = section_for(stable_text(body))
    unreleased = section_for(unreleased_text(body), "Unreleased")

    assert not changelog.check_section(stable, stable=True)
    assert changelog.check_section(unreleased, stable=False)


def test_stable_requires_date_but_unreleased_accepts_optional_date() -> None:
    assert not changelog.check_section(
        section_for(stable_text(suffix="")), stable=True
    )
    assert changelog.check_section(section_for(stable_text()), stable=True)

    for suffix in ("", " - 2026-07-17"):
        section = section_for(unreleased_text("- Real note", suffix=suffix), "Unreleased")
        assert changelog.check_section(section, stable=False)


@pytest.mark.parametrize("suffix", [" - 2026-13-01", " - 2026-02-30", " - July 17"])
def test_invalid_stable_dates_fail(suffix: str) -> None:
    section = section_for(stable_text(suffix=suffix))
    assert section.date is None
    assert not changelog.check_section(section, stable=True)


def test_real_leap_day_passes() -> None:
    section = section_for(stable_text(suffix=" - 2028-02-29"))
    assert section.date == "2028-02-29"
    assert changelog.check_section(section, stable=True)


@pytest.mark.parametrize(
    "version", ["vv0.3.2", "0.3", "1.2.3.4", "01.2.3", "1.2.3-dev", "1.2.3+g0"]
)
def test_invalid_semver_arguments_fail(
    version: str, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, error = run_cli(tmp_path, capsys, stable_text(), "check", version)
    assert code == 1
    assert "stable version" in error


def test_single_lowercase_v_prefix_resolves_to_canonical_key(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, _ = run_cli(tmp_path, capsys, stable_text(), "check", "v0.3.2")
    assert code == 0


@pytest.mark.parametrize(
    "text",
    [
        stable_text() + "\n## [0.3.2]\nSecond.\n",
        stable_text() + "\n## [0.3.2] - July 17\nSecond.\n",
    ],
)
@pytest.mark.parametrize("command", ["check", "extract", "title"])
def test_duplicate_keys_fail_every_stable_subcommand(
    text: str,
    command: str,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    code, _, error = run_cli(tmp_path, capsys, text, command, "0.3.2")
    assert code == 1
    assert "duplicate section" in error


def test_valid_eof_section_and_crlf_parse_like_lf() -> None:
    eof = "# Changelog\n\n## [0.3.2] - 2026-07-17\nSummary.\n\n- Real note"
    lf = section_for(eof)
    crlf = section_for(eof.replace("\n", "\r\n"))

    assert lf.body == crlf.body
    assert changelog.check_section(lf, stable=True)
    assert changelog.check_section(crlf, stable=True)


def test_unreleased_cli_accepts_real_notes_and_rejects_empty(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, _ = run_cli(
        tmp_path, capsys, unreleased_text("- Real note"), "check", "--unreleased"
    )
    assert code == 0

    code, _, error = run_cli(
        tmp_path, capsys, unreleased_text(""), "check", "--unreleased"
    )
    assert code == 1
    assert "substantive" in error


def test_extract_trims_blank_edges_and_excludes_header(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    text = stable_text("\nSummary.\n\n- Real note\n\n")
    code, output, _ = run_cli(tmp_path, capsys, text, "extract", "0.3.2")

    assert code == 0
    assert output == "Summary.\n\n- Real note\n"
    assert "## [0.3.2]" not in output


@pytest.mark.parametrize(
    "text",
    [stable_text(version="0.3.1"), stable_text() + "\n## [0.3.2]\nDuplicate\n"],
)
def test_extract_missing_or_duplicate_fails(
    text: str, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, _ = run_cli(tmp_path, capsys, text, "extract", "0.3.2")
    assert code == 1


def test_render_title_uses_summary_and_canonical_v_prefix() -> None:
    section = section_for(stable_text("Release hardening and CI cleanup.\n\n- Real note"))

    assert changelog.render_title("0.3.2", section) == (
        "v0.3.2 — Release hardening and CI cleanup"
    )


def test_render_title_bullet_safety_net_is_never_empty() -> None:
    section = section_for(stable_text("- Only a bullet"))
    assert changelog.render_title("0.3.2", section) == "v0.3.2"


@pytest.mark.parametrize(
    "text",
    [stable_text(version="0.3.1"), stable_text() + "\n## [0.3.2]\nDuplicate\n"],
)
def test_title_missing_or_duplicate_fails(
    text: str, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, output, _ = run_cli(tmp_path, capsys, text, "title", "0.3.2")
    assert code == 1
    assert output == ""
