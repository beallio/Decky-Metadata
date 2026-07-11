from pathlib import Path

from scripts.deck.log_audit import audit, normalize

FIXTURES = Path(__file__).parent / "fixtures/agent_workflow"


def test_rotated_order_unknown_retention_and_fatal():
    report = audit(FIXTURES)
    assert report["sources"][0]["path"].endswith("plugin.log.1")
    assert report["known_signatures"]["backend_import_failure"] == 1
    assert report["unknown_errors"][0]["message"].endswith("id=20")
    assert report["fatal"] is True


def test_normalization_only_replaces_volatile_fields():
    value = normalize("2026-07-11 10:00:00 ERROR appid=20 pid=123 12ms 0xabc")
    assert "appid=20" in value
    assert "pid=<PID>" in value and "<DURATION>" in value and "<ADDR>" in value


def test_appid_filter_preserves_structured_id():
    report = audit(FIXTURES, appid="20")
    assert report["appids"] == ["20"]


def test_group_evidence_preserves_raw_first_and_last_occurrences(tmp_path):
    source = tmp_path / "plugin.log"
    source.write_text(
        "2026-07-11 10:00:00 ERROR request pid=10 took 12ms\n"
        "2026-07-11 10:01:00 ERROR request pid=20 took 34ms\n"
    )
    report = audit(source)
    assert len(report["groups"]) == 1
    group = report["groups"][0]
    assert group["count"] == 2
    assert group["first"] == {"source": str(source), "line": 1, "message": "2026-07-11 10:00:00 ERROR request pid=10 took 12ms"}
    assert group["last"] == {"source": str(source), "line": 2, "message": "2026-07-11 10:01:00 ERROR request pid=20 took 34ms"}
