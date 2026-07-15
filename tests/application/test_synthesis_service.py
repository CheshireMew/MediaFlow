from backend.application.synthesis_service import build_synthesis_worker_kwargs
from backend.models.media_contracts import MediaReference
from backend.models.synthesis_contracts import SynthesisRequest


def test_synthesis_worker_kwargs_forward_missing_subtitle_when_disabled(tmp_path):
    video_path = tmp_path / "source.mp4"
    output_path = tmp_path / "exported.mp4"
    watermark_path = tmp_path / "watermark.png"
    video_path.write_bytes(b"video")
    watermark_path.write_bytes(b"png")
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

    worker_kwargs = build_synthesis_worker_kwargs(request)

    assert worker_kwargs["video_path"] == str(video_path)
    assert worker_kwargs["output_path"] == str(output_path)
    assert worker_kwargs["srt_path"] is None
    assert worker_kwargs["watermark_path"] == str(watermark_path)
    assert worker_kwargs["options"]["skip_subtitles"] is True
