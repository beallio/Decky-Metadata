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
