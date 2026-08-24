import pytest

from backend.core.context import PipelineContext
from backend.models.media_contracts import MediaReference, TaskArtifact
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.task_result_contracts import TranscriptionOutput


def test_pipeline_context_stores_only_structured_media_references():
    ctx = PipelineContext()
    ctx.begin_step("translate")

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
    assert ctx.artifacts[0].producer_step == "translate"
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


def test_pipeline_output_validation_requires_the_artifact_from_the_same_step():
    ctx = PipelineContext()
    ctx.publish_transcription(
        TranscriptionOutput(
            task_id="task-1",
            language="en",
            duration=1,
            segments=[SubtitleSegment(id=0, start=0, end=1, text="hello")],
            text="hello",
        )
    )
    ctx.begin_step("translate")
    ctx.add_artifact(
        TaskArtifact(
            kind="subtitle",
            role="output",
            ref=MediaReference(path="E:/subs/translated.srt", name="translated.srt"),
        )
    )

    with pytest.raises(RuntimeError, match="required output artifacts: transcribe"):
        ctx.require_step_outputs(["transcribe"])


def test_v1_checkpoint_restarts_instead_of_restoring_unattributed_artifacts():
    context, next_step_index = PipelineContext.from_checkpoint(
        {
            "format": "mediaflow-pipeline-checkpoint-v1",
            "next_step_index": 2,
            "history": ["download", "transcribe"],
            "artifacts": [],
            "outputs": {},
        }
    )

    assert next_step_index == 0
    assert context.history == []
    assert context.artifacts == []
