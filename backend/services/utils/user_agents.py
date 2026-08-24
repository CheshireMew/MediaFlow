from __future__ import annotations

import re
from dataclasses import dataclass


_CHROMIUM_VERSION = re.compile(r"(?:Chrome/)?(\d+)(?:\.\d+){0,3}")


@dataclass(frozen=True)
class ChromiumIdentity:
    user_agent: str
    chromium_major: int | None
    viewport: dict[str, int]
    device_scale_factor: float
    has_touch: bool
    is_mobile: bool
    platform: str

    def context_options(self) -> dict:
        return {
            "user_agent": self.user_agent,
            "viewport": self.viewport,
            "device_scale_factor": self.device_scale_factor,
            "has_touch": self.has_touch,
            "is_mobile": self.is_mobile,
        }

    def extra_http_headers(self) -> dict[str, str]:
        if self.chromium_major is None:
            return {"Upgrade-Insecure-Requests": "1"}
        major = str(self.chromium_major)
        return {
            "sec-ch-ua": (
                f'"Chromium";v="{major}", "Google Chrome";v="{major}", '
                '"Not_A Brand";v="99"'
            ),
            "sec-ch-ua-mobile": "?1" if self.is_mobile else "?0",
            "sec-ch-ua-platform": f'"{self.platform}"',
            "Upgrade-Insecure-Requests": "1",
        }


def _chromium_version(value: str) -> tuple[str, int]:
    match = _CHROMIUM_VERSION.search(value)
    if not match:
        raise ValueError(f"Could not determine Chromium version from: {value}")
    version = match.group(0).removeprefix("Chrome/")
    return version, int(match.group(1))


def _custom_identity(user_agent: str) -> ChromiumIdentity:
    chromium_match = re.search(r"Chrome/(\d+)(?:\.\d+){0,3}", user_agent)
    mobile = "Mobile" in user_agent or "Android" in user_agent
    if "Android" in user_agent:
        platform = "Android"
    elif "Macintosh" in user_agent:
        platform = "macOS"
    elif "Linux" in user_agent and "Windows" not in user_agent:
        platform = "Linux"
    else:
        platform = "Windows"
    return ChromiumIdentity(
        user_agent=user_agent,
        chromium_major=int(chromium_match.group(1)) if chromium_match else None,
        viewport={"width": 412, "height": 915}
        if mobile
        else {"width": 1440, "height": 900},
        device_scale_factor=2 if mobile else 1,
        has_touch=mobile,
        is_mobile=mobile,
        platform=platform,
    )


def build_chromium_identity(
    browser_version: str,
    user_agent: str | None = None,
) -> ChromiumIdentity:
    if user_agent:
        return _custom_identity(user_agent)
    version, major = _chromium_version(browser_version)
    return ChromiumIdentity(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            f"Chrome/{version} Safari/537.36"
        ),
        chromium_major=major,
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1,
        has_touch=False,
        is_mobile=False,
        platform="Windows",
    )
