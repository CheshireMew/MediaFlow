import pytest

from backend.core.context import PipelineContext
from backend.models.media_contracts import MediaReference


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

    assert ctx.get_media("subtitle_ref").path == "E:/subs/demo_ZH-CN.srt"
    assert ctx.artifacts[0].ref.path == "E:/subs/demo_ZH-CN.srt"
    assert not hasattr(ctx, "data")
    assert not hasattr(ctx, "set")

    with pytest.raises(ValueError, match="Unsupported pipeline media key"):
        ctx.set_media(
            "video_path",
            MediaReference(path="E:/media/demo.mp4", name="demo.mp4"),
            kind="video",
        )

    with pytest.raises(TypeError, match="MediaReference instances"):
        ctx.set_media(
            "video_ref",
            {"path": "E:/media/demo.mp4", "name": "demo.mp4"},
            kind="video",
        )
