import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]
HOOK_FIXTURES = ROOT / "tests/fixtures/agent_workflow/hooks"


def test_check_default_and_explicit_install(tmp_path):
    git_dir = tmp_path / ".git"; (git_dir / "hooks").mkdir(parents=True)
    env = {**os.environ, "DECKY_GIT_DIR": str(git_dir)}
    check = subprocess.run([str(ROOT / "scripts/install_hooks.sh")], cwd=ROOT, env=env, text=True, capture_output=True)
    assert check.returncode == 1 and "DRIFT" in check.stdout
    install = subprocess.run([str(ROOT / "scripts/install_hooks.sh"), "--install"], cwd=ROOT, env=env, text=True, capture_output=True)
    assert install.returncode == 0
    for name, target in (("pre-commit", "scripts/check_tdd.sh"), ("post-commit", "scripts/post_commit.sh"), ("post-merge", "scripts/post_commit.sh")):
        path = git_dir / "hooks" / name
        assert path.read_text() == (HOOK_FIXTURES / name).read_text()
        assert target in path.read_text() and os.access(path, os.X_OK)
    repeat = subprocess.run([str(ROOT / "scripts/install_hooks.sh")], cwd=ROOT, env=env, text=True, capture_output=True)
    assert repeat.returncode == 0

    with (git_dir / "hooks/post-merge").open("a") as hook:
        hook.write("echo unexpected\n")
    drift = subprocess.run([str(ROOT / "scripts/install_hooks.sh")], cwd=ROOT, env=env, text=True, capture_output=True)
    assert drift.returncode == 1
    assert "post-merge: DRIFT" in drift.stdout

    install = subprocess.run([str(ROOT / "scripts/install_hooks.sh"), "--install"], cwd=ROOT, env=env, text=True, capture_output=True)
    assert install.returncode == 0
    pre_commit = git_dir / "hooks/pre-commit"
    pre_commit.write_text(pre_commit.read_text().replace("exec ", "echo inserted\nexec "))
    inserted = subprocess.run([str(ROOT / "scripts/install_hooks.sh")], cwd=ROOT, env=env, text=True, capture_output=True)
    assert inserted.returncode == 1
    assert "pre-commit: DRIFT" in inserted.stdout
