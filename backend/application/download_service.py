import asyncio

from backend.application.desktop_download_flow_service import (
    DesktopDownloadFlowRequest,
    DesktopDownloadFlowService,
)
from backend.core.runtime_access import RuntimeServices
from backend.models.schemas import AnalyzeResult, PipelineRequest


async def submit_download_pipeline(req: PipelineRequest) -> dict:
    return await RuntimeServices.task_orchestrator().submit_pipeline(req)


async def analyze_url(url: str) -> AnalyzeResult:
    return await RuntimeServices.analyzer().analyze(url)


def save_cookies(domain: str, cookies: list[dict]) -> dict[str, str | bool]:
    cookie_path = RuntimeServices.cookie_manager().save_cookies(domain, cookies)
    return {
        "domain": domain,
        "has_valid_cookies": True,
        "cookie_path": str(cookie_path),
    }


def execute_desktop_download(
    request: DesktopDownloadFlowRequest,
    *,
    progress_callback,
):
    return asyncio.run(
        DesktopDownloadFlowService(
            downloader=RuntimeServices.downloader(),
            asr_service=RuntimeServices.asr(),
            translator=RuntimeServices.translator(),
            synthesizer=RuntimeServices.video_synthesizer(),
        ).execute(
            request,
            progress_callback=progress_callback,
        )
    )
