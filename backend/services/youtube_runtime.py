"""Runtime options for anonymous YouTube downloads (no browser profile access)."""

from __future__ import annotations

import importlib
import os
import shutil
import sys
from pathlib import Path
from urllib.parse import urlsplit

from backend.config import settings


PROVIDER_VERSION = "2.0.0"


def youtube_tools_dir() -> Path:
    configured = os.environ.get("MEDIAFLOW_YOUTUBE_TOOLS_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    if os.name == "nt" and Path("D:/").exists():
        return Path("D:/Tools/MediaFlow/youtube")
    return settings.TOOL_DIR / "youtube"


def is_youtube_url(url: str) -> bool:
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return False
    return host in {"youtu.be", "youtube.com"} or host.endswith(".youtube.com")


def activate_youtube_packages() -> None:
    packages = youtube_tools_dir() / "python-packages"
    if packages.is_dir() and str(packages) not in sys.path:
        # Contains the provider and EJS only; yt-dlp itself keeps its runtime priority.
        sys.path.append(str(packages))
        importlib.invalidate_caches()


def youtube_options() -> dict:
    activate_youtube_packages()
    root = youtube_tools_dir()
    opts: dict = {
        "cachedir": str(settings.CACHE_DIR / "yt-dlp"),
        # An in-app yt-dlp upgrade may require a newer EJS than the bundled copy.
        # yt-dlp checks the required version and caches the official matching scripts.
        "remote_components": {"ejs:github"},
    }
    runtimes = {}
    for name in ("deno", "node"):
        executable = shutil.which(name)
        if executable:
            runtimes[name] = {"path": executable}
    if runtimes:
        opts["js_runtimes"] = runtimes

    server = root / f"bgutil-{PROVIDER_VERSION}" / "server"
    if (server / "build" / "generate_once.js").is_file() and "node" in runtimes:
        # These are temporary playback attestations, not account cookies.
        opts["extractor_args"] = {
            "youtube": {"player_client": ["mweb"]},
            "youtubepot-bgutilscript": {"server_home": [str(server)]},
        }
        os.environ.setdefault("XDG_CACHE_HOME", str(settings.CACHE_DIR))
    return opts
