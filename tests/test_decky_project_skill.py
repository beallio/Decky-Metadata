from pathlib import Path

ROOT = Path(__file__).parents[1]
SKILL = ROOT / "skills/decky-project-workflow/SKILL.md"


def test_frontmatter_and_triggers():
    text = SKILL.read_text()
    _, raw, body = text.split("---", 2)
    metadata = dict(line.split(":", 1) for line in raw.strip().splitlines())
    metadata = {key.strip(): value.strip() for key, value in metadata.items()}
    assert set(metadata) == {"name", "description"}
    for phrase in ("implement", "diagnose", "SteamUI", "package", "orchestration"):
        assert phrase.lower() in metadata["description"].lower()
    for command in ("scripts/decky doctor", "scripts/decky capture", "scripts/decky package-push"):
        assert command in body


def test_safety_and_lifecycle_boundaries():
    body = SKILL.read_text()
    for flag in ("--device", "--allow-launch", "--push"):
        assert flag in body
    assert "never replace or modify that lifecycle" in body
    assert "read-only unless the user requests changes" in body
