from backend.application.desktop_download_flow_service import DesktopDownloadFlowRequest
from backend.application.download_service import execute_desktop_download


class FakeDesktopFlowService:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    async def execute(self, request, *, progress_callback):
        progress_callback(100, "done")
        return {
            "request": request,
            "deps": self.kwargs,
        }


def test_execute_desktop_download_injects_runtime_services(monkeypatch):
    downloader = object()
    asr_service = object()
    translator = object()
    synthesizer = object()
    captured = {}

    monkeypatch.setattr(
        "backend.application.download_service.RuntimeServices.downloader",
        lambda: downloader,
    )
    monkeypatch.setattr(
        "backend.application.download_service.RuntimeServices.asr",
        lambda: asr_service,
    )
    monkeypatch.setattr(
        "backend.application.download_service.RuntimeServices.translator",
        lambda: translator,
    )
    monkeypatch.setattr(
        "backend.application.download_service.RuntimeServices.video_synthesizer",
        lambda: synthesizer,
    )

    def fake_factory(**kwargs):
        captured["deps"] = kwargs
        return FakeDesktopFlowService(**kwargs)

    monkeypatch.setattr(
        "backend.application.desktop_download_flow_service.DesktopDownloadFlowService",
        fake_factory,
    )

    result = execute_desktop_download(
        DesktopDownloadFlowRequest(url="https://example.com/video"),
        progress_callback=lambda *_args: None,
    )

    assert captured["deps"] == {
        "downloader": downloader,
        "asr_service": asr_service,
        "translator": translator,
        "synthesizer": synthesizer,
    }
    assert result["deps"] == captured["deps"]
