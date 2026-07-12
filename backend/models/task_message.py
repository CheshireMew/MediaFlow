from __future__ import annotations

from collections.abc import Callable
import math
from typing import TypeAlias

from backend.contracts import require_task_message_code


TaskMessageParam: TypeAlias = str | int | float | bool | None
TaskMessageParams: TypeAlias = dict[str, TaskMessageParam]
TaskProgressCallback: TypeAlias = Callable[
    [float, str, TaskMessageParams | None],
    None,
]


def validate_task_message(
    code: str,
    params: TaskMessageParams | None = None,
) -> tuple[str, TaskMessageParams]:
    validated_code = require_task_message_code(code)
    validated_params = dict(params or {})
    invalid = {
        key: value
        for key, value in validated_params.items()
        if not isinstance(key, str)
        or value is not None
        and not isinstance(value, (str, int, float, bool))
        or isinstance(value, float)
        and not math.isfinite(value)
    }
    if invalid:
        raise ValueError(
            "Task message params must contain only scalar JSON values: "
            f"{sorted(invalid)}"
        )
    return validated_code, validated_params
