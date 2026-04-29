from collections.abc import Iterable
from pathlib import Path


def _require_extension(
    candidate: Path,
    *,
    label: str,
    allowed_extensions: Iterable[str] | None,
) -> None:
    if allowed_extensions is None:
        return

    normalized_extensions = {
        extension.lower() if extension.startswith(".") else f".{extension.lower()}"
        for extension in allowed_extensions
    }
    if candidate.suffix.lower() in normalized_extensions:
        return
    allowed = ", ".join(sorted(normalized_extensions))
    raise ValueError(f"{label} must use one of these extensions: {allowed}")


def validate_input_file(
    user_path: str,
    *,
    label: str,
    allowed_extensions: Iterable[str] | None = None,
) -> Path:
    candidate = Path(user_path).expanduser().resolve()
    _require_extension(candidate, label=label, allowed_extensions=allowed_extensions)
    if not candidate.is_file():
        raise FileNotFoundError(f"{label} not found: {candidate}")
    return candidate


def validate_output_file(
    user_path: str,
    *,
    label: str,
    allowed_extensions: Iterable[str] | None = None,
) -> Path:
    candidate = Path(user_path).expanduser().resolve()
    _require_extension(candidate, label=label, allowed_extensions=allowed_extensions)
    return candidate
