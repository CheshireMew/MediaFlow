from backend.models.download_contracts import AnalyzeResult


class DownloadApplicationService:
    def __init__(self, *, analyzer, cookie_manager):
        self._analyzer = analyzer
        self._cookie_manager = cookie_manager

    async def analyze_url(self, url: str) -> AnalyzeResult:
        return await self._analyzer.analyze(url)

    def save_cookies(self, domain: str, cookies: list[dict]) -> dict[str, str | bool]:
        cookie_path = self._cookie_manager.save_cookies(domain, cookies)
        return {
            "domain": domain,
            "has_valid_cookies": True,
            "cookie_path": str(cookie_path),
        }

    def cookie_status(self, domain: str) -> dict[str, str | bool | None]:
        has_valid = self._cookie_manager.has_valid_cookies(domain)
        cookie_path = self._cookie_manager.get_cookie_path(domain)
        return {
            "domain": domain,
            "has_valid_cookies": has_valid,
            "cookie_path": str(cookie_path) if has_valid else None,
        }

    def clear_cookies(self, domain: str) -> bool:
        return self._cookie_manager.clear_cookies(domain)
