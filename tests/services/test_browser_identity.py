from backend.services.utils.user_agents import build_chromium_identity


def test_runtime_chromium_version_drives_the_complete_desktop_identity():
    identity = build_chromium_identity("142.0.7100.12")
    headers = identity.extra_http_headers()

    assert "Chrome/142.0.7100.12" in identity.user_agent
    assert identity.viewport == {"width": 1440, "height": 900}
    assert identity.is_mobile is False
    assert identity.has_touch is False
    assert 'v="142"' in headers["sec-ch-ua"]
    assert headers["sec-ch-ua-mobile"] == "?0"
    assert headers["sec-ch-ua-platform"] == '"Windows"'


def test_custom_mobile_chromium_identity_keeps_headers_and_device_shape_coherent():
    user_agent = (
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"
    )
    identity = build_chromium_identity("142.0.7100.12", user_agent)
    headers = identity.extra_http_headers()

    assert identity.is_mobile is True
    assert identity.has_touch is True
    assert identity.viewport == {"width": 412, "height": 915}
    assert headers["sec-ch-ua-mobile"] == "?1"
    assert headers["sec-ch-ua-platform"] == '"Android"'
    assert 'v="141"' in headers["sec-ch-ua"]


def test_non_chromium_custom_identity_does_not_forge_client_hints():
    identity = build_chromium_identity(
        "142.0.7100.12",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
    )

    assert identity.chromium_major is None
    assert "sec-ch-ua" not in identity.extra_http_headers()
