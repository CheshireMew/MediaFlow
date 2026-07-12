import pytest

from backend.core.context import PipelineContext
from backend.models.schemas import MediaReference


def test_pipeline_context_stores_only_structured_media_references():
    ctx = PipelineContext()

    ctx.set_media(
        "subtitle_ref",
        MediaReference(
            path="E:/subs/demo_ZH-CN.srt",
            name="demo_ZH-CN.srt",
            type="application/x-subrip",
            media_kind="subtitle",
            role="output",
        ),
        kind="subtitle",
    )

    assert ctx.get("srt_path") is None
    assert ctx.get_media("subtitle_ref").path == "E:/subs/demo_ZH-CN.srt"
    assert ctx.artifacts[0].ref.path == "E:/subs/demo_ZH-CN.srt"

    with pytest.raises(ValueError, match="does not store media paths"):
        ctx.set("video_path", "E:/media/demo.mp4")

    with pytest.raises(ValueError, match="stored with set_media"):
        ctx.set("video_ref", {"path": "E:/media/demo.mp4"})

    with pytest.raises(TypeError, match="MediaReference instances"):
        ctx.set_media(
            "video_ref",
            {"path": "E:/media/demo.mp4", "name": "demo.mp4"},
            kind="video",
        )
