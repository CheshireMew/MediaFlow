from backend.services.download_errors import classify_download_error


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
