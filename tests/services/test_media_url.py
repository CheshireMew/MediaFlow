from backend.services.media_url import normalize_media_url


def test_normalize_media_url_maps_x_pro_host_to_x_host():
    assert (
        normalize_media_url(
            "https://pro.x.com/jawwwn_/status/2062587453463007642/video/1?foo=bar#frag"
        )
        == "https://x.com/jawwwn_/status/2062587453463007642/video/1?foo=bar#frag"
    )


def test_normalize_media_url_leaves_supported_x_host_unchanged():
    url = "https://x.com/jawwwn_/status/2062587453463007642/video/1"

    assert normalize_media_url(url) == url


def test_normalize_media_url_does_not_rewrite_other_x_subdomains():
    url = "https://api.x.com/jawwwn_/status/2062587453463007642/video/1"

    assert normalize_media_url(url) == url
