from scripts.decky_doctor import aggregate, check, hook_body_supported


def test_aggregation_precedence():
    assert aggregate([check("a", "PASS", "ok")]) == "PASS"
    assert aggregate([check("a", "PASS", "ok"), check("b", "WARN", "warn")]) == "WARN"
    assert aggregate([check("b", "WARN", "warn"), check("c", "FAIL", "bad")]) == "FAIL"


def test_check_shape_is_stable():
    assert check("id", "PASS", "summary", value=1) == {"id": "id", "status": "PASS", "summary": "summary", "details": {"value": 1}}


def test_hook_body_requires_an_exact_supported_delegate():
    canonical = '#!/usr/bin/env bash\nexec "$(git rev-parse --show-toplevel)/scripts/post_commit.sh" "$@"\n'
    assert hook_body_supported("post-commit", "scripts/post_commit.sh", canonical)
    assert not hook_body_supported("post-commit", "scripts/post_commit.sh", canonical.replace("exec ", "echo inserted\nexec "))
