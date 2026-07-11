import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]
STEAMUI_MANIFEST_FIXTURE = ROOT / "tests/fixtures/agent_workflow/steamui/manifest.json"


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(0o755)


def test_steamui_manifest_fixture_pins_public_shape():
    manifest = json.loads(STEAMUI_MANIFEST_FIXTURE.read_text())
    assert set(manifest) == {"schema_version", "build_id", "files"}
    assert set(manifest["files"][0]) == {"path", "size", "sha256"}


def test_local_snapshot_and_literal_search(tmp_path):
    live = tmp_path / "live"; live.mkdir()
    (live / "chunk.js").write_text("const value = \"a[b'$(touch nope)\";")
    temp_root = tmp_path / "tmp"
    env = {**os.environ, "DECKY_STEAMUI_ROOT": str(live), "DECKY_STEAMUI_BUILD_ID": "123", "DECKY_TMP_ROOT": str(temp_root)}
    snapshot = subprocess.run([str(ROOT / "scripts/deck/steamui.sh"), "snapshot"], cwd=ROOT, env=env, text=True, capture_output=True)
    assert snapshot.returncode == 0
    manifest = json.loads((temp_root / "steamui/123/manifest.json").read_text())
    assert manifest["build_id"] == "123"
    assert manifest["files"][0]["sha256"] and manifest["files"][0]["size"]
    search = subprocess.run([str(ROOT / "scripts/deck/steamui.sh"), "search", "a[b'$(touch nope)"], cwd=ROOT, env=env, text=True, capture_output=True)
    assert search.returncode == 0 and "chunk.js" in search.stdout
    assert not (ROOT / "nope").exists()


def test_remote_snapshot_records_inventory_and_search_copies_only_matches(tmp_path):
    live = tmp_path / "remote steamui"
    live.mkdir()
    (live / "match.js").write_text("needle-with-'quotes")
    (live / "other.css").write_text("unrelated")
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _executable(
        fake_bin / "ssh",
        """#!/usr/bin/env bash
shift
command="$*"
case "$command" in
  *\"find ~/.local/share/Steam\"*) printf '%s\\n' "$FAKE_STEAMUI_ROOT" ;;
  *steam_client_ubuntu12.installed*) echo 456 ;;
  python3\\ -*) bash -c "$command" ;;
  *) exit 1 ;;
esac
""",
    )
    temp_root = tmp_path / "tmp"
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "FAKE_STEAMUI_ROOT": str(live),
        "DECKY_TMP_ROOT": str(temp_root),
    }
    snapshot = subprocess.run(
        [str(ROOT / "scripts/deck/steamui.sh"), "snapshot"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )
    assert snapshot.returncode == 0, snapshot.stderr
    manifest = json.loads((temp_root / "steamui/456/manifest.json").read_text())
    assert [item["path"] for item in manifest["files"]] == ["match.js", "other.css"]
    assert all(item["size"] and item["sha256"] for item in manifest["files"])

    search = subprocess.run(
        [str(ROOT / "scripts/deck/steamui.sh"), "search", "needle-with-'quotes"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )
    assert search.returncode == 0, search.stderr
    assert "match.js" in search.stdout
    assert (temp_root / "steamui/456/assets/match.js").exists()
    assert not (temp_root / "steamui/456/assets/other.css").exists()
