import subprocess
import sys
from importlib import import_module

from fastapi import APIRouter, HTTPException
from backend.services.settings_manager import UserSettings, LLMProvider
from backend.core.container import container, Services

def _get_settings_manager():
    return container.get(Services.SETTINGS_MANAGER)
from pydantic import BaseModel
from typing import Optional

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


def _test_provider_connection(provider: ProviderConnectionRequest):
    from openai import OpenAI

    if not provider.base_url.strip():
        raise ValueError("Base URL is required")
    if not provider.api_key.strip():
        raise ValueError("API key is required")
    if not provider.model.strip():
        raise ValueError("Model is required")

    client = OpenAI(
        api_key=provider.api_key,
        base_url=provider.base_url,
        timeout=15.0,
    )
    client.chat.completions.create(
        model=provider.model,
        messages=[
            {"role": "user", "content": "Reply with OK."},
        ],
        max_tokens=3,
    )


def _get_yt_dlp_version() -> Optional[str]:
    try:
        yt_dlp = import_module("yt_dlp")
        version = getattr(getattr(yt_dlp, "version", None), "__version__", None)
        if version:
            return str(version)
    except Exception:
        return None
    return None

@router.get("/", response_model=UserSettings)
async def get_records():
    """Get all user settings."""
    return _get_settings_manager().get_settings()

@router.post("/", response_model=UserSettings)
async def update_settings(settings: UserSettings):
    """
    Update all settings (full replace).
    BE CAREFUL: Client should send the full object.
    """
    try:
        sm = _get_settings_manager()
        sm.update_settings(settings)
        return sm.get_settings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/active-provider")
async def set_active_provider(req: ActiveProviderRequest):
    """Set the active LLM provider by ID."""
    try:
        _get_settings_manager().set_active_provider(req.provider_id)
        return {"status": "success", "active_provider_id": req.provider_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-provider")
async def test_provider_connection(req: ProviderConnectionRequest):
    """Test whether the given provider config can complete a minimal chat request."""
    try:
        _test_provider_connection(req)
        return {"status": "success", "message": "Connection successful"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-yt-dlp", response_model=ToolUpdateResponse)
async def update_yt_dlp():
    previous_version = _get_yt_dlp_version()

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail=f"yt-dlp update timed out: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run updater: {e}")

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Unknown pip error").strip()
        raise HTTPException(status_code=500, detail=detail)

    current_version = _get_yt_dlp_version()
    message = "yt-dlp update completed. Restart the backend if the new version is not picked up immediately."

    return ToolUpdateResponse(
        status="success",
        message=message,
        previous_version=previous_version,
        current_version=current_version,
    )
