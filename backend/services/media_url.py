from urllib.parse import urlsplit, urlunsplit


YTDLP_HOST_ALIASES = {
    "pro.x.com": "x.com",
}


def normalize_media_url(url: str) -> str:
    """Normalize equivalent media page URLs before platform/yt-dlp handling."""
    raw_url = str(url)
    try:
        parts = urlsplit(raw_url)
    except ValueError:
        return raw_url

    host = (parts.hostname or "").lower()
    replacement_host = YTDLP_HOST_ALIASES.get(host)
    if not replacement_host:
        return raw_url

    netloc = replacement_host
    if parts.port:
        netloc = f"{netloc}:{parts.port}"

    return urlunsplit(
        (
            parts.scheme,
            netloc,
            parts.path,
            parts.query,
            parts.fragment,
        )
    )
