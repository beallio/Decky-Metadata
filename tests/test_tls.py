from __future__ import annotations

import ssl
from pathlib import Path

import main


def test_build_https_context_verifies_certificates() -> None:
    context = main._build_https_context()

    assert isinstance(context, ssl.SSLContext)
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED


def test_main_does_not_disable_tls_verification() -> None:
    source = Path(main.__file__).read_text(encoding="utf-8")

    assert "_create_unverified_context" not in source
