from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class ClassifiedDownloadError:
    code: str
    title: str
    cause: str
    action: str
    retryable: bool = False
    cookie_domain: str | None = None
    original: str = ""

    @property
    def display_message(self) -> str:
        return f"{self.title}\n原因：{self.cause}\n处理：{self.action}"


class DownloadExtractionError(ValueError):
    def __init__(self, error: ClassifiedDownloadError):
        self.error = error
        super().__init__(error.display_message)


class YtDlpErrorCapture:
    def __init__(self):
        self._errors: list[str] = []

    def debug(self, message: str) -> None:
        pass

    def warning(self, message: str) -> None:
        pass

    def error(self, message: str) -> None:
        self._errors.append(str(message))

    @property
    def text(self) -> str:
        return "\n".join(self._errors)


def classify_download_error(
    error: BaseException | str | None,
    *,
    url: str | None = None,
    fallback_code: str = "unknown",
) -> ClassifiedDownloadError:
    original = _error_text(error)
    normalized = original.lower()
    domain = _domain_from_url(url)

    if "bad guest token" in normalized and _is_twitter_domain(domain):
        return ClassifiedDownloadError(
            code="twitter_guest_token",
            title="X/Twitter 游客访问失败",
            cause="平台拒绝了 yt-dlp 的游客访问凭证，这通常不是普通断网。",
            action="先更新 yt-dlp；如果仍失败，请在浏览器登录 X/Twitter 后重试。",
            cookie_domain="x.com",
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "cookies",
            "cookie",
            "login",
            "log in",
            "sign in",
            "authentication",
            "authenticated",
            "http error 403",
            "forbidden",
            "private",
            "members-only",
            "age-restricted",
        ),
    ):
        return ClassifiedDownloadError(
            code="auth_required",
            title="需要登录验证",
            cause="目标内容需要登录、Cookie 或额外权限才能读取。",
            action=f"请先在浏览器登录 {domain or '对应网站'}，再重新解析或下载。",
            cookie_domain=domain,
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "timed out",
            "timeout",
            "connection reset",
            "connection aborted",
            "connection refused",
            "network is unreachable",
            "temporary failure in name resolution",
            "name resolution",
            "dns",
            "ssl",
            "certificate verify failed",
        ),
    ):
        return ClassifiedDownloadError(
            code="network",
            title="网络连接失败",
            cause="连接目标网站时超时、被中断，或证书/DNS 解析失败。",
            action="检查网络和代理设置后重试。",
            retryable=True,
            original=original,
        )

    if _contains_any(normalized, ("proxy", "socks", "407 proxy authentication")):
        return ClassifiedDownloadError(
            code="proxy",
            title="代理连接失败",
            cause="当前代理不可用，或代理需要认证。",
            action="检查下载代理配置后重试。",
            retryable=True,
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "too many requests",
            "http error 429",
            "rate limit",
            "temporarily blocked",
        ),
    ):
        return ClassifiedDownloadError(
            code="rate_limited",
            title="访问过于频繁",
            cause="平台临时限制了当前访问。",
            action="等待一段时间后重试，必要时切换网络或登录后再试。",
            retryable=True,
            cookie_domain=domain,
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "geo restricted",
            "not available in your country",
            "region",
            "blocked in your country",
        ),
    ):
        return ClassifiedDownloadError(
            code="region_blocked",
            title="地区或版权限制",
            cause="该内容在当前网络地区不可访问。",
            action="换用可访问该内容的网络或代理后重试。",
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "unsupported url",
            "no suitable extractor",
            "not a valid url",
            "invalid url",
        ),
    ):
        return ClassifiedDownloadError(
            code="unsupported_url",
            title="不支持这个链接",
            cause="当前 yt-dlp 或平台解析器无法识别该地址。",
            action="确认链接完整有效；如果链接没问题，请更新 yt-dlp。",
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "video unavailable",
            "this video is unavailable",
            "not found",
            "has been removed",
            "deleted",
        ),
    ):
        return ClassifiedDownloadError(
            code="content_unavailable",
            title="内容不可用",
            cause="目标视频不存在、已删除，或平台不再公开提供。",
            action="确认链接在浏览器中可以正常打开后再试。",
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "requested format is not available",
            "no video formats found",
            "no formats found",
        ),
    ):
        return ClassifiedDownloadError(
            code="no_formats",
            title="没有可下载的媒体格式",
            cause="平台没有返回可用的视频或音频格式。",
            action="换一个清晰度/编码选项后重试；如果仍失败，请更新 yt-dlp。",
            original=original,
        )

    if _contains_any(
        normalized,
        (
            "please report this issue",
            "confirm you are on the latest version",
            "unable to extract",
            "extractor failed",
        ),
    ):
        return ClassifiedDownloadError(
            code="extractor_outdated",
            title="解析规则可能过期",
            cause="平台页面或接口变化，当前 yt-dlp 解析规则没有适配。",
            action="先更新 yt-dlp；如果更新后仍失败，等 yt-dlp 修复规则。",
            original=original,
        )

    if fallback_code == "no_info":
        return ClassifiedDownloadError(
            code="no_info",
            title="没有读取到媒体信息",
            cause="解析器没有返回视频信息，可能是链接无效、权限限制或规则过期。",
            action="先重试一次；如果仍失败，请登录对应网站或更新 yt-dlp。",
            retryable=True,
            cookie_domain=domain,
            original=original,
        )

    return ClassifiedDownloadError(
        code=fallback_code,
        title="解析失败",
        cause="没有识别出明确原因。",
        action="先重试一次；如果仍失败，请更新 yt-dlp 或换一个链接。",
        retryable=True,
        original=original,
    )


def _error_text(error: BaseException | str | None) -> str:
    if error is None:
        return ""
    return str(error).strip()


def _domain_from_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        domain = urlparse(url).netloc.lower()
    except Exception:
        return None
    if domain.startswith("www."):
        return domain[4:]
    return domain or None


def _is_twitter_domain(domain: str | None) -> bool:
    return bool(
        domain
        and (
            domain == "x.com"
            or domain.endswith(".x.com")
            or domain == "twitter.com"
            or domain.endswith(".twitter.com")
        )
    )


def _contains_any(value: str, needles: tuple[str, ...]) -> bool:
    return any(needle in value for needle in needles)
