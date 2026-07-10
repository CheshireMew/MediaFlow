import asyncio

from backend.application import synthesis_service
from backend.models.schemas import MediaReference, SynthesisRequest


def test_synthesis_background_forwards_missing_subtitle_when_disabled(monkeypatch, tmp_path):
    video_path = tmp_path / "source.mp4"
    output_path = tmp_path / "exported.mp4"
    video_path.write_bytes(b"video")
    captured = {}

    class FakeSynthesis:
        def synthesize(self, **kwargs):
            captured["worker_call"] = kwargs
            return str(output_path)

    fake_synthesis = FakeSynthesis()

    async def fake_run(**kwargs):
        captured["runner_call"] = kwargs
        result = kwargs["worker_fn"](**kwargs["worker_kwargs"])
        captured["result"] = kwargs["result_transformer"](result)

    monkeypatch.setattr(synthesis_service, "runtime_service", lambda _service: fake_synthesis)
    monkeypatch.setattr(synthesis_service.BackgroundTaskRunner, "run", fake_run)

    request = SynthesisRequest(
        video_ref=MediaReference(path=str(video_path), name=video_path.name),
        output_ref=MediaReference(path=str(output_path), name=output_path.name),
        options={"skip_subtitles": True},
    )

    asyncio.run(synthesis_service._synthesis_background("task-1", request))

    assert captured["worker_call"]["srt_path"] is None
    assert captured["worker_call"]["options"]["skip_subtitles"] is True
    assert captured["result"]["success"] is True
    assert captured["result"]["meta"]["context_ref"] is None
    assert captured["result"]["meta"]["subtitle_ref"] is None
    assert captured["result"]["files"] == [
        {"type": "video", "path": str(output_path), "label": "synthesis_output"}
    ]
