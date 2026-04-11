from collections.abc import Mapping
from typing import Any, ClassVar

from pydantic import BaseModel, model_validator


MediaInputSpec = tuple[str, str]


def normalize_media_path(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def extract_media_ref_path(value: Any) -> str | None:
    if isinstance(value, Mapping):
        return normalize_media_path(value.get("path"))
    return normalize_media_path(getattr(value, "path", None))


class MediaInputModel(BaseModel):
    MEDIA_INPUT_SPECS: ClassVar[tuple[MediaInputSpec, ...]] = ()

    @model_validator(mode="before")
    @classmethod
    def normalize_media_inputs(cls, data: Any) -> Any:
        if not isinstance(data, Mapping) or not cls.MEDIA_INPUT_SPECS:
            return data

        normalized = dict(data)
        for path_key, ref_key in cls.MEDIA_INPUT_SPECS:
            path = normalize_media_path(normalized.get(path_key))
            ref_path = extract_media_ref_path(normalized.get(ref_key))
            normalized[path_key] = ref_path or path

        return normalized
