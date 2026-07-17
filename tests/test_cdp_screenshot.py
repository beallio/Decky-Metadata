import base64

import pytest

from scripts.deck.cdp import decode_screenshot_data


def test_decode_screenshot_data_returns_exact_bytes():
    expected = b"\x89PNG\r\n\x1a\nexample"

    assert decode_screenshot_data(base64.b64encode(expected).decode("ascii")) == expected


@pytest.mark.parametrize("payload", [None, ""])
def test_decode_screenshot_data_rejects_missing_payload(payload):
    with pytest.raises(ValueError, match="no screenshot data"):
        decode_screenshot_data(payload)
