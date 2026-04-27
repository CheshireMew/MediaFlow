import subprocess
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.application.settings_service import SettingsApplicationService
from backend.core.runtime_access import RuntimeServices
from backend.services.settings_manager import UserSettings

def _settings_application():
    return SettingsApplicationService(RuntimeServices.settings_manager())

router = APIRouter(prefix="/settings", tags=["Settings"])

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


@router.get("/", response_model=UserSettings)
async def get_records():
    """Get all user settings."""
    return _settings_application().get_settings()

@router.post("/", response_model=UserSettings)
async def update_settings(settings: UserSettings):
    """
    Update all settings (full replace).
    BE CAREFUL: Client should send the full object.
    """
    try:
        return _settings_application().update_settings(settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/active-provider")
async def set_active_provider(req: ActiveProviderRequest):
    """Set the active LLM provider by ID."""
    try:
        return _settings_application().set_active_provider(req.provider_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-provider")
async def test_provider_connection(req: ProviderConnectionRequest):
    """Test whether the given provider config can complete a minimal chat request."""
    try:
        return _settings_application().test_provider_connection(
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
        return ToolUpdateResponse.model_validate(_settings_application().update_yt_dlp())
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail=f"yt-dlp update timed out: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run updater: {e}")


@router.post("/install-faster-whisper-cli", response_model=FasterWhisperCliInstallResponse)
async def install_faster_whisper_cli():
    try:
        return FasterWhisperCliInstallResponse.model_validate(
            _settings_application().install_faster_whisper_cli()
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail=f"Faster-Whisper CLI install timed out: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to install Faster-Whisper CLI: {e}")
