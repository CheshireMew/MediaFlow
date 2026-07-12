import asyncio
import subprocess
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.runtime_diagnostics import CudaReadinessResponse
from backend.services.settings_manager import (
    UiStatePatch,
    UserPreferencesPatch,
    UserSettings,
)

class ActiveProviderRequest(BaseModel):
    provider_id: str


class ProviderConnectionRequest(BaseModel):
    name: Optional[str] = None
    base_url: str
    api_key: str
    model: str


class ToolUpdateResponse(BaseModel):
    status: str
    message: str
    previous_version: Optional[str] = None
    current_version: Optional[str] = None


class FasterWhisperCliInstallResponse(BaseModel):
    status: str
    message: str
    cli_path: str
    version: Optional[str] = None


class FasterWhisperCliPrewarmRequest(BaseModel):
    model: str = "base"
    device: str = "cpu"


class FasterWhisperCliPrewarmResponse(BaseModel):
    status: str
    message: str


def create_router(*, settings_application, asr_service) -> APIRouter:
    router = APIRouter(prefix="/settings", tags=["Settings"])

    @router.get("/", response_model=UserSettings)
    async def get_records():
        return settings_application.get_settings()

    @router.get("/cuda-readiness", response_model=CudaReadinessResponse)
    async def get_cuda_readiness():
        return settings_application.get_cuda_readiness()

    @router.patch("/preferences", response_model=UserSettings)
    async def patch_preferences(patch: UserPreferencesPatch):
        try:
            return settings_application.patch_preferences(patch)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.patch("/ui-state", response_model=UserSettings)
    async def patch_ui_state(patch: UiStatePatch):
        try:
            return settings_application.patch_ui_state(patch)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/active-provider")
    async def set_active_provider(req: ActiveProviderRequest):
        try:
            return settings_application.set_active_provider(req.provider_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/test-provider")
    async def test_provider_connection(req: ProviderConnectionRequest):
        try:
            return await asyncio.to_thread(
                settings_application.test_provider_connection,
                name=req.name,
                base_url=req.base_url,
                api_key=req.api_key,
                model=req.model,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/update-yt-dlp", response_model=ToolUpdateResponse)
    async def update_yt_dlp():
        try:
            result = await asyncio.to_thread(settings_application.update_yt_dlp)
            return ToolUpdateResponse.model_validate(result)
        except subprocess.TimeoutExpired as e:
            raise HTTPException(status_code=504, detail=f"yt-dlp update timed out: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to run updater: {e}")

    @router.post(
        "/install-faster-whisper-cli",
        response_model=FasterWhisperCliInstallResponse,
    )
    async def install_faster_whisper_cli():
        try:
            result = await asyncio.to_thread(
                settings_application.install_faster_whisper_cli
            )
            return FasterWhisperCliInstallResponse.model_validate(result)
        except subprocess.TimeoutExpired as e:
            raise HTTPException(
                status_code=504,
                detail=f"Faster-Whisper CLI install timed out: {e}",
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to install Faster-Whisper CLI: {e}",
            )

    @router.post(
        "/prewarm-faster-whisper-cli",
        response_model=FasterWhisperCliPrewarmResponse,
    )
    async def prewarm_faster_whisper_cli(req: FasterWhisperCliPrewarmRequest):
        try:
            settings_application.get_settings()
            started = asr_service.start_cli_prewarm(
                model_name=req.model,
                device=req.device,
            )
            if started:
                return FasterWhisperCliPrewarmResponse(
                    status="started",
                    message="Faster-Whisper CLI prewarm started.",
                )
            return FasterWhisperCliPrewarmResponse(
                status="skipped",
                message=(
                    "Faster-Whisper CLI prewarm was already complete, "
                    "running, or unavailable."
                ),
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to prewarm Faster-Whisper CLI: {e}",
            )

    return router
