from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from backend.models.media_contracts import MediaReference


class SynthesisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    font_name: str | None = None
    font_size: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    font_color: str | None = None
    bold: bool = False
    italic: bool = False
    outline: float = Field(default=2, ge=0, allow_inf_nan=False)
    shadow: float = Field(default=0, ge=0, allow_inf_nan=False)
    outline_color: str | None = None
    back_color: str | None = None
    border_style: Literal[1, 3] = 1
    alignment: int = Field(default=2, ge=1, le=9)
    multiline_align: Literal["bottom", "center", "top"] = "center"
    margin_v: int | None = Field(default=None, ge=0)
    margin_l: int | None = Field(default=None, ge=0)
    margin_r: int | None = Field(default=None, ge=0)
    line_step: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    subtitle_position_y: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    crf: int = Field(default=23, ge=0, le=51)
    preset: Literal["ultrafast", "fast", "medium", "slow", "veryslow"] = "medium"
    use_gpu: bool = True
    target_resolution: Literal["original", "720p", "1080p"] = "original"
    trim_start: float = Field(default=0, ge=0, allow_inf_nan=False)
    trim_end: float = Field(default=0, ge=0, allow_inf_nan=False)
    crop_x: int | None = Field(default=None, ge=0)
    crop_y: int | None = Field(default=None, ge=0)
    crop_w: int | None = Field(default=None, gt=0)
    crop_h: int | None = Field(default=None, gt=0)
    video_width: int | None = Field(default=None, gt=0)
    video_height: int | None = Field(default=None, gt=0)
    skip_subtitles: bool = False
    force_hd: bool = False
    wm_scale: float = Field(default=1.0, gt=0, allow_inf_nan=False)
    wm_opacity: float = Field(default=1.0, ge=0, le=1, allow_inf_nan=False)
    wm_x: str | None = None
    wm_y: str | None = None
    wm_relative_width: float | None = Field(default=None, gt=0, le=1, allow_inf_nan=False)
    wm_pos_x: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    wm_pos_y: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.trim_end > 0 and self.trim_end <= self.trim_start:
            raise ValueError("trim_end must be greater than trim_start")
        if (self.crop_w is None) != (self.crop_h is None):
            raise ValueError("crop_w and crop_h must be provided together")
        return self


class SynthesisRuntimeOptions(SynthesisOptions):
    """Validated adapter options enriched with media facts owned by the backend."""

    disable_auto_trim: bool = False
    preserve_frame_rate: bool = False
    source_duration: float | None = Field(
        default=None,
        ge=0,
        allow_inf_nan=False,
        validation_alias=AliasChoices("source_duration", "_source_duration"),
        serialization_alias="_source_duration",
    )
    source_has_audio: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("source_has_audio", "_source_has_audio"),
        serialization_alias="_source_has_audio",
    )
    source_width: int | None = Field(
        default=None,
        gt=0,
        validation_alias=AliasChoices("source_width", "_source_width"),
        serialization_alias="_source_width",
    )
    source_height: int | None = Field(
        default=None,
        gt=0,
        validation_alias=AliasChoices("source_height", "_source_height"),
        serialization_alias="_source_height",
    )
    smart_scale_factor: float | None = Field(
        default=None,
        gt=0,
        allow_inf_nan=False,
        validation_alias=AliasChoices("smart_scale_factor", "_smart_scale_factor"),
        serialization_alias="_smart_scale_factor",
    )

    @classmethod
    def from_options(cls, options: SynthesisOptions | dict | None, **updates):
        if isinstance(options, BaseModel):
            payload = options.model_dump(mode="json", exclude_none=True)
        else:
            payload = dict(options or {})
        return cls.model_validate({**payload, **updates})

    def to_adapter_dict(self) -> dict:
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)

    def __getitem__(self, key: str):
        return self.to_adapter_dict()[key]


class SynthesisInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    srt_ref: MediaReference | None = None
    watermark_ref: MediaReference | None = None
    output_ref: MediaReference | None = None
    options: SynthesisOptions = Field(default_factory=SynthesisOptions)


class SynthesisRequest(SynthesisInputs):
    video_ref: MediaReference
