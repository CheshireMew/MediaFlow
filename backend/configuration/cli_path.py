from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable


def existing_cli_path(value: str | Path | None) -> Path | None:
    """Check the executable file without starting or downloading the engine."""
    if value is None or not str(value).strip():
        return None
    try:
        path = Path(str(value).strip()).expanduser()
        if os.name == "nt" and path.suffix.lower() != ".exe":
            return None
        return path.resolve() if path.is_file() else None
    except (OSError, ValueError):
        return None


def resolve_cli_path(
    configured: str | Path | None,
    candidates: Iterable[Path],
) -> Path | None:
    return next(
        (path for value in (configured, *candidates) if (path := existing_cli_path(value))),
        None,
    )
