import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"


def _readme_asset_references() -> list[str]:
    text = README.read_text(encoding="utf-8")
    markdown_paths = re.findall(r"!\[[^\]]*\]\((assets/[^)\s]+)", text)
    html_paths = re.findall(r"<img\b[^>]*\bsrc=[\"'](assets/[^\"']+)", text)
    return markdown_paths + html_paths


def _readme_asset_paths() -> list[Path]:
    return [Path(item.partition("?")[0]) for item in _readme_asset_references()]


def test_readme_images_are_committed_assets():
    paths = _readme_asset_paths()

    assert len(paths) == 5
    for relative_path in paths:
        assert relative_path.parts[0] == "assets"
        assert (ROOT / relative_path).is_file()
        tracked = subprocess.run(
            ["git", "ls-files", "--error-unmatch", str(relative_path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        assert tracked.returncode == 0, f"README image is not committed: {relative_path}"


def test_readme_has_no_user_attachment_images():
    assert "github.com/user-attachments" not in README.read_text(encoding="utf-8")


def test_readme_images_use_cache_busters():
    references = _readme_asset_references()

    assert references
    assert all("?cacheBuster=" in reference for reference in references)


def test_package_and_plugin_versions_match():
    package_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    plugin_version = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))["version"]

    assert package_version == plugin_version
