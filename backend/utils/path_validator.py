from collections.abc import Iterable
from pathlib import Path

from backend.config import settings


READABLE_RUNTIME_ROOTS = (
    "WORKSPACE_DIR",
    "TEMP_DIR",
    "OUTPUT_DIR",
    "USER_DATA_DIR",
)

WRITABLE_RUNTIME_ROOTS = (
    "WORKSPACE_DIR",
    "TEMP_DIR",
    "OUTPUT_DIR",
    "USER_DATA_DIR",
)


def _runtime_roots(root_names: Iterable[str]) -> tuple[Path, ...]:
    roots: list[Path] = []
    for name in root_names:
        root = getattr(settings, name)
        roots.append(Path(root).expanduser().resolve())
    return tuple(roots)


def _is_inside(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def _require_inside_runtime_roots(
    candidate: Path,
    *,
    label: str,
    roots: tuple[Path, ...],
) -> None:
    if any(_is_inside(candidate, root) for root in roots):
        return
    root_list = ", ".join(str(root) for root in roots)
    raise ValueError(f"{label} must be inside one of the runtime directories: {root_list}")


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
    _require_inside_runtime_roots(
        candidate,
        label=label,
        roots=_runtime_roots(READABLE_RUNTIME_ROOTS),
    )
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
    _require_inside_runtime_roots(
        candidate,
        label=label,
        roots=_runtime_roots(WRITABLE_RUNTIME_ROOTS),
    )
    _require_extension(candidate, label=label, allowed_extensions=allowed_extensions)
    return candidate
