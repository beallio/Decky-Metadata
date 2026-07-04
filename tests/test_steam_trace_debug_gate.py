from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STEAM_TS = ROOT / "src" / "steam.ts"


def test_diagnostic_traces_are_installed_only_when_debug_logging_is_enabled():
    source = STEAM_TS.read_text()

    backend_import_start = source.index("from \"./backend\";")
    backend_import_block = source[:backend_import_start]
    assert "getDebugLogging" in backend_import_block
    assert "getDebugLogging()" in source
    assert ".catch((error) => {" in source
    assert "debug logging setting load failed; diagnostic traces disabled" in source
    assert "if (!debugLoggingEnabled) return;" in source

    guard_start = source.index("if (!debugLoggingEnabled) return;")
    history_patch_start = source.index('log.warn("patch", "history patch skipped"', guard_start)
    guarded_trace_block = source[guard_start:history_patch_start]

    assert 'safeInstallStep("navigationTrace", () => installNavigationTrace(unpatchers));' in guarded_trace_block
    assert 'safeInstallStep("historyInstanceTrace", () => installHistoryInstanceTrace(unpatchers));' in guarded_trace_block
    assert 'safeInstallStep("clickTrace", () => installClickTrace(unpatchers));' in guarded_trace_block


def test_non_trace_patches_remain_unconditional():
    source = STEAM_TS.read_text()
    required_steps = [
        "unmatchedAppLinksHider",
        "nativeActivityStorePatch",
        "nativePartnerEventStorePatch",
        "steamNavigationRedirect",
        "mainWindowHistoryRedirect",
    ]

    for label in required_steps:
        step = f'safeInstallStep("{label}"'
        assert step in source
        step_position = source.index(step)
        assert source.rfind("if (!debugLoggingEnabled) return;", 0, step_position) == -1
