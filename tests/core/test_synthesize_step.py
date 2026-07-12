from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from backend.core.context import PipelineContext
from backend.core.steps.synthesize import SynthesizeStep
from backend.models.schemas import MediaReference, PipelineStepRequest, SynthesizeParams


@pytest.mark.asyncio
async def test_synthesize_step_derives_watermark_path_only_for_ffmpeg_adapter():
    synthesis = MagicMock()
    synthesis.synthesize.return_value = "D:/media/source_synthesized.mp4"
    context = PipelineContext()
    context.set_media(
        "video_ref",
        MediaReference(path="D:/media/source.mp4", name="source.mp4"),
        kind="video",
        role="input",
        track_artifact=False,
    )
    context.set_media(
        "subtitle_ref",
        MediaReference(path="D:/media/source.srt", name="source.srt"),
        kind="subtitle",
        role="input",
        track_artifact=False,
    )
    params = SynthesizeParams(
        watermark_ref=MediaReference(
            path="D:/media/watermark.png",
            name="watermark.png",
            media_kind="image",
        )
    ).model_dump(mode="json")

    await SynthesizeStep(
        synthesis=synthesis,
        task_manager=AsyncMock(),
    ).execute(context, params)

    synthesis.synthesize.assert_called_once()
    call = synthesis.synthesize.call_args
    assert call.kwargs["watermark_path"] == "D:/media/watermark.png"
    assert context.get_media("video_ref").path == "D:/media/source_synthesized.mp4"


def test_pipeline_synthesize_rejects_legacy_watermark_path():
    with pytest.raises(ValidationError, match="watermark_path"):
        PipelineStepRequest(
            step_name="synthesize",
            params={"watermark_path": "D:/media/legacy.png"},
        )
