from scripts.decky_doctor import aggregate, check


def test_aggregation_precedence():
    assert aggregate([check("a", "PASS", "ok")]) == "PASS"
    assert aggregate([check("a", "PASS", "ok"), check("b", "WARN", "warn")]) == "WARN"
    assert aggregate([check("b", "WARN", "warn"), check("c", "FAIL", "bad")]) == "FAIL"


def test_check_shape_is_stable():
    assert check("id", "PASS", "summary", value=1) == {"id": "id", "status": "PASS", "summary": "summary", "details": {"value": 1}}
