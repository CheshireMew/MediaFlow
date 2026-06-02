from __future__ import annotations

from hashlib import sha1
from pathlib import Path


WINDOWS_LEGACY_MAX_PATH = 260
GENERATED_OUTPUT_MAX_PATH = 240
GENERATED_OUTPUT_MAX_FILENAME = 240


def build_suffixed_output_path(
    source_path: str | Path,
    suffix: str,
    *,
    extension: str,
    max_path_length: int = GENERATED_OUTPUT_MAX_PATH,
) -> Path:
    source = Path(source_path)
    normalized_extension = extension if extension.startswith(".") else f".{extension}"
    stem = source.stem or "output"
    filename = f"{stem}{suffix}{normalized_extension}"
    candidate = source.parent / filename

    if (
        len(str(candidate)) <= max_path_length
        and len(filename) <= GENERATED_OUTPUT_MAX_FILENAME
    ):
        return candidate

    digest = sha1(filename.encode("utf-8")).hexdigest()[:8]
    marker = f"-{digest}{suffix}{normalized_extension}"
    parent_text = "" if str(source.parent) == "." else str(source.parent)
    separator_length = 1 if parent_text else 0
    filename_budget = min(
        GENERATED_OUTPUT_MAX_FILENAME,
        max_path_length - len(parent_text) - separator_length,
    )

    if filename_budget <= len(marker) + 1:
        shortened_filename = f"out-{digest}{suffix}{normalized_extension}"
    else:
        prefix_budget = filename_budget - len(marker)
        prefix = stem[:prefix_budget].rstrip(" .-_") or "output"
        shortened_filename = f"{prefix}{marker}"

    return source.parent / shortened_filename
