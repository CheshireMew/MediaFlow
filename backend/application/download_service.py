import asyncio
from typing import TYPE_CHECKING

from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.models.schemas import AnalyzeResult, PipelineRequest

if TYPE_CHECKING:
    from backend.application.desktop_download_flow_service import DesktopDownloadFlowRequest


async def submit_download_pipeline(req: PipelineRequest) -> dict:
    return await runtime_service(Services.TASK_ORCHESTRATOR).submit_pipeline(req)


async def analyze_url(url: str) -> AnalyzeResult:
    return await runtime_service(Services.ANALYZER).analyze(url)


def save_cookies(domain: str, cookies: list[dict]) -> dict[str, str | bool]:
    cookie_path = runtime_service(Services.COOKIE_MANAGER).save_cookies(domain, cookies)
    return {
        "domain": domain,
        "has_valid_cookies": True,
        "cookie_path": str(cookie_path),
    }


def execute_desktop_download(
    request: "DesktopDownloadFlowRequest",
    *,
    progress_callback,
):
    from backend.application.desktop_download_flow_service import DesktopDownloadFlowService

    return asyncio.run(
        DesktopDownloadFlowService(
            downloader=runtime_service(Services.DOWNLOADER),
            asr_service=runtime_service(Services.ASR),
            translator=runtime_service(Services.LLM_TRANSLATOR),
            synthesis=runtime_service(Services.VIDEO_SYNTHESIS),
        ).execute(
            request,
            progress_callback=progress_callback,
        )
    )
