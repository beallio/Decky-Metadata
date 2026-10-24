import json
import os
import stat
import subprocess
from pathlib import Path


ROOT = Path(__file__).parents[1]


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(0o755)


def test_capture_redacts_derived_reports_and_keeps_opt_in_raw_settings(tmp_path):
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    # The per-game layout: records live beside the settings file, not inside it.
    settings_dir = tmp_path / "settings"
    (settings_dir / "metadata").mkdir(parents=True)
    (settings_dir / "decky_metadata.json").write_text('{"token":"secret","metadata_layout":"files-v1"}')
    for key, record in {"10": {"steam_appid": "100"}, "20": {"steam_appid": "200", "delisted": True}, "30": {}}.items():
        (settings_dir / "metadata" / f"{key}.json").write_text(json.dumps(record))
    (settings_dir / "metadata" / "10.json.tmp").write_text("{partial")
    _executable(
        fake_bin / "ssh",
        """#!/usr/bin/env bash
case "$*" in
  *\"tail -n 400\"*)
    echo '/home/deck/private 76561191234567890 https://example.test/a?token=secret Authorization: bearer'
    ;;
  *\"python3 - '/home/deck/homebrew/settings/Decky-Metadata'\"*)
    exec python3 - "$FAKE_SETTINGS_DIR"
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
        "FAKE_SETTINGS_DIR": str(settings_dir),
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
    assert stat.S_IMODE(output.stat().st_mode) == 0o700
    assert stat.S_IMODE((output / "restricted-raw").stat().st_mode) == 0o700
    assert stat.S_IMODE((output / "restricted-raw/console_log.txt").stat().st_mode) == 0o600
    assert not (output / "restricted-raw/settings.json").exists()
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
    settings = temp_root / "diagnostics/second/restricted-raw/settings.json"
    restored = json.loads(settings.read_text())
    assert restored["token"] == "secret" and "metadata_layout" not in restored
    assert restored["metadata"]["20"] == {"steam_appid": "200", "delisted": True}
    assert stat.S_IMODE(settings.stat().st_mode) == 0o600
    assert json.loads((settings.parents[1] / "manifest.json").read_text())["include_settings"] is True


def test_capture_rejects_state_outside_tmp():
    result = subprocess.run(
        [str(ROOT / "scripts/deck/capture.sh")],
        cwd=ROOT,
        env={**os.environ, "DECKY_TMP_ROOT": "/var/unsafe-decky-capture"},
        text=True,
        capture_output=True,
    )
    assert result.returncode == 2
