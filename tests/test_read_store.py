import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts" / "deck"))
from read_store import read_store  # noqa: E402


def test_reads_both_layouts_and_an_interrupted_full_rewrite(tmp_path):
    legacy = {"settings": {"debug_logging": False}, "metadata": {"1": {"title": "One"}}}
    (tmp_path / "decky_metadata.json").write_text(json.dumps(legacy))
    assert read_store(str(tmp_path)) == legacy

    (tmp_path / "decky_metadata.json").write_text(
        json.dumps({"settings": {"debug_logging": False}, "metadata_layout": "files-v1"})
    )
    # A crash between the backend's two directory renames leaves only `metadata.old`.
    backup = tmp_path / "metadata.old"
    backup.mkdir()
    (backup / "1.json").write_text('{"title": "One"}')
    (backup / "~2e2e2f78.json").write_text('{"title": "Odd key"}')
    (backup / "1.json.tmp").write_text("{partial")
    assert read_store(str(tmp_path)) == {
        "settings": {"debug_logging": False},
        "metadata": {"1": {"title": "One"}, "../x": {"title": "Odd key"}},
    }
