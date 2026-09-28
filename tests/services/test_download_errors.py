import pytest

from backend.services.download_errors import (
    DownloadExtractionError,
    YtDlpErrorCapture,
    classify_download_error,
)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("HTTP Error 403: Forbidden", "access_denied"),
        ("HTTP Error 429: Too Many Requests. Use cookies to sign in.", "rate_limited"),
        (
            "Sign in to confirm you’re not a bot. Use --cookies for authentication.",
            "bot_check",
        ),
        ("ERROR: Failed to decrypt with DPAPI", "cookie_read_failed"),
        ("Could not copy Chrome cookie database", "cookie_read_failed"),
        ("407 Proxy Authentication Required", "proxy"),
        ("Private video. Sign in if you've been granted access.", "auth_required"),
        ("No supported JavaScript runtime could be found", "youtube_runtime"),
        ("No formats: YouTube is forcing SABR streaming", "youtube_playback"),
    ],
)
def test_distinguishes_playback_and_transport_failures_from_login(message, expected):
    result = classify_download_error(message, url="https://youtu.be/abc")
    assert result.code == expected
    assert result.cookie_domain == (
        "youtube.com" if expected == "auth_required" else None
    )


def test_captured_warning_keeps_rate_limit_cause_and_can_reset():
    capture = YtDlpErrorCapture()
    capture.warning("HTTP Error 429: Too Many Requests")
    capture.error("Sign in to confirm you're not a bot. Use cookies.")
    result = classify_download_error(capture.text)
    assert result.code == "rate_limited"
    assert classify_download_error(DownloadExtractionError(result)) is result
    capture.clear()
    assert capture.text == ""


def test_classifies_twitter_bad_guest_token():
    classified = classify_download_error(
        "ERROR: [twitter] 2005220639771161077: Error(s) while querying API: Bad guest token; please report this issue",
        url="https://x.com/example/status/2005220639771161077",
    )

    assert classified.code == "twitter_guest_token"
    assert classified.cookie_domain == "x.com"
    assert "X/Twitter 游客访问失败" in classified.display_message
    assert "不是普通断网" in classified.display_message


def test_classifies_network_failure():
    classified = classify_download_error(
        "HTTPSConnectionPool(host='example.com'): Read timed out.",
        url="https://example.com/video",
    )

    assert classified.code == "network"
    assert classified.retryable is True
    assert "网络连接失败" in classified.display_message


def test_classifies_missing_info_without_raw_error():
    classified = classify_download_error(
        None,
        url="https://example.com/video",
        fallback_code="no_info",
    )

    assert classified.code == "no_info"
    assert "没有读取到媒体信息" in classified.display_message
