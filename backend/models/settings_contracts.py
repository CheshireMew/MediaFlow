from typing import Any

from pydantic import BaseModel, Field

from backend.contracts import ASR_EXECUTION_PREFERENCES

SMART_SPLIT_TEXT_LIMIT_DEFAULT = 24


class LLMProvider(BaseModel):
    id: str = Field(..., description="Unique Identifier")
    name: str = Field(..., description="Display Name")
    base_url: str
    api_key: str
    model: str
    is_active: bool = False


class UserSettings(BaseModel):
    llm_providers: list[LLMProvider] = Field(default_factory=list)
    default_download_path: str | None = None
    faster_whisper_cli_path: str | None = None
    language: str = "zh"
    auto_execute_flow: bool = False
    auto_trim_silence: bool = False
    smart_split_text_limit: int = Field(
        default=SMART_SPLIT_TEXT_LIMIT_DEFAULT,
        ge=1,
    )
    ui_state: dict[str, Any] = Field(default_factory=dict)


class UserPreferencesPatch(BaseModel):
    llm_providers: list[LLMProvider] | None = None
    default_download_path: str | None = None
    faster_whisper_cli_path: str | None = None
    language: str | None = None
    auto_execute_flow: bool | None = None
    auto_trim_silence: bool | None = None
    smart_split_text_limit: int | None = Field(default=None, ge=1)


class UiStatePatch(BaseModel):
    updates: dict[str, Any] = Field(default_factory=dict)
    remove: list[str] = Field(default_factory=list)


class AsrExecutionPreferences(BaseModel):
    engine: str = ASR_EXECUTION_PREFERENCES["defaults"]["engine"]
    model: str = ASR_EXECUTION_PREFERENCES["defaults"]["model"]
    device: str = ASR_EXECUTION_PREFERENCES["defaults"]["device"]


class RuntimeDependencyCheck(BaseModel):
    key: str
    label: str
    status: str
    detail: str
    path: str | None = None
    version: str | None = None


class CudaReadinessResponse(BaseModel):
    status: str
    summary: str
    gpu_name: str | None = None
    driver_version: str | None = None
    driver_cuda_capability: str | None = None
    dependencies: list[RuntimeDependencyCheck]
    install_guidance: list[str]
