import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts/install_project_skill.sh"


def invoke(dest: Path, *args: str):
    return subprocess.run([str(SCRIPT), "--dest", str(dest), *args], cwd=ROOT, text=True, capture_output=True, env=os.environ.copy())


def test_dry_run_install_repeat_and_conflict(tmp_path):
    dest = tmp_path / "skills/decky-project-workflow"
    dry = invoke(dest)
    assert dry.returncode == 0 and "dry-run" in dry.stdout and not dest.exists()
    install = invoke(dest, "--install")
    assert install.returncode == 0 and dest.is_symlink()
    assert invoke(dest, "--install").returncode == 0
    dest.unlink(); dest.mkdir()
    assert invoke(dest, "--install").returncode == 1


def test_external_git_worktree_requires_opt_in(tmp_path):
    external = tmp_path / "external"
    subprocess.run(["git", "init", str(external)], check=True, capture_output=True)
    dest = external / "skills/decky-project-workflow"
    refused = invoke(dest, "--install")
    assert refused.returncode == 1 and "external Git worktree" in refused.stderr
    assert invoke(dest, "--install", "--allow-external-worktree").returncode == 0


def test_selects_release_notes_skill_and_preserves_default(tmp_path):
    release_dest = tmp_path / "skills/decky-release-notes"
    release_dry = invoke(release_dest, "--skill", "decky-release-notes")
    assert release_dry.returncode == 0
    assert str(ROOT / "skills/decky-release-notes") in release_dry.stdout
    assert not release_dest.exists()

    release_install = invoke(
        release_dest, "--skill", "decky-release-notes", "--install"
    )
    assert release_install.returncode == 0 and release_dest.is_symlink()
    assert release_dest.resolve() == ROOT / "skills/decky-release-notes"

    default_dest = tmp_path / "default/decky-project-workflow"
    default_dry = invoke(default_dest)
    assert default_dry.returncode == 0
    assert str(ROOT / "skills/decky-project-workflow") in default_dry.stdout


def test_rejects_unknown_and_traversal_skill_names(tmp_path):
    unknown_dest = tmp_path / "unknown/nope"
    unknown = invoke(unknown_dest, "--skill", "nope", "--install")
    assert unknown.returncode == 2
    assert "unknown skill" in unknown.stderr
    assert not unknown_dest.exists()

    traversal_dest = tmp_path / "traversal/evil"
    traversal = invoke(traversal_dest, "--skill", "../evil", "--install")
    assert traversal.returncode == 2
    assert "invalid skill name" in traversal.stderr
    assert not traversal_dest.exists()
