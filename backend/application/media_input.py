from pathlib import Path

from backend.models.application_errors import InvalidInputError, ResourceNotFoundError
from backend.utils.path_validator import validate_input_file


def require_input_file(path: str, *, label: str) -> Path:
    try:
        return validate_input_file(path, label=label)
    except FileNotFoundError as error:
        raise ResourceNotFoundError(
            str(error),
            code="media_file_not_found",
            details={"field": label},
        ) from error
    except ValueError as error:
        raise InvalidInputError(
            str(error),
            code="invalid_media_path",
            details={"field": label},
        ) from error
