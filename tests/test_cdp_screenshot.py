import base64

from pathlib import Path

import pytest

from scripts.deck.cdp import _screenshot_output_path, decode_screenshot_data


def test_screenshot_output_resolves_beneath_configured_tmp_root(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TMPDIR", str(tmp_path))
    monkeypatch.delenv("DECKY_TMP_ROOT", raising=False)
    assert _screenshot_output_path("capture.png") == tmp_path / "Decky-Metadata/screenshots/capture.png"


def test_screenshot_output_rejects_traversal_and_symlink_escape(tmp_path: Path, monkeypatch):
    base = tmp_path / "tmp"
    root = base / "evidence"
    root.mkdir(parents=True)
    monkeypatch.setenv("TMPDIR", str(base))
    monkeypatch.setenv("DECKY_TMP_ROOT", str(root))
    with pytest.raises(SystemExit, match="contain '..'"):
        _screenshot_output_path("../outside.png")
    outside = tmp_path / "outside"
    outside.mkdir()
    (root / "screenshots").mkdir()
    (root / "screenshots/escape").symlink_to(outside, target_is_directory=True)
    with pytest.raises(SystemExit, match="strictly below"):
        _screenshot_output_path("escape/capture.png")

def test_decode_screenshot_data_returns_exact_bytes():
    expected = b"\x89PNG\r\n\x1a\nexample"

    assert decode_screenshot_data(base64.b64encode(expected).decode("ascii")) == expected


@pytest.mark.parametrize("payload", [None, ""])
def test_decode_screenshot_data_rejects_missing_payload(payload):
    with pytest.raises(ValueError, match="no screenshot data"):
        decode_screenshot_data(payload)
