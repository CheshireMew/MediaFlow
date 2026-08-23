from __future__ import annotations

import time
from collections.abc import Iterable
from pathlib import Path

from loguru import logger

ACTIVE_TEMP_FILE_GRACE_SECONDS = 60 * 60


def prune_cache_directory(
    directory: Path,
    *,
    max_bytes: int,
    max_age_seconds: float,
    protected: Iterable[Path] = (),
) -> None:
    """Bound a derivative-file cache by age and total bytes.

    Cache entries are always reproducible, so failed removals are logged and do
    not make the foreground media operation fail.
    """
    if max_bytes <= 0 or max_age_seconds <= 0 or not directory.exists():
        return

    protected_paths = {path.resolve() for path in protected}
    now = time.time()
    entries: list[tuple[Path, int, float]] = []

    for path in directory.iterdir():
        if not path.is_file() or path.resolve() in protected_paths:
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        if (
            ".tmp" in path.suffixes
            and now - stat.st_mtime <= ACTIVE_TEMP_FILE_GRACE_SECONDS
        ):
            continue
        entries.append((path, stat.st_size, stat.st_mtime))

    retained: list[tuple[Path, int, float]] = []
    for path, size, modified_at in entries:
        if now - modified_at <= max_age_seconds:
            retained.append((path, size, modified_at))
            continue
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.debug("Failed to expire cache entry {}: {}", path, exc)
            retained.append((path, size, modified_at))

    total_bytes = sum(size for _, size, _ in retained)
    if total_bytes <= max_bytes:
        return

    for path, size, _ in sorted(retained, key=lambda entry: entry[2]):
        if total_bytes <= max_bytes:
            break
        try:
            path.unlink(missing_ok=True)
            total_bytes -= size
        except OSError as exc:
            logger.debug("Failed to evict cache entry {}: {}", path, exc)
