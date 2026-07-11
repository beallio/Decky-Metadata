import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).parents[1]


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(0o755)


def test_capture_contract_is_private_and_opt_in():
    body = (ROOT / "scripts/deck/capture.sh").read_text()
    assert "/tmp/Decky-Metadata" in body
    assert "restricted-raw" in body
    assert "--include-settings" in body
    assert "WARNING" in body
    assert "upload" not in body.lower()


def test_capture_redacts_derived_reports_and_keeps_opt_in_raw_settings(tmp_path):
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _executable(
        fake_bin / "ssh",
        """#!/usr/bin/env bash
case "$*" in
  *\"tail -n 400\"*)
    echo '/home/deck/private 76561191234567890 https://example.test/a?token=secret Authorization: bearer'
    ;;
  *\"cat '\"*decky_metadata.json*\"'\"*)
    echo '{"token":"secret","metadata":{"10":{"steam_appid":"100"},"20":{"steam_appid":"200","delisted":true},"30":{}}}'
    ;;
  *) exit 1 ;;
esac
""",
    )
    temp_root = tmp_path / "capture-root"
    base_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "DECKY_TMP_ROOT": str(temp_root),
    }
    first = subprocess.run(
        [str(ROOT / "scripts/deck/capture.sh")],
        cwd=ROOT,
        env={**base_env, "DECKY_CAPTURE_TIMESTAMP": "first"},
        text=True,
        capture_output=True,
    )
    assert first.returncode == 0, first.stderr
    output = temp_root / "diagnostics/first"
    derived = (output / "console_log.txt").read_text()
    raw = (output / "restricted-raw/console_log.txt").read_text()
    assert "secret" not in derived and "76561191234567890" not in derived
    assert "?token=" not in derived and "<HOME>" in derived
    assert "secret" in raw and "76561191234567890" in raw
    assert json.loads((output / "metadata-summary.json").read_text()) == {
        "delisted_match": 1,
        "entry_count": 3,
        "listed_match": 1,
        "never_on_steam": 1,
    }
    assert json.loads((output / "manifest.json").read_text())["include_settings"] is False

    second = subprocess.run(
        [str(ROOT / "scripts/deck/capture.sh"), "--include-settings"],
        cwd=ROOT,
        env={**base_env, "DECKY_CAPTURE_TIMESTAMP": "second"},
        text=True,
        capture_output=True,
    )
    assert second.returncode == 0
    assert "WARNING" in second.stderr
    settings = temp_root / "diagnostics/second/restricted-raw/settings.json"
    assert json.loads(settings.read_text())["token"] == "secret"
    assert json.loads((settings.parents[1] / "manifest.json").read_text())["include_settings"] is True
