from pathlib import Path

ROOT = Path(__file__).parents[1]
SKILL = ROOT / "skills/decky-release-notes/SKILL.md"


def test_frontmatter_and_triggers():
    text = SKILL.read_text()
    _, raw, body = text.split("---", 2)
    metadata = dict(line.split(":", 1) for line in raw.strip().splitlines())
    metadata = {key.strip(): value.strip() for key, value in metadata.items()}
    assert set(metadata) == {"name", "description"}
    assert metadata["name"] == "decky-release-notes"
    for phrase in ("release notes", "changelog", "cut"):
        assert phrase in metadata["description"].lower()
    for command in (
        "scripts/version_guard.py highest",
        "git log --no-merges",
        "scripts/changelog.py check",
        "scripts/changelog.py extract",
        "scripts/changelog.py rollover",
        "scripts/release.sh",
        "git push origin main",
    ):
        assert command in body


def test_safety_boundaries():
    body = SKILL.read_text()
    for boundary in (
        "never pushes by default",
        "push only if",
        "explicit per-invocation publish instruction",
        "dev → main",
    ):
        assert boundary in body
    assert "does not run scripts/release.sh" not in body
