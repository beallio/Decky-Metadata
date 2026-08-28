import json
import os
import re
import subprocess
from pathlib import Path

import pytest

from scripts.deck.verify.select_fixtures import select

FIXTURE = Path(__file__).parent / "fixtures/agent_workflow/metadata.json"


def _serialized_objects(source: str):
    """Return the actual object literals passed to JSON.stringify by a probe."""
    marker = "return JSON.stringify({"
    cursor = 0
    objects = []
    while (start := source.find(marker, cursor)) >= 0:
        object_start = source.find("{", start)
        depth = 0
        for index in range(object_start, len(source)):
            if source[index] == "{":
                depth += 1
            elif source[index] == "}":
                depth -= 1
                if depth == 0:
                    objects.append(source[object_start + 1:index])
                    cursor = index + 1
                    break
        else:
            raise AssertionError("unterminated JSON.stringify object")
    return objects


def _assert_controller_tab_probe_payload_contract(probe: str) -> None:
    payloads = _serialized_objects(probe)
    assert len(payloads) == 5
    selected = [payload for payload in payloads if "originalSelectedTab:" in payload]
    observed = [
        payload for payload in payloads
        if "selectedTab:" in payload and "originalSelectedTab:" not in payload
    ]
    queried = [payload for payload in payloads if re.search(r"(?m)^\s*controllerType(?:,|:)", payload)]
    restored = [payload for payload in payloads if "restoredFilter:" in payload]
    captured = [
        payload for payload in payloads
        if "originalFilter:" in payload and "controllerType" not in payload
    ]
    assert len(selected) == 1
    assert len(observed) == 1
    assert len(queried) == 1
    assert len(restored) == 1
    assert len(captured) == 1
    selected = selected[0]
    observed = observed[0]
    queried = queried[0]

    for payload in (selected, observed):
        assert "selectedTab:" in payload
        assert "tabs:" in payload
        assert "renderedCount:" in payload
    assert "originalSelectedTab:" in selected
    assert "displayedAppid" in restored[0]
    for required in (
        "controllerIndex",
        "controllerType",
        "activeStoreAppid",
        "before",
        "after",
        "originalFilter",
        "filterDuringQuery",
        "elapsedMs:",
    ):
        assert required in queried
    assert "return { getterCount: identities.length, urlHashes: identities.map(hash) };" in probe
    assert "cacheEntryFingerprint(cacheAfterQuery)" in probe
    assert "controller query result did not settle" in probe
    assert "expectedExpandedResult" in probe
    assert "candidate.getterCount > before.getterCount" in probe
    assert "resultSettled: true" in probe
    assert "if (stableSamples >= 3) {\n          after = candidate;" in probe
    assert "chooser remount did not settle" in probe
    assert 'element.classList.contains("Panel")' in probe
    assert 'element.classList.contains("Focusable")' not in probe
    for forbidden in ("identities:", "URL:", "title:", "account"):
        assert forbidden not in "\n".join(payloads)


def _assert_controller_tab_smoke_contract(smoke: str) -> None:
    assert 'expected_controller_type="${3:?usage:' in smoke
    assert "expected type must be a non-negative integer" in smoke
    assert "if controller_type != expected_type:" in smoke
    assert "expectedControllerType" in smoke
    assert "query.resultSettled" in smoke
    assert "restorationQueryIssued" in smoke
    assert "if controller_type == 102 and not set(before_hashes).issubset(set(hashes)):" in smoke
    assert "rendered_after > getter_count" in smoke
    assert 'payload["renderCoverage"] = (' in smoke
    capture_filter = 'capture_filter_json="$(probe "SharedJSContext" "capture-filter")"'
    assert capture_filter in smoke
    assert smoke.index(capture_filter) < smoke.index('query_json="$(probe "SharedJSContext" "query")"')
    assert smoke.index("filter_restore_armed=1") < smoke.index(
        'query_json="$(probe "SharedJSContext" "query")"'
    )
    assert '"status": "started"' in smoke
    assert smoke.index('"status": "started"') < smoke.index(
        'before_json="$(probe "Steam Big Picture Mode" "dom-select")"'
    )
    assert '"status": "pending-validation"' in smoke
    assert smoke.index('"status": "pending-validation"') < smoke.index(
        'if selected(before, "before") != "Community Layouts":'
    )
    restore_filter = 'restore_filter_json="$(probe "SharedJSContext" "restore-filter" "" "$original_filter")"'
    assert restore_filter in smoke
    assert smoke.index('after_json="$(probe "Steam Big Picture Mode" "dom-observe")"') < smoke.index(
        restore_filter
    )
    restore = 'restore_json="$(probe "Steam Big Picture Mode" "dom-restore" "$original_tab")"'
    assert restore in smoke
    assert smoke.index(restore) < smoke.index('pass "controller tab persistence')
    assert "trap - EXIT" in smoke


def test_selection_is_semantic_and_deterministic():
    data = json.loads(FIXTURE.read_text())
    first = select(data)
    reversed_data = {"metadata": dict(reversed(list(data["metadata"].items())))}
    assert select(reversed_data) == first
    assert first["fixtures"]["listed_match"]["appid"] == "10"
    assert first["fixtures"]["delisted_match"]["appid"] == "20"
    assert first["fixtures"]["never_on_steam"]["appid"] == "30"


def test_invalid_override_is_rejected():
    with pytest.raises(ValueError):
        select(json.loads(FIXTURE.read_text()), {"listed_match": "30"})


def test_launcher_without_stored_game_metadata_is_not_a_never_on_steam_fixture():
    result = select(
        {
            "metadata": {
                "10": {"title": "Lutris"},
                "20": {
                    "title": "Mario Kart",
                    "source": "IGN",
                    "developers": [{"name": "Nintendo"}],
                },
            }
        }
    )
    assert result["fixtures"]["never_on_steam"]["appid"] == "20"


def test_auto_selected_fixture_is_never_a_launch_target():
    run_all = (Path(__file__).parents[1] / "scripts/deck/verify/run_all.sh").read_text()
    assert "launch_appid_explicit" in run_all
    assert "auto-selected fixtures are render-only" in run_all
    assert 'fixture_args+=(--listed-match "$MATCHED_APPID")' in run_all
    assert '>"$run_dir/fixtures.json"' in run_all
    assert 'QUICKLINK_FEATURE_APPID="${QUICKLINK_FEATURE_APPID:-}"' in run_all
    assert (
        'smoke_quicklinks.sh" "$MATCHED_APPID" "$NEVER_APPID" '
        '"$DELISTED_APPID" "$QUICKLINK_FEATURE_APPID"'
    ) in run_all
    assert 'smoke_launch.sh" "$QUICKLINK_FEATURE_APPID"' not in run_all


def test_quicklink_smoke_accepts_feature_fixture_and_checks_policy_order():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_quicklinks.sh").read_text()
    probe = (root / "scripts/deck/js/check_quicklinks.js").read_text()

    assert 'feature="${4:-}"' in smoke
    assert 'expected_order = ["Store Page", "DLC", "Community Hub", "Points Shop"]' in smoke
    assert 'delisted["storePage"]' in smoke
    assert 'delisted["support"]' in smoke
    assert 'matched["market"]' in smoke
    assert 'delisted["market"]' in smoke
    assert 'feature["support"]' in smoke
    assert 'feature["market"]' in smoke
    assert "quickLinkOrder" in probe
    assert "pointsShop" in probe
    assert "support" in probe
    assert '"Market"' in probe
    assert '"Community Market"' in probe
    assert "detailsMetadata" in probe
    assert 'matched["developerInfo"] or matched["detailsMetadata"]' in smoke
    assert 'never["developerInfo"] or never["detailsMetadata"]' in smoke


def test_artwork_identity_probe_and_smoke_are_output_safe_and_read_only():
    root = Path(__file__).parents[1]
    probe_path = root / "scripts/deck/js/check_artwork_identity.js"
    smoke_path = root / "scripts/deck/verify/smoke_artwork_identity.sh"

    assert probe_path.is_file(), "missing planned artwork identity probe"
    assert smoke_path.is_file(), "missing planned artwork identity smoke"

    probe = probe_path.read_text()
    smoke = smoke_path.read_text()
    assert "shortcutAppId" in probe
    assert "matchedAppId" in probe
    assert "aliasSameObject" in probe
    assert "isShortcut" in probe
    assert "isModOrShortcut" in probe
    assert "iconHashPresent" in probe
    assert "iconDataPresent" in probe
    assert "iconResolved" in probe
    assert "iconValueHash" in probe
    assert "const ICON_HYDRATION_DEADLINE_MS = 15000;" in probe
    assert "const ICON_HYDRATION_POLL_INTERVAL_MS = 250;" in probe
    assert "iconDeadlineMs" in probe
    assert "Math.min(ICON_HYDRATION_POLL_INTERVAL_MS, iconDeadline - Date.now())" in probe
    assert "artwork" in probe
    assert "elapsedMs" in probe
    assert 'probeMode === "desktop-home"' in probe
    assert 'a[href=\'/library/home\'][aria-current=\'page\']' in probe
    assert "sidebarLabelHash" in probe
    assert 'closest("[role=gridcell]")' in probe
    assert "new Set" in probe
    assert "matchingCellCount" in probe
    assert "customSidebarIconFound" in probe
    assert "customSidebarIconCount" in probe
    assert "portraitCandidateCount" in probe
    assert "completeImageDimensions" in probe
    for forbidden in (
        "URL:", "url:", "data:", "path:", "title:", "account",
        "navigate", "history.push", "dispatchEvent", "RunGame", "launch",
        "SetCustom", "SetIcon", "SetLibrary", "Clear", "DeckyPluginLoader",
    ):
        assert forbidden not in probe
    assert 'before_manifest="${5:?usage:' in smoke
    assert 'evidence="${6:?usage:' in smoke
    assert 'sidebar_label_hash="${7:?usage:' in smoke
    assert "--capture-artwork-files" in smoke
    assert "shortcut and matched appids must differ" in smoke
    assert "sidebar label hash must be an eight-character lowercase hex value" in smoke
    assert 'cdp eval Steam "@$JS_DIR/check_artwork_identity.js"' in smoke
    assert "Desktop Library Home is not selected" in smoke
    assert "Desktop Library Home row is missing" in smoke
    assert "Desktop Library Home custom sidebar icon is missing" in smoke
    assert "fileHashSetUnchanged" in smoke
    assert "iconValueHash" in smoke
    assert "data[\"iconDeadlineMs\"] != 15000" in smoke
    assert "1 <= data[\"iconAttempts\"] <= 61" in smoke
    assert "/tmp/Decky-Metadata" in smoke
    assert '"status": "started"' in smoke
    assert '"status": "pending-validation"' in smoke
    assert "shortcut identity" in smoke
    assert "icon resolver" in smoke
    assert "raw" not in "\n".join(_serialized_objects(probe)).lower()


def _run_artwork_identity_probe(probe: str, hydration_delay_ms: int | None) -> dict:
    source = (
        probe.replace("__SHORTCUT_APPID__", "2155012430")
        .replace("__MATCHED_APPID__", "55150")
        .replace("__PROBE_MODE__", "identity")
        .replace("__SIDEBAR_LABEL_HASH__", "10203040")
    )
    hydration_expression = "false" if hydration_delay_ms is None else f"now >= {hydration_delay_ms}"
    runner = f"""
let now = 0;
let iconCalls = 0;
Date.now = () => now;
globalThis.setTimeout = (callback, delay) => {{ now += delay; callback(); return 0; }};
const overview = {{
  appid: 2155012430,
  app_type: 1073741824,
  BIsShortcut: () => true,
  BIsModOrShortcut: () => true,
}};
globalThis.window = {{ location: {{ pathname: "/library/home" }} }};
globalThis.appStore = {{
  GetAppOverviewByAppID: () => overview,
  GetIconURLForApp: () => {{ iconCalls += 1; return {hydration_expression} ? "icon://hydrated" : null; }},
  GetCustomVerticalCapsuleURLs: () => [],
  GetCustomLandcapeImageURLs: () => [],
  GetCustomHeroImageURLs: () => [],
  GetCustomLogoImageURLs: () => [],
}};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    completed = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


def _fnv1a_hash(value: str) -> str:
    state = 2166136261
    for character in value:
        state = ((state ^ ord(character)) * 16777619) & 0xFFFFFFFF
    return f"{state:08x}"


def _run_desktop_artwork_probe(
    probe: str,
    *,
    cells: list[dict],
    home_selected: bool = True,
    label: str = "Fixture shortcut",
    sidebar_label_hash: str | None = None,
) -> dict:
    source = (
        probe.replace("__SHORTCUT_APPID__", "2155012430")
        .replace("__MATCHED_APPID__", "55150")
        .replace("__PROBE_MODE__", "desktop-home")
        .replace("__SIDEBAR_LABEL_HASH__", sidebar_label_hash or _fnv1a_hash(label))
    )
    runner = f"""
const probeSource = {json.dumps(source)};
const label = {json.dumps(label)};
const fixtureCells = {json.dumps(cells)};
const makeImage = (fixture) => ({{
  complete: fixture.complete,
  naturalWidth: fixture.naturalWidth,
  naturalHeight: fixture.naturalHeight,
  getAttribute: (name) => name === "src" ? fixture.src : null,
  getBoundingClientRect: () => fixture.rect,
}});
const matchingElements = [];
for (const fixture of fixtureCells) {{
  const images = fixture.images.map(makeImage);
  const cell = {{
    getBoundingClientRect: () => fixture.rect,
    querySelectorAll: (selector) => selector === "img" ? images : [],
    _style: fixture.style || {{ display: "block", visibility: "visible", opacity: "1" }},
  }};
  for (let index = 0; index < fixture.nestedLabelCount; index += 1) {{
    matchingElements.push({{
      textContent: label,
      getAttribute: (name) => name === "aria-label" ? label : null,
      closest: (selector) => selector === "[role=gridcell]" ? cell : null,
    }});
  }}
}}
globalThis.document = {{
  querySelector: (selector) => selector === "a[href='/library/home'][aria-current='page']" && {str(home_selected).lower()} ? {{}} : null,
  querySelectorAll: () => matchingElements,
}};
globalThis.getComputedStyle = (element) => element._style || {{ display: "block", visibility: "visible", opacity: "1" }};
eval(probeSource).then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    completed = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


def _desktop_cell(*images: dict, nested_label_count: int = 2) -> dict:
    return {
        "nestedLabelCount": nested_label_count,
        "rect": {"width": 320, "height": 96},
        "images": list(images),
    }


def _desktop_image(
    *,
    src: str = "data:image/png;base64,fixture",
    complete: bool = True,
    natural_width: int = 32,
    natural_height: int = 32,
    rendered_width: int = 32,
    rendered_height: int = 32,
) -> dict:
    return {
        "src": src,
        "complete": complete,
        "naturalWidth": natural_width,
        "naturalHeight": natural_height,
        "rect": {"width": rendered_width, "height": rendered_height},
    }


def test_desktop_artwork_probe_deduplicates_nested_labels_and_accepts_sidebar_icon_clones():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()

    payload = _run_desktop_artwork_probe(
        probe,
        cells=[
            _desktop_cell(
                _desktop_image(),
                _desktop_image(natural_width=600, natural_height=900, rendered_width=160, rendered_height=240),
            ),
            _desktop_cell(
                _desktop_image(),
                _desktop_image(natural_width=600, natural_height=900, rendered_width=160, rendered_height=240),
            ),
        ],
    )

    assert payload["homeSelected"] is True
    assert payload["labelHashValid"] is True
    assert payload["matchingCellCount"] == 2
    assert payload["customSidebarIconCount"] == 2
    assert payload["customSidebarIconFound"] is True
    assert payload["portraitCandidateCount"] == 2
    assert payload["completeImageDimensions"] == [[32, 32, 32, 32], [32, 32, 32, 32], [600, 900, 160, 240], [600, 900, 160, 240]]


@pytest.mark.parametrize(
    "image",
    [
        _desktop_image(natural_width=600, natural_height=900, rendered_width=160, rendered_height=240),
        _desktop_image(complete=False),
        _desktop_image(natural_width=0, natural_height=0, rendered_width=0, rendered_height=0),
        _desktop_image(src="https://example.invalid/icon.png"),
    ],
)
def test_desktop_artwork_probe_rejects_non_icon_sidebar_candidates(image: dict):
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()

    payload = _run_desktop_artwork_probe(probe, cells=[_desktop_cell(image)])

    assert payload["matchingCellCount"] == 1
    assert payload["customSidebarIconCount"] == 0
    assert payload["customSidebarIconFound"] is False


def test_desktop_artwork_probe_rejects_a_matching_cell_without_images():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()

    payload = _run_desktop_artwork_probe(probe, cells=[_desktop_cell()])

    assert payload["matchingCellCount"] == 1
    assert payload["completeImageCount"] == 0
    assert payload["customSidebarIconFound"] is False


def test_desktop_artwork_probe_rejects_wrong_hash_and_noncurrent_home():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()
    cells = [_desktop_cell(_desktop_image())]

    wrong_hash = _run_desktop_artwork_probe(probe, cells=cells, sidebar_label_hash="deadbeef")
    noncurrent_home = _run_desktop_artwork_probe(probe, cells=cells, home_selected=False)

    assert wrong_hash["matchingCellCount"] == 0
    assert wrong_hash["customSidebarIconFound"] is False
    assert noncurrent_home["homeSelected"] is False


def test_desktop_artwork_probe_mutation_to_exact_one_rejects_duplicate_sidebar_clones():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()
    mutated = probe.replace(
        "const sidebarIcons = imageCandidates.filter(isSidebarIcon);",
        "const sidebarIcons = uniqueCells.length === 1 ? imageCandidates.filter(isSidebarIcon) : [];",
        1,
    )
    assert mutated != probe

    payload = _run_desktop_artwork_probe(
        mutated,
        cells=[_desktop_cell(_desktop_image()), _desktop_cell(_desktop_image())],
    )

    assert payload["matchingCellCount"] == 2
    assert payload["customSidebarIconFound"] is False


def test_artwork_identity_probe_waits_past_five_seconds_within_its_fixed_deadline():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()

    hydrated = _run_artwork_identity_probe(probe, hydration_delay_ms=5250)

    assert hydrated["iconResolved"] is True
    assert hydrated["elapsedMs"] == 5250
    assert hydrated["iconDeadlineMs"] == 15000
    assert hydrated["iconAttempts"] == 22

    five_second_deadline = probe.replace(
        "const ICON_HYDRATION_DEADLINE_MS = 15000;",
        "const ICON_HYDRATION_DEADLINE_MS = 5000;",
    )
    too_short = _run_artwork_identity_probe(five_second_deadline, hydration_delay_ms=5250)
    assert too_short["iconResolved"] is False
    assert too_short["elapsedMs"] == 5000


def test_artwork_identity_probe_stops_an_unresolved_icon_at_the_exact_deadline():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_artwork_identity.js").read_text()

    unresolved = _run_artwork_identity_probe(probe, hydration_delay_ms=None)

    assert unresolved["iconResolved"] is False
    assert unresolved["iconRequestError"] is False
    assert unresolved["elapsedMs"] == 15000
    assert unresolved["iconDeadlineMs"] == 15000
    assert unresolved["iconAttempts"] == 61


def _artwork_file_hashes(count: int = 6) -> list[str]:
    return [f"{index:064x}" for index in range(count)]


def _write_artwork_identity_smoke_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "fixture"
    verify = root / "scripts/deck/verify"
    verify.mkdir(parents=True)
    smoke = verify / "smoke_artwork_identity.sh"
    smoke.write_text(
        (Path(__file__).parents[1] / "scripts/deck/verify/smoke_artwork_identity.sh").read_text(),
        encoding="utf-8",
    )
    (verify / "_lib.sh").write_text(
        """#!/usr/bin/env bash
set -euo pipefail
DECK_DIR=\"$(cd -- \"$(dirname -- \"${BASH_SOURCE[0]}\")/..\" && pwd)\"
JS_DIR=\"$DECK_DIR/js\"
cdp() { python3 \"$DECK_DIR/cdp.py\" \"$@\"; }
pass() { echo \"PASS: $*\"; }
fail() { echo \"FAIL: $*\" >&2; exit 1; }
""",
        encoding="utf-8",
    )
    deck = root / "scripts/deck"
    (deck / "js").mkdir(exist_ok=True)
    (deck / "js/check_artwork_identity.js").write_text("// fake transport ignores the source\n")
    (deck / "cdp.py").write_text(
        """import json
import os
import sys
from pathlib import Path

log = Path(os.environ[\"FAKE_ARTWORK_LOG\"])
target = sys.argv[2]
log.write_text(log.read_text() + f\"cdp:{target}\\n\" if log.exists() else f\"cdp:{target}\\n\")
identity_payload = {
    \"routeScope\": \"library-home\",
    \"shortcutAppId\": 2155012430,
    \"matchedAppId\": 55150,
    \"requestedObjectAppId\": 2155012430,
    \"matchedObjectAppId\": 2155012430,
    \"aliasSameObject\": True,
    \"appType\": 1073741824,
    \"isShortcut\": True,
    \"isModOrShortcut\": True,
    \"iconHashPresent\": False,
    \"iconDataPresent\": False,
    \"iconResolved\": True,
    \"iconValueHash\": \"1234abcd\",
    \"iconRequestError\": False,
    \"iconAttempts\": 2,
    \"iconDeadlineMs\": 15000,
    \"artwork\": {kind: {\"count\": 0, \"hashes\": []} for kind in (\"vertical\", \"landscape\", \"hero\", \"logo\")},
    \"elapsedMs\": 20,
}
desktop_payload = {
    \"homeSelected\": True,
    \"labelHashValid\": True,
    \"matchingCellCount\": 2,
    \"completeImageCount\": 4,
    \"customImageCount\": 4,
    \"portraitCandidateCount\": 2,
    \"customSidebarIconCount\": 2,
    \"customSidebarIconFound\": True,
    \"completeImageDimensions\": [[32, 32, 32, 32], [32, 32, 32, 32], [600, 900, 160, 240], [600, 900, 160, 240]],
}
if target == \"Steam\":
    supplied_hash = next((value.split(\"=\", 1)[1] for value in sys.argv if value.startswith(\"SIDEBAR_LABEL_HASH=\")), \"\")
    if supplied_hash != \"10203040\":
        desktop_payload.update({\"matchingCellCount\": 0, \"completeImageCount\": 0, \"customImageCount\": 0, \"portraitCandidateCount\": 0, \"customSidebarIconCount\": 0, \"customSidebarIconFound\": False, \"completeImageDimensions\": []})
    desktop_payload.update(json.loads(os.environ.get(\"FAKE_DESKTOP_PAYLOAD_OVERRIDES\", \"{}\")))
    payload = desktop_payload
else:
    identity_payload.update(json.loads(os.environ.get(\"FAKE_ARTWORK_PAYLOAD_OVERRIDES\", \"{}\")))
    payload = identity_payload
print(json.dumps(payload))
""",
        encoding="utf-8",
    )
    bin_dir = root / "bin"
    bin_dir.mkdir()
    fake_ssh = bin_dir / "ssh"
    fake_ssh.write_text(
        """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

log = Path(os.environ[\"FAKE_ARTWORK_LOG\"])
log.write_text(log.read_text() + \"ssh\\n\" if log.exists() else \"ssh\\n\")
shortcut = int(sys.argv[-1])
hashes = sorted(filter(None, os.environ[\"FAKE_ARTWORK_HASHES\"].split(",")))
print(json.dumps({\"shortcutAppId\": shortcut, \"fileCount\": len(hashes), \"fileHashes\": hashes}, sort_keys=True))
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    return smoke


def _artwork_smoke_evidence_path(tmp_path: Path) -> Path:
    evidence = Path("/tmp/Decky-Metadata/pytest-artwork-identity") / tmp_path.name / "evidence"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    return evidence


def _run_artwork_identity_smoke(
    tmp_path: Path,
    after_hashes: list[str],
    *,
    payload_overrides: dict | None = None,
    desktop_payload_overrides: dict | None = None,
    sidebar_label_hash: str = "10203040",
    smoke_source: str | None = None,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    smoke = _write_artwork_identity_smoke_fixture(tmp_path)
    if smoke_source is not None:
        smoke.write_text(smoke_source, encoding="utf-8")
    evidence = _artwork_smoke_evidence_path(tmp_path)
    before_manifest = evidence.parent / "before-artwork-files.json"
    before_manifest.write_text(
        json.dumps(
            {"shortcutAppId": 2155012430, "fileCount": 6, "fileHashes": _artwork_file_hashes()},
            sort_keys=True,
        )
        + "\n"
    )
    log = tmp_path / "artwork-smoke.log"
    completed = subprocess.run(
        [
            "bash", str(smoke), "2155012430", "55150", "library-home", "true",
            str(before_manifest), str(evidence), sidebar_label_hash,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
        env={
            **os.environ,
            "PATH": f"{smoke.parents[3] / 'bin'}:{os.environ['PATH']}",
            "FAKE_ARTWORK_LOG": str(log),
            "FAKE_ARTWORK_HASHES": ",".join(after_hashes),
            "FAKE_ARTWORK_PAYLOAD_OVERRIDES": json.dumps(payload_overrides or {}),
            "FAKE_DESKTOP_PAYLOAD_OVERRIDES": json.dumps(desktop_payload_overrides or {}),
        },
    )
    return completed, evidence, log


def test_artwork_identity_smoke_accepts_zero_candidates_when_six_file_hashes_match(tmp_path: Path):
    completed, evidence, log = _run_artwork_identity_smoke(tmp_path, _artwork_file_hashes())

    assert completed.returncode == 0, completed.stderr
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam", "ssh"]
    assert json.loads((evidence / "desktop-library-home.json").read_text()) == {
        "completeImageCount": 4,
        "completeImageDimensions": [[32, 32, 32, 32], [32, 32, 32, 32], [600, 900, 160, 240], [600, 900, 160, 240]],
        "customImageCount": 4,
        "customSidebarIconCount": 2,
        "customSidebarIconFound": True,
        "homeSelected": True,
        "labelHashValid": True,
        "matchingCellCount": 2,
        "portraitCandidateCount": 2,
    }


def test_artwork_identity_smoke_uses_validated_desktop_home_when_shared_context_has_no_route(tmp_path: Path):
    completed, evidence, log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        payload_overrides={"routeScope": "other"},
    )

    assert completed.returncode == 0, completed.stderr
    assert json.loads((evidence / "artwork-identity.json").read_text())["routeScope"] == "other"
    assert json.loads((evidence / "desktop-library-home.json").read_text())["homeSelected"] is True
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam", "ssh"]
    assert json.loads((evidence / "artwork-file-comparison.json").read_text()) == {
        "afterFileCount": 6,
        "beforeFileCount": 6,
        "fileHashSetUnchanged": True,
        "shortcutAppId": 2155012430,
    }


def test_artwork_identity_smoke_accepts_unresolved_icon_without_a_request_error(tmp_path: Path):
    completed, evidence, log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        payload_overrides={"iconResolved": False, "iconValueHash": None},
    )

    assert completed.returncode == 0, completed.stderr
    assert "bounded icon diagnostics" in completed.stdout
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam", "ssh"]
    assert json.loads((evidence / "artwork-identity.json").read_text())["iconResolved"] is False


def _artwork_candidate_payload() -> dict[str, dict[str, list[str] | int]]:
    return {kind: {"count": 0, "hashes": []} for kind in ("vertical", "landscape", "hero", "logo")}


@pytest.mark.parametrize(
    ("payload_overrides", "failure"),
    [
        ({"iconRequestError": True}, "icon resolver request failed"),
        ({"isModOrShortcut": False}, "shortcut identity does not match"),
        ({"routeScope": "current-detail"}, "route scope 'current-detail', expected 'library-home'"),
        (
            {
                "artwork": {
                    **_artwork_candidate_payload(),
                    "vertical": {"count": 1, "hashes": ["not-a-hash"]},
                }
            },
            "malformed vertical artwork hash",
        ),
    ],
)
def test_artwork_identity_smoke_rejects_invalid_identity_or_diagnostic_payload(
    tmp_path: Path, payload_overrides: dict, failure: str
):
    completed, _evidence, log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        payload_overrides=payload_overrides,
    )

    assert completed.returncode != 0
    assert failure in completed.stderr
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam"]


def test_artwork_identity_smoke_mutation_makes_unresolved_icon_fail(tmp_path: Path):
    source = (Path(__file__).parents[1] / "scripts/deck/verify/smoke_artwork_identity.sh").read_text()
    mutated = source.replace(
        'if data["iconRequestError"]:\n',
        'if data["iconRequestError"] or not data["iconResolved"]:\n',
        1,
    )
    assert mutated != source

    completed, _evidence, _log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        payload_overrides={"iconResolved": False, "iconValueHash": None},
        smoke_source=mutated,
    )

    assert completed.returncode != 0
    assert "icon resolver request failed" in completed.stderr


@pytest.mark.parametrize(
    ("after_hashes", "failure"),
    [
        (_artwork_file_hashes(5), "artwork file count changed"),
        (_artwork_file_hashes(5) + ["f" * 64], "artwork file hash set changed"),
    ],
)
def test_artwork_identity_smoke_rejects_missing_or_changed_artwork_file_hashes(
    tmp_path: Path, after_hashes: list[str], failure: str
):
    completed, evidence, log = _run_artwork_identity_smoke(tmp_path, after_hashes)

    assert completed.returncode != 0
    assert failure in completed.stderr
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam", "ssh"]
    assert not (evidence / "artwork-file-comparison.json").exists()


def test_artwork_identity_smoke_rejects_equal_ids_before_tunnel_cdp_or_evidence(tmp_path: Path):
    smoke = _write_artwork_identity_smoke_fixture(tmp_path)
    evidence = _artwork_smoke_evidence_path(tmp_path)
    log = tmp_path / "artwork-equal-ids.log"
    completed = subprocess.run(
        ["bash", str(smoke), "2155012430", "2155012430", "library-home", "true", "missing.json", str(evidence), "10203040"],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
        env={**os.environ, "FAKE_ARTWORK_LOG": str(log)},
    )

    assert completed.returncode != 0
    assert "shortcut and matched appids must differ" in completed.stderr
    assert not log.exists()
    assert not evidence.exists()


@pytest.mark.parametrize(
    ("desktop_payload_overrides", "failure"),
    [
        ({"homeSelected": False}, "Desktop Library Home is not selected"),
        ({"matchingCellCount": 0}, "Desktop Library Home row is missing"),
        ({"customSidebarIconCount": 0, "customSidebarIconFound": False}, "Desktop Library Home custom sidebar icon is missing"),
        ({"completeImageDimensions": [[32, 32, 0, 32]]}, "malformed Desktop Library complete image dimensions"),
        ({"unexpected": "opaque"}, "malformed Desktop Library payload"),
    ],
)
def test_artwork_identity_smoke_rejects_invalid_desktop_library_home_evidence(
    tmp_path: Path, desktop_payload_overrides: dict, failure: str
):
    completed, _evidence, log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        desktop_payload_overrides=desktop_payload_overrides,
    )

    assert completed.returncode != 0
    assert failure in completed.stderr
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam"]


def test_artwork_identity_smoke_rejects_a_valid_but_wrong_desktop_row_label_hash(tmp_path: Path):
    completed, _evidence, log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        sidebar_label_hash="deadbeef",
    )

    assert completed.returncode != 0
    assert "Desktop Library Home row is missing" in completed.stderr
    assert log.read_text().splitlines() == ["cdp:SharedJSContext", "cdp:Steam"]


def test_artwork_identity_smoke_rejects_malformed_desktop_row_label_hash_before_cdp(tmp_path: Path):
    completed, _evidence, log = _run_artwork_identity_smoke(
        tmp_path,
        _artwork_file_hashes(),
        sidebar_label_hash="not-a-hash",
    )

    assert completed.returncode != 0
    assert "sidebar label hash must be an eight-character lowercase hex value" in completed.stderr
    assert not log.exists()


def test_controller_layout_probe_is_bounded_cache_populating_and_hashes_layout_identities():
    root = Path(__file__).parents[1]
    probe_path = root / "scripts/deck/js/check_controller_layouts.js"
    probe = probe_path.read_text()

    assert "globalThis.ControllerStore" in probe
    assert "globalThis.controllerStore" in probe
    assert "const controllerListStore" in probe
    assert 'typeof controllerListStore?.GetControllers !== "function"' in probe
    assert 'throw new Error("controller list unavailable")' in probe
    assert "controllerListStore.GetControllers()" in probe
    assert "Number.isInteger(controllerType)" in probe
    assert 'typeof filterOtherControllerTypes !== "boolean"' in probe
    serialized_payload = probe.rsplit("return JSON.stringify({", 1)[1]
    assert re.search(r"^    controllerType,$", serialized_payload, re.MULTILINE)
    assert re.search(r"^    filterOtherControllerTypes,$", serialized_payload, re.MULTILINE)
    assert "controllerConfiguratorStore.QueryConfigsForApp" in probe
    assert "GetOfficialConfigsForApp" in probe
    assert "GetTemplateConfigsForApp" in probe
    assert "GetWorkshopConfigsForApp" in probe
    assert "GetAllConfigs" in probe
    assert "SECOND_DISPLAY_APPID" in probe
    assert "SECOND_SOURCE_APPID" in probe
    assert "THIRD_DISPLAY_APPID" in probe
    assert "m_mapAppConfigs.has(sourceAppid)" in probe
    assert "m_mapAppConfigs.has(secondSourceAppid)" in probe
    assert "firstSourceCount" in probe
    assert "secondSourceCount" in probe
    assert "firstDisplayedCount" in probe
    assert "secondDisplayedCount" in probe
    assert "thirdDisplayedCount" in probe
    assert "elapsedMs" in probe
    assert "BConfigurationQueryInFlight" in probe
    assert "urlHashes" in probe
    assert "URL:" not in probe

    forbidden_mutators = (
        "SetSelectedConfigForApp",
        "PreviewConfigForAppAndController",
        "ClearSelectedConfigForApp",
        "ExportCurrentControllerConfiguration",
        "DeletePersonalControllerConfiguration",
        "StartEditingControllerConfiguration",
        "SaveEditingControllerConfiguration",
        "SetEditingControllerConfiguration",
        "save_metadata",
        "remove_metadata",
        "reload",
        "navigate",
        "launch",
        "m_mapAppConfigs.set",
        "m_mapAppConfigs.delete",
        "m_mapAppConfigs.clear",
        "m_mapAppConfigs.entries",
        "m_mapAppConfigs.keys",
        "m_mapAppConfigs.values",
        "m_mapAppConfigs.forEach",
    )
    for mutator in forbidden_mutators:
        assert mutator not in probe


def test_controller_layout_smoke_reuses_semantic_fixtures_and_no_launch_suite():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_controller_layouts.sh").read_text()
    run_all = (root / "scripts/deck/verify/run_all.sh").read_text()

    assert 'fixtures="${1:?usage:' in smoke
    assert 'f["listed_match"]' in smoke
    assert 'f["delisted_match"]' in smoke
    assert 'f["never_on_steam"]' in smoke
    assert "sourceCompared" in smoke
    assert "Community results are empty" in smoke
    assert "duplicate Community layout identities" in smoke
    assert "Recommended" in smoke
    assert "Official" in smoke
    assert 'SECOND_DISPLAY_APPID=${3:-}' in smoke
    assert 'SECOND_SOURCE_APPID=${4:-}' in smoke
    assert 'THIRD_DISPLAY_APPID=${5:-}' in smoke
    assert '"$delisted_appid" "$delisted_source"' in smoke
    assert '"$never_appid"' in smoke
    assert 'isolation["deferred"]' not in smoke
    assert 'field(isolation, "afterSecond"' in smoke
    assert 'field(isolation, "afterThird"' in smoke
    assert 'field(after_second, "firstDisplayedCount"' in smoke
    assert 'field(after_second, "firstSourceCount"' in smoke
    assert 'field(after_second, "secondDisplayedCount"' in smoke
    assert 'field(after_second, "secondSourceCount"' in smoke
    assert 'field(after_third, "thirdDisplayedCount"' in smoke
    assert "elapsedMs" in smoke
    assert "including pre-existing caches" in smoke
    assert "Bounded no-selection controller-configuration cache-populating check." in smoke
    assert "Read-only matched controller-configuration discovery check." not in smoke
    assert 'smoke_controller_layouts.sh" "$run_dir/fixtures.json"' in run_all
    assert "if ((no_launch)); then" in run_all
    assert "use --no-launch for bounded cache-populating verification" in run_all
    assert "use --no-launch for read-only verification" not in run_all


def test_controller_tab_persistence_probe_and_smoke_are_bounded_and_output_safe():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    smoke = (root / "scripts/deck/verify/smoke_controller_tab_persistence.sh").read_text()
    run_all = (root / "scripts/deck/verify/run_all.sh").read_text()

    assert "DISPLAY_APPID" in probe
    assert "SOURCE_APPID" in probe
    assert "QueryControllerConfigsForApp" in probe
    assert "BConfigurationQueryInFlight" in probe
    _assert_controller_tab_probe_payload_contract(probe)
    assert "m_bFilterOtherControllerTypes" in probe
    assert "finally" in probe
    assert "SharedJSContext" in smoke
    assert "Steam Big Picture Mode" in smoke
    assert "DISPLAY_APPID" in smoke
    assert "SOURCE_APPID" in smoke
    _assert_controller_tab_smoke_contract(smoke)
    assert "active tab changes unexpectedly" in smoke
    assert "/tmp/Decky-Metadata/" in smoke
    assert "smoke_controller_tab_persistence.sh" not in run_all

    forbidden = (
        "SetSelectedConfigForApp",
        "PreviewConfigForAppAndController",
        "ApplyConfig",
        "StartEditingControllerConfiguration",
        "SaveEditingControllerConfiguration",
        "RunGame",
        "run-game",
        "cdp.py input",
        "Navigation.Navigate",
        "location.href",
        "URL:",
        "accountName",
    )
    for token in forbidden:
        assert token not in probe
        assert token not in smoke


def test_controller_tab_probe_contract_rejects_missing_payload_fields_and_raw_identities():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()

    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace("selectedTab: selected.snapshot.selectedTab,", "", 1)
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace("urlHashes: identities.map(hash)", "hashes: identities.map(hash)", 1)
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace("elapsedMs: Date.now() - startedAt,", "identities: [],", 1)
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace(
                "if (stableSamples >= 3) {\n          after = candidate;",
                "if (stableSamples >= 1) {\n          after = candidate;",
                1,
            )
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace(
                'if (element === content || !element.classList.contains("Panel")) continue;',
                'if (element === content || !element.classList.contains("Panel") ||\n'
                '          !element.classList.contains("Focusable")) continue;',
                1,
            )
        )


def _run_controller_tab_query_probe(probe: str, replacement_delay_ms: int | None):
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    delayed_replacement = (
        f"setTimeout(() => {{ entry = {{ generation: 2 }}; records = [{{ URL: \"layout://one\" }}, {{ URL: \"layout://two\" }}]; }}, {replacement_delay_ms});"
        if replacement_delay_ms is not None
        else ""
    )
    runner = f"""
const first = {{ generation: 1 }};
let entry = first;
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{ {delayed_replacement} }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    return subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )


def test_controller_tab_query_probe_waits_for_delayed_cache_replacement_and_times_out_without_one():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()

    delayed = _run_controller_tab_query_probe(probe, replacement_delay_ms=75)
    assert delayed.returncode == 0, delayed.stderr
    payload = json.loads(delayed.stdout)
    assert payload["cacheReplaced"] is True
    assert payload["cacheUpdated"] is True
    assert payload["elapsedMs"] >= 50
    assert payload["after"]["getterCount"] == 2
    assert payload["stableSamples"] >= 3

    short_timeout = probe.replace("const deadline = Date.now() + 15000;", "const deadline = Date.now() + 50;")
    missing = _run_controller_tab_query_probe(short_timeout, replacement_delay_ms=None)
    assert missing.returncode != 0
    assert "controller query result did not settle" in missing.stderr


def test_controller_tab_query_probe_accepts_an_expanded_result_when_steam_keeps_cache_identity():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
        .replace("const deadline = Date.now() + 15000;", "const deadline = Date.now() + 1000;")
    )
    runner = f"""
const entry = {{ generation: 1 }};
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{
    setTimeout(() => {{ records = [{{ URL: "layout://one" }}, {{ URL: "layout://two" }}]; }}, 75);
  }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    completed = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["cacheUpdated"] is False
    assert payload["resultSettled"] is True
    assert payload["after"]["getterCount"] == 2


def test_controller_tab_query_probe_accepts_a_delayed_in_place_cache_mutation():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    runner = f"""
const entry = {{ generation: 1 }};
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{ setTimeout(() => {{ entry.generation = 2; records = [{{ URL: "layout://one" }}, {{ URL: "layout://two" }}]; }}, 75); }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    mutated = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert mutated.returncode == 0, mutated.stderr
    payload = json.loads(mutated.stdout)
    assert payload["cacheReplaced"] is False
    assert payload["cacheMutated"] is True
    assert payload["cacheUpdated"] is True
    assert payload["after"]["getterCount"] == 2


def test_controller_tab_query_probe_ignores_an_early_unrelated_cache_mutation_until_expanded_result_settles():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    runner = f"""
const entry = {{ generation: 1 }};
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{
    setTimeout(() => {{ entry.generation = 2; }}, 25);
    setTimeout(() => {{
      entry.generation = 3;
      records = [{{ URL: "layout://one" }}, {{ URL: "layout://two" }}];
    }}, 250);
  }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    completed = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["after"]["getterCount"] == 2
    assert payload["after"]["urlHashes"] != payload["before"]["urlHashes"]
    assert payload["stableSamples"] >= 3
    assert payload["elapsedMs"] >= 350


def test_controller_tab_filter_restore_probe_restores_the_original_visible_filter():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"restore-filter"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
        .replace('"__RESTORE_FILTER__"', '"false"')
    )
    runner = f"""
const calls = [];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  GetWorkshopConfigsForApp: () => [],
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: (...args) => calls.push(args),
}} }};
{source}.then((payload) => process.stdout.write(JSON.stringify({{
  payload: JSON.parse(payload),
  calls,
}}))).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    restored = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert restored.returncode == 0, restored.stderr
    result = json.loads(restored.stdout)
    payload = result["payload"]
    assert payload["restoredFilter"] is False
    assert payload["restorationQueryIssued"] is True
    assert payload["controllerIndex"] == 0
    assert result["calls"] == [[3213262460, 0, False]]


def test_controller_tab_filter_capture_probe_reads_the_original_visible_filter_without_querying():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"capture-filter"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    runner = f"""
globalThis.controllerConfiguratorStore = {{ m_bFilterOtherControllerTypes: true }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    captured = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert captured.returncode == 0, captured.stderr
    assert json.loads(captured.stdout)["originalFilter"] is True


def _write_controller_tab_smoke_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "fixture"
    verify = root / "scripts/deck/verify"
    verify.mkdir(parents=True)
    smoke_source = (
        Path(__file__).parents[1] / "scripts/deck/verify/smoke_controller_tab_persistence.sh"
    ).read_text(encoding="utf-8")
    smoke = verify / "smoke_controller_tab_persistence.sh"
    smoke.write_text(smoke_source, encoding="utf-8")
    (verify / "_lib.sh").write_text(
        """#!/usr/bin/env bash
set -euo pipefail
DECK_DIR=\"$(cd -- \"$(dirname -- \"${BASH_SOURCE[0]}\")/..\" && pwd)\"
JS_DIR=\"$DECK_DIR/js\"
cdp() { python3 \"$DECK_DIR/cdp.py\" \"$@\"; }
pass() { echo \"PASS: $*\"; }
fail() { echo \"FAIL: $*\" >&2; exit 1; }
""",
        encoding="utf-8",
    )
    deck = root / "scripts/deck"
    (deck / "js").mkdir(exist_ok=True)
    (deck / "js/check_controller_tab_persistence.js").write_text("// fake transport ignores the source\n")
    (deck / "cdp.py").write_text(
        """import json
import os
import sys
from pathlib import Path

variables = dict(
    value.split("=", 1) for value in sys.argv if "=" in value and not value.startswith("@")
)
phase = variables["PHASE"]
log = Path(os.environ["FAKE_CDP_LOG"])
log.write_text(log.read_text() + phase + "\\n" if log.exists() else phase + "\\n")
filter_state = Path(os.environ["FAKE_FILTER_STATE"])
if phase == "capture-filter":
    print(json.dumps({"originalFilter": filter_state.read_text() == "true"}))
elif phase == "dom-select":
    if os.environ.get("FAKE_CDP_MODE") == "select-fail":
        raise SystemExit("dom-select transport failed")
    print(json.dumps({
        "originalSelectedTab": {"label": "Your Layouts"},
        "selectedTab": {"label": "Community Layouts"},
        "tabs": [
            {"label": "Templates"},
            {"label": "Community Layouts"},
            {"label": "Search"},
        ],
        "renderedCount": 1,
    }))
elif phase == "query":
    filter_state.write_text("false")
    if os.environ.get("FAKE_CDP_MODE") != "success":
        raise SystemExit("query transport failed")
    getter_count = int(os.environ.get("FAKE_GETTER_COUNT", "52"))
    before_hashes = [f"before-{index}" for index in range(15)]
    hashes = before_hashes + [f"after-{index}" for index in range(max(0, getter_count - 15))]
    print(json.dumps({
        "controllerType": int(os.environ.get("FAKE_CONTROLLER_TYPE", "4")),
        "controllerIndex": 0,
        "filterDuringQuery": False,
        "resultSettled": True,
        "before": {"getterCount": len(before_hashes), "urlHashes": before_hashes},
        "after": {"getterCount": getter_count, "urlHashes": hashes},
    }))
elif phase == "dom-observe":
    print(json.dumps({
        "selectedTab": {"label": os.environ.get("FAKE_AFTER_TAB", "Community Layouts")},
        "tabs": [
            {"label": "Templates"},
            {"label": "Community Layouts"},
            {"label": "Search"},
        ],
        "renderedCount": int(os.environ.get("FAKE_RENDERED_AFTER", "24")),
    }))
elif phase == "restore-filter":
    filter_state.write_text(variables["RESTORE_FILTER"])
    print(json.dumps({
        "restoredFilter": variables["RESTORE_FILTER"] == "true",
        "restorationQueryIssued": True,
    }))
elif phase == "dom-restore":
    print(json.dumps({"selectedTab": {"label": variables["RESTORE_TAB"]}}))
else:
    raise SystemExit(f"unexpected phase: {phase}")
""",
        encoding="utf-8",
    )
    return smoke


def _run_controller_tab_smoke_with_failed_transport(
    tmp_path: Path,
    evidence: Path,
    mode: str | None = None,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    smoke = _write_controller_tab_smoke_fixture(tmp_path)
    log = tmp_path / "cdp.log"
    filter_state = tmp_path / "filter-state"
    filter_state.write_text("true")
    environment = {
        "FAKE_CDP_LOG": str(log),
        "FAKE_FILTER_STATE": str(filter_state),
    }
    if mode is not None:
        environment["FAKE_CDP_MODE"] = mode
    completed = subprocess.run(
        ["bash", str(smoke), "3213262460", "55150", "102", str(evidence)],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
        env={**os.environ, **environment},
    )
    return completed, log, filter_state


def _controller_tab_smoke_evidence_path(tmp_path: Path) -> Path:
    evidence = (
        Path("/tmp/Decky-Metadata/pytest-controller-tab-smoke")
        / tmp_path.name
        / "tab-persistence.json"
    )
    evidence.parent.mkdir(parents=True, exist_ok=True)
    return evidence


def test_controller_tab_smoke_restores_filter_when_query_transport_fails(tmp_path: Path):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)
    completed, log, filter_state = _run_controller_tab_smoke_with_failed_transport(tmp_path, evidence)

    assert completed.returncode != 0
    assert filter_state.read_text() == "true"
    assert log.read_text().splitlines() == [
        "capture-filter",
        "dom-select",
        "query",
        "restore-filter",
        "dom-restore",
    ]
    assert json.loads(evidence.read_text())["status"] != "passed"


def test_controller_tab_smoke_invalidates_prior_passing_evidence_before_dom_select(tmp_path: Path):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)
    evidence.write_text('{"status":"passed"}\n')
    completed, log, _filter_state = _run_controller_tab_smoke_with_failed_transport(
        tmp_path,
        evidence,
        mode="select-fail",
    )

    assert completed.returncode != 0
    assert log.read_text().splitlines() == ["capture-filter", "dom-select", "restore-filter"]
    assert json.loads(evidence.read_text())["status"] != "passed"


def test_controller_tab_smoke_contract_rejects_early_pass_before_tab_restoration():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_controller_tab_persistence.sh").read_text()
    restore = 'restore_json="$(probe "Steam Big Picture Mode" "dom-restore" "$original_tab")"'

    with pytest.raises(AssertionError):
        _assert_controller_tab_smoke_contract(smoke.replace(restore, "", 1))


def _run_controller_tab_smoke_with_virtualized_fixture(
    tmp_path: Path,
    evidence: Path,
    *,
    after_tab: str = "Community Layouts",
    rendered_after: int = 24,
    getter_count: int = 52,
    strict_count_equality: bool = False,
) -> subprocess.CompletedProcess[str]:
    smoke = _write_controller_tab_smoke_fixture(tmp_path)
    if strict_count_equality:
        source = smoke.read_text(encoding="utf-8")
        smoke.write_text(
            source.replace("rendered_after > getter_count", "getter_count != rendered_after", 1),
            encoding="utf-8",
        )
    log = tmp_path / "virtualized-cdp.log"
    filter_state = tmp_path / "virtualized-filter-state"
    filter_state.write_text("true")
    return subprocess.run(
        ["bash", str(smoke), "2155012430", "55150", "4", str(evidence)],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
        env={
            **os.environ,
            "FAKE_CDP_LOG": str(log),
            "FAKE_CDP_MODE": "success",
            "FAKE_FILTER_STATE": str(filter_state),
            "FAKE_AFTER_TAB": after_tab,
            "FAKE_RENDERED_AFTER": str(rendered_after),
            "FAKE_GETTER_COUNT": str(getter_count),
            "FAKE_CONTROLLER_TYPE": "4",
        },
    )


def test_controller_tab_smoke_accepts_virtualized_steam_deck_community_rows(tmp_path: Path):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)

    completed = _run_controller_tab_smoke_with_virtualized_fixture(tmp_path, evidence)

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(evidence.read_text())
    assert payload["status"] == "passed"
    assert payload["getterCount"] == 52
    assert payload["renderedAfter"] == 24
    assert payload["renderCoverage"] == "virtualized"


@pytest.mark.parametrize(
    ("after_tab", "rendered_after", "getter_count", "failure"),
    [
        ("Your Layouts", 24, 52, "active tab changes unexpectedly"),
        ("Community Layouts", 0, 52, "Community rows are empty"),
        ("Community Layouts", 53, 52, "Community getter and rendered counts disagree"),
    ],
)
def test_controller_tab_smoke_rejects_invalid_virtualized_community_evidence(
    tmp_path: Path,
    after_tab: str,
    rendered_after: int,
    getter_count: int,
    failure: str,
):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)

    completed = _run_controller_tab_smoke_with_virtualized_fixture(
        tmp_path,
        evidence,
        after_tab=after_tab,
        rendered_after=rendered_after,
        getter_count=getter_count,
    )

    assert completed.returncode != 0
    assert failure in completed.stderr
    assert json.loads(evidence.read_text())["status"] == "pending-validation"


def test_controller_tab_smoke_virtualized_fixture_rejects_strict_count_equality(tmp_path: Path):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)

    completed = _run_controller_tab_smoke_with_virtualized_fixture(
        tmp_path,
        evidence,
        strict_count_equality=True,
    )

    assert completed.returncode != 0
    assert "Community getter and rendered counts disagree" in completed.stderr
