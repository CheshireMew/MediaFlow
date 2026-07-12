import asyncio

from backend.application import synthesis_service
from backend.models.schemas import MediaReference, SynthesisRequest


def test_synthesis_background_forwards_missing_subtitle_when_disabled(monkeypatch, tmp_path):
    video_path = tmp_path / "source.mp4"
    output_path = tmp_path / "exported.mp4"
    watermark_path = tmp_path / "watermark.png"
    video_path.write_bytes(b"video")
    watermark_path.write_bytes(b"png")
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

    request = SynthesisRequest(
        video_ref=MediaReference(path=str(video_path), name=video_path.name),
        output_ref=MediaReference(path=str(output_path), name=output_path.name),
        watermark_ref=MediaReference(
            path=str(watermark_path),
            name=watermark_path.name,
            media_kind="image",
        ),
        options={"skip_subtitles": True},
    )

    runner = type("FakeRunner", (), {"run": staticmethod(fake_run)})()
    asyncio.run(
        synthesis_service._synthesis_background(
            "task-1",
            request,
            video_synthesis=fake_synthesis,
            background_runner=runner,
        )
    )

    assert captured["worker_call"]["srt_path"] is None
    assert captured["worker_call"]["watermark_path"] == str(watermark_path)
    assert captured["worker_call"]["options"]["skip_subtitles"] is True
    assert captured["result"]["success"] is True
    assert captured["result"]["meta"] == {"options": {"skip_subtitles": True}}
    assert captured["result"]["artifacts"][0]["kind"] == "video"
    assert captured["result"]["artifacts"][0]["role"] == "output"
    assert captured["result"]["artifacts"][0]["ref"]["path"] == str(output_path)
