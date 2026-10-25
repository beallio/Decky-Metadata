from __future__ import annotations

import os
from pathlib import Path

import pytest

from scripts.deck import temp_paths


def configure_root(monkeypatch: pytest.MonkeyPatch, base: Path, root: Path | None = None) -> None:
    base.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("TMPDIR", str(base))
    if root is None:
        monkeypatch.delenv("DECKY_TMP_ROOT", raising=False)
    else:
        monkeypatch.setenv("DECKY_TMP_ROOT", str(root))


def test_default_root_and_relative_outputs_are_canonical(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    configure_root(monkeypatch, tmp_path)
    root = temp_paths.root_path()
    assert root == (tmp_path / "Decky-Metadata").resolve()
    assert temp_paths.output_path("verification/result.json") == root / "verification/result.json"


def test_missing_fallback_base_is_created_private(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    fallback = tmp_path / "private-temp"
    monkeypatch.delenv("TMPDIR", raising=False)
    monkeypatch.delenv("DECKY_TMP_ROOT", raising=False)
    monkeypatch.setattr(temp_paths, "_FALLBACK_TMP", fallback)
    assert temp_paths.root_path() == fallback / "Decky-Metadata"
    assert fallback.stat().st_mode & 0o777 == 0o700


def test_absolute_output_must_stay_beneath_custom_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    base = tmp_path / "tmp"
    root = base / "evidence"
    configure_root(monkeypatch, base, root)
    assert temp_paths.output_path(root / "capture.png") == root / "capture.png"
    with pytest.raises(ValueError, match="strictly below"):
        temp_paths.output_path(root)
    with pytest.raises(ValueError, match="strictly below"):
        temp_paths.output_path(base / "sibling.json")


@pytest.mark.parametrize("bad", ["../outside", "nested/../../outside", "."])
def test_output_rejects_traversal_and_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bad: str):
    configure_root(monkeypatch, tmp_path)
    with pytest.raises(ValueError):
        temp_paths.output_path(bad)


def test_root_rejects_same_base_outside_root_and_relative_overrides(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    base = tmp_path / "tmp"
    base.mkdir()
    monkeypatch.setenv("TMPDIR", str(base))
    monkeypatch.setenv("DECKY_TMP_ROOT", str(base))
    with pytest.raises(ValueError, match="strictly below"):
        temp_paths.root_path()
    monkeypatch.setenv("DECKY_TMP_ROOT", str(tmp_path / "elsewhere"))
    with pytest.raises(ValueError, match="strictly below"):
        temp_paths.root_path()
    monkeypatch.setenv("DECKY_TMP_ROOT", "relative/evidence")
    with pytest.raises(ValueError, match="absolute"):
        temp_paths.root_path()


def test_root_and_output_reject_symlink_escape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    base = tmp_path / "tmp"
    base.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    root_link = base / "evidence"
    root_link.symlink_to(outside, target_is_directory=True)
    configure_root(monkeypatch, base, root_link)
    with pytest.raises(ValueError, match="strictly below"):
        temp_paths.root_path()

    root = base / "private"
    root.mkdir()
    configure_root(monkeypatch, base, root)
    escape = root / "escape"
    escape.symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="strictly below"):
        temp_paths.output_path(escape / "file.json")


def test_temp_base_rejects_repository_ancestry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TMPDIR", str(Path(__file__).resolve().parents[1]))
    monkeypatch.delenv("DECKY_TMP_ROOT", raising=False)
    with pytest.raises(ValueError, match="repository"):
        temp_paths.root_path()


def test_temp_base_can_hold_a_checkout_without_allowing_repository_outputs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    root = tmp_path / "Decky-Metadata"
    repository = root / "sources" / "checkout"
    configure_root(monkeypatch, tmp_path)
    monkeypatch.setattr(temp_paths, "_REPOSITORY", repository)
    assert temp_paths.output_path("captures/qam.png") == root / "captures/qam.png"
    for output in (repository, repository / "file.json", root / "sources"):
        with pytest.raises(ValueError):
            temp_paths.output_path(output)


def test_cli_prints_canonical_paths_and_rejects_invalid_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys):
    configure_root(monkeypatch, tmp_path)
    assert temp_paths.main(["root"]) == 0
    assert capsys.readouterr().out.strip() == str((tmp_path / "Decky-Metadata").resolve())
    assert temp_paths.main(["validate", "../bad"]) == 2
    assert "temp_paths:" in capsys.readouterr().err
