from __future__ import annotations

import json
import sys

import pytest

from scripts import check_endpoint_health as endpoint_cli
from scripts import endpoint_health as health
from scripts import endpoint_health_probes as probes
from scripts.deck import repro_backend
from scripts.endpoint_health import ContractError, Probe, run_probe, safe_url
from scripts.endpoint_health_probes import NATIVE_PROBES


class JsonClient:
    def __init__(self, payload):
        self.payload = payload

    def json(self, *_args, **_kwargs):
        return self.payload


def _native_result(probe, *, ok=True, error=None, requests=None):
    return {
        "id": probe[0],
        "name": probe[1],
        "fixture": probe[2],
        "ok": ok,
        "requests": requests or [],
        "error": error,
    }


def _install_diagnostics(tmp_path, monkeypatch, stdout, returncode=0, invocation_path=None):
    target = tmp_path / "cargo-target"
    binary = target / "debug" / "backend-diagnostics"
    binary.parent.mkdir(parents=True, exist_ok=True)
    script = f"#!{sys.executable}\nimport os, sys\n"
    if invocation_path is not None:
        script += f"open({str(invocation_path)!r}, 'w', encoding='utf-8').write(__import__('json').dumps({{'args': sys.argv[1:], 'input': sys.stdin.read()}}))\n"
    script += f"sys.stdout.write({json.dumps(stdout)})\nsys.exit({returncode})\n"
    binary.write_text(script, encoding="utf-8")
    binary.chmod(0o755)
    monkeypatch.setenv("CARGO_TARGET_DIR", str(target))
    return binary


@pytest.mark.parametrize("tier", ["unknown", None, "pending", True, ["gold"]])
def test_known_rated_fixture_cannot_silently_become_an_unrated_or_malformed_summary(tier):
    with pytest.raises(ContractError):
        probes.protondb_summary(JsonClient({"tier": tier}))


@pytest.mark.parametrize("mutate", [
    lambda data: data.update(developers=[]),
    lambda data: data.update(publishers=None),
    lambda data: data.update(screenshots=[{"url": "https://steam.example/screenshot.jpg"}]),
    lambda data: data.update(short_description="", detailed_description="", about_the_game=""),
])
def test_http_200_game_details_without_consumer_fields_fail_the_contract(mutate):
    data = {"name": "Hades", "short_description": "A real description", "developers": ["Supergiant Games"],
            "publishers": ["Supergiant Games"], "screenshots": [{"path_full": "https://steam.example/shot.jpg"}]}
    mutate(data)
    with pytest.raises(ContractError):
        probes.steam_metadata(JsonClient({"1145360": {"success": True, "data": data}}))


def test_http_200_trailer_url_returning_an_html_error_is_not_healthy():
    class MovieClient(JsonClient):
        def text(self, *_args, **_kwargs):
            return "<html>Access denied</html>"
    payload = {"1145360": {"success": True, "data": {"movies": [{"id": 1, "hls_h264": "https://steam.example/trailer.m3u8"}]}}}
    with pytest.raises(ContractError):
        probes.steam_trailers(MovieClient(payload))


def test_algolia_demo_hit_or_numeric_object_id_does_not_count_as_the_fixture_match():
    for hit in ({"name": "TRANSFORMERS: Devastation Demo", "objectID": "338930"},
                {"name": "TRANSFORMERS: Devastation", "objectID": 338930}):
        with pytest.raises(ContractError):
            probes.protondb_algolia(JsonClient({"hits": [hit]}))


def test_news_transport_success_without_a_usable_announcement_is_not_healthy():
    with pytest.raises(ContractError):
        probes.steam_news(JsonClient({"appnews": {"appid": 1145360, "newsitems": [{"title": "", "url": "https://steam.example/news"}]}}))


def test_native_updater_manifest_failure_remains_a_failed_result(tmp_path, monkeypatch):
    probe = next(probe for probe in NATIVE_PROBES if probe[0] == "github-release-assets")
    error = {"type": "ContractError", "message": "GitHub updater manifest identity/version/tag/channel/asset/SHA contract is invalid"}
    _install_diagnostics(tmp_path, monkeypatch, json.dumps([_native_result(probe, ok=False, error=error)]), returncode=1)

    result = health.native_probe_results([probe])[0]

    assert result["ok"] is False
    assert result["error"] == error


def test_unexpected_transport_exception_does_not_publish_its_secret_text():
    secret = "private-token-in-transport-error"

    def broken(_client):
        raise OSError(f"Authorization: Bearer {secret}")

    result = run_probe(Probe("example", "Example", "Known fixture", broken))
    assert result["ok"] is False
    assert result["error"]["type"] == "OSError"
    assert secret not in json.dumps(result)


def test_url_evidence_removes_userinfo_and_encoded_credential_parameters():
    safe = safe_url("https://user:private-pass@service.example/path?access%5Ftoken=private-token&signature=private-signature&term=Hades")
    assert "private-pass" not in safe
    assert "private-token" not in safe
    assert "private-signature" not in safe
    assert "user:" not in safe


@pytest.mark.parametrize("kind,manifest", [
    ("hls_h264", "#EXTM3U\nvideo.m3u8\n"),
    ("dash_h264", "<MPD><Representation/></MPD>"),
])
def test_adaptive_trailer_manifest_with_missing_consumer_structure_is_not_healthy(kind, manifest):
    class MovieClient(JsonClient):
        def text(self, *_args, **_kwargs):
            return manifest
    payload = {"1145360": {"success": True, "data": {"movies": [{"id": 1, kind: "https://steam.example/trailer"}]}}}
    with pytest.raises(ContractError):
        probes.steam_trailers(MovieClient(payload))


@pytest.mark.parametrize("result_type", [None, "dlc"])
def test_search_match_without_the_app_type_required_by_protondb_lookup_is_not_healthy(result_type):
    row = {"id": 1145360, "name": "Hades"}
    if result_type is not None:
        row["type"] = result_type
    with pytest.raises(ContractError):
        probes.steam_search(JsonClient({"items": [row]}))


def test_launcher_uses_target_dir_override_and_resolved_tmpdir_default(tmp_path, monkeypatch):
    monkeypatch.delenv("CARGO_TARGET_DIR", raising=False)
    monkeypatch.setenv("TMPDIR", str(tmp_path))
    expected = (tmp_path / "cargo-target" / "Decky-Metadata" / "debug" / "backend-diagnostics").resolve()
    assert health.diagnostics_binary() == expected
    monkeypatch.setenv("CARGO_TARGET_DIR", str(tmp_path / "explicit"))
    assert health.diagnostics_binary() == (tmp_path / "explicit" / "debug" / "backend-diagnostics").resolve()


def test_missing_binary_is_an_explicit_failure_not_a_skipped_probe(tmp_path, monkeypatch):
    monkeypatch.setenv("CARGO_TARGET_DIR", str(tmp_path / "empty-target"))
    result = health.native_probe_results([NATIVE_PROBES[0]])[0]
    assert result["ok"] is False
    assert result["requests"] == []
    assert result["error"]["type"] == "MissingDiagnosticsBinary"


@pytest.mark.parametrize(("stdout", "returncode"), [
    ("not JSON", 0),
    ("[]", 0),
    ("[]", 2),
])
def test_malformed_or_invalid_subprocess_results_fail_explicitly(tmp_path, monkeypatch, stdout, returncode):
    _install_diagnostics(tmp_path, monkeypatch, stdout, returncode)
    result = health.native_probe_results([NATIVE_PROBES[0]])[0]
    assert result["ok"] is False
    assert result["error"] is not None


@pytest.mark.parametrize("malformation", ["catalog", "url", "missing-status"])
def test_native_output_with_mismatched_catalog_or_invalid_request_evidence_fails_explicitly(
    tmp_path, monkeypatch, malformation,
):
    row = _native_result(NATIVE_PROBES[0])
    if malformation == "catalog":
        row["fixture"] = "different fixture"
    else:
        request = {
            "method": "GET",
            "url": "https://example.test/",
            "status": 200,
            "content_type": "application/json",
        }
        if malformation == "url":
            request["url"] = "https://[malformed"
        else:
            request.pop("status")
        row["requests"] = [request]
    _install_diagnostics(tmp_path, monkeypatch, json.dumps([row]))

    result = health.native_probe_results([NATIVE_PROBES[0]])[0]

    assert result["ok"] is False
    assert result["error"]["type"] == "MalformedOutput"


def test_native_failure_exit_and_request_redaction_are_preserved(tmp_path, monkeypatch):
    secret = "diagnostic-secret-token"
    monkeypatch.setenv("TEST_PRIVATE_TOKEN", secret)
    probe = NATIVE_PROBES[0]
    row = _native_result(
        probe,
        ok=False,
        error={"type": "ProviderError", "message": f"Authorization: Bearer {secret}"},
        requests=[{
            "method": "GET",
            "url": "https://user:password@example.test/path?access_token={secret}&term=fixture",
            "status": 403,
            "content_type": "text/plain",
        }],
    )
    _install_diagnostics(tmp_path, monkeypatch, json.dumps([row]), returncode=1)

    result = health.native_probe_results([probe])[0]

    assert result["ok"] is False
    serialized = json.dumps(result)
    assert secret not in serialized
    assert "password" not in serialized
    assert "term=fixture" in serialized
    assert result["requests"][0]["status"] == 403


def test_version_one_report_combines_native_and_python_probes_in_original_order(tmp_path, monkeypatch):
    native_rows = [_native_result(probe) for probe in NATIVE_PROBES]
    _install_diagnostics(tmp_path, monkeypatch, json.dumps(native_rows))
    monkeypatch.setattr(endpoint_cli, "run_probe", lambda probe: {
        "id": probe.id, "name": probe.name, "fixture": probe.fixture,
        "ok": True, "requests": [], "error": None,
    })

    results = endpoint_cli.collect_results()

    assert [result["id"] for result in results] == list(endpoint_cli.RESULT_ORDER)
    _install_diagnostics(tmp_path, monkeypatch, json.dumps([_native_result(NATIVE_PROBES[0])]))
    report_path = tmp_path / "report.json"
    monkeypatch.setattr(sys, "argv", ["check_endpoint_health.py", "--report", str(report_path), "--only", "ign-search"])
    assert endpoint_cli.main() == 0
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["version"] == 1
    assert [result["id"] for result in report["results"]] == ["ign-search"]


@pytest.mark.parametrize(("page_arguments", "expected_arguments", "pages"), [
    ([], ["community-fallback", "--appid", "77", "--input", "-"], [1, 2]),
    (["--page", "9000"], ["community-fallback", "--appid", "77", "--page", "9000", "--input", "-"], [100]),
])
def test_repro_backend_passes_store_to_native_and_returns_json(tmp_path, monkeypatch, capsys,
                                                               page_arguments, expected_arguments, pages):
    store = tmp_path / "store.json"
    raw = '{\"metadata\":{\"77\":{\"title\":\"Game\",\"screenshots\":[],\"source_url\":\"https://ign.example/game\"}}}'
    store.write_text(raw, encoding="utf-8")
    invocation = tmp_path / "invocation.json"
    app = {"appid": "77", "title": "Game", "source": "ign", "steam_appid": 123,
           "screenshot_count": 0, "source_url": "https://ign.example/game"}
    report = {"app": app, "pages": [{"page": page, "items": []} for page in pages]}
    _install_diagnostics(tmp_path, monkeypatch, json.dumps(report), invocation_path=invocation)
    monkeypatch.setattr(sys, "argv", ["repro_backend.py", "77", "--store", str(store), *page_arguments])

    assert repro_backend.main() == 0
    assert json.loads(capsys.readouterr().out) == report
    called = json.loads(invocation.read_text(encoding="utf-8"))
    assert called["args"] == expected_arguments
    assert called["input"] == raw


def test_repro_backend_unreadable_store_is_a_nonzero_error(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["repro_backend.py", "77", "--store", str(tmp_path / "missing.json")])
    assert repro_backend.main() == 1
    assert "could not read metadata store" in capsys.readouterr().err


def _load_native_shim(monkeypatch):
    import importlib.util
    import types
    from pathlib import Path

    fake_decky = types.ModuleType("decky")
    fake_decky.DECKY_PLUGIN_DIR = "/tmp"
    fake_decky.DECKY_PLUGIN_RUNTIME_DIR = "/tmp"
    fake_decky.logger = types.SimpleNamespace(error=lambda *_args: None)
    fake_decky.emit = lambda *_args: None
    monkeypatch.setitem(sys.modules, "decky", fake_decky)
    path = Path(__file__).parents[1] / "main.py"
    spec = importlib.util.spec_from_file_location("_native_shim_contract_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Plugin


class _FakeWriter:
    def __init__(self):
        self.data = bytearray()
        self.closed = False

    def write(self, data):
        self.data.extend(data)

    async def drain(self):
        return None

    def close(self):
        self.closed = True


@pytest.mark.parametrize("kind", ["oversized", "invalid-json"])
def test_native_shim_relay_fails_pending_calls_on_bad_reply_lines(monkeypatch, kind):
    import asyncio

    async def exercise():
        from asyncio import StreamReader, get_running_loop

        plugin = _load_native_shim(monkeypatch)()
        pending = get_running_loop().create_future()
        plugin._pending["0"] = pending
        plugin._writer = _FakeWriter()
        if kind == "oversized":
            reader = StreamReader(limit=2)
            reader.feed_data(b"oversized\n")
            reader.feed_eof()
        else:
            class InvalidReader:
                async def readline(self):
                    return b"{not-json}\n"
            reader = InvalidReader()

        await plugin._relay(reader)

        with pytest.raises(RuntimeError, match="relay failed"):
            await pending
        assert plugin._writer.closed

    asyncio.run(exercise())


def test_native_shim_call_rejects_lone_surrogates_without_waiting(monkeypatch):
    import asyncio

    async def exercise():
        plugin = _load_native_shim(monkeypatch)()
        plugin._ready.set()
        plugin._writer = _FakeWriter()

        with pytest.raises(UnicodeEncodeError):
            await plugin._call("frontend_log", ["\ud800"])

        assert plugin._writer.data == b""
        assert plugin._pending == {}

    asyncio.run(exercise())
