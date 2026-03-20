from __future__ import annotations

import time
from pathlib import Path
from typing import Callable, Iterable, Optional

import requests
from loguru import logger

from backend.config import settings


ProgressCallback = Optional[Callable[[float, str], None]]


def _download_file(
    candidates: Iterable[str],
    dest_path: Path,
    progress_callback: ProgressCallback = None,
    progress_base: float = 0.0,
    progress_span: float = 1.0,
    label: Optional[str] = None,
) -> Path:
    if dest_path.exists() and dest_path.stat().st_size > 1024:
        if progress_callback:
            progress_callback(progress_base + progress_span, f"Verified {label or dest_path.name}")
        return dest_path

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    proxies = {"http": settings.DOWNLOADER_PROXY, "https": settings.DOWNLOADER_PROXY} if settings.DOWNLOADER_PROXY else None
    last_error: Optional[Exception] = None

    for url in candidates:
        try:
            logger.info(f"Downloading {dest_path.name} from {url}")
            with requests.get(url, stream=True, proxies=proxies, timeout=60) as response:
                response.raise_for_status()
                total_size = int(response.headers.get("content-length", 0))
                downloaded = 0
                last_update_time = 0.0

                with open(dest_path, "wb") as output:
                    for chunk in response.iter_content(chunk_size=1024 * 128):
                        if not chunk:
                            continue
                        output.write(chunk)
                        downloaded += len(chunk)

                        if progress_callback and total_size > 0:
                            now = time.time()
                            if now - last_update_time >= 0.4 or downloaded == total_size:
                                progress = progress_base + progress_span * min(downloaded / total_size, 1.0)
                                progress_callback(progress, f"Downloading {label or dest_path.name}")
                                last_update_time = now

            if progress_callback:
                progress_callback(progress_base + progress_span, f"Downloaded {label or dest_path.name}")
            return dest_path
        except Exception as exc:
            last_error = exc
            logger.warning(f"Failed to download {dest_path.name} from {url}: {exc}")
            if dest_path.exists():
                dest_path.unlink(missing_ok=True)

    raise RuntimeError(f"Failed to download {dest_path.name}: {last_error}")


def ensure_basicvsr_assets(progress_callback: ProgressCallback = None) -> None:
    model_dir = settings.BIN_DIR / "models"
    files = [
        (
            "basicvsr_plusplus_c64n7_8x1_600k_reds4.pth",
            [
                "https://download.openmmlab.com/mmediting/restorers/basicvsr_plusplus/basicvsr_plusplus_c64n7_8x1_600k_reds4_20210217-db622b2f.pth",
            ],
        ),
        (
            "spynet_20210409-c6c1bd09.pth",
            [
                "https://download.openmmlab.com/mmediting/restorers/basicvsr/spynet_20210409-c6c1bd09.pth",
            ],
        ),
    ]

    total = len(files)
    for index, (filename, urls) in enumerate(files):
        base = index / total
        span = 1 / total
        _download_file(
            urls,
            model_dir / filename,
            progress_callback=progress_callback,
            progress_base=base,
            progress_span=span,
            label=filename,
        )


def ensure_propainter_assets(progress_callback: ProgressCallback = None) -> None:
    weights_dir = settings.MODEL_DIR / "weights" / "propainter"
    base_urls = [
        "https://mirror.ghproxy.com/https://github.com/sczhou/ProPainter/releases/download/v0.1.0",
        "https://ghproxy.com/https://github.com/sczhou/ProPainter/releases/download/v0.1.0",
        "https://github.com/sczhou/ProPainter/releases/download/v0.1.0",
    ]
    filenames = [
        "ProPainter.pth",
        "raft-things.pth",
        "recurrent_flow_completion.pth",
    ]

    total = len(filenames)
    for index, filename in enumerate(filenames):
        urls = [f"{base_url}/{filename}" for base_url in base_urls]
        base = index / total
        span = 1 / total
        _download_file(
            urls,
            weights_dir / filename,
            progress_callback=progress_callback,
            progress_base=base,
            progress_span=span,
            label=filename,
        )
