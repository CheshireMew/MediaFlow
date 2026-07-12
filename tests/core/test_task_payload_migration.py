from backend.core.task_payload_migration import (
    migrate_task_payload_v1_to_v2,
    normalize_task_request_v2,
)
from backend.models.schemas import TaskResult


def _ref(path: str, *, kind: str, role: str | None = None) -> dict:
    return {
        "path": path,
        "name": path.rsplit("/", 1)[-1],
        "media_kind": kind,
        "role": role,
    }


def test_request_media_reference_wins_over_legacy_path_alias():
    migrated = normalize_task_request_v2(
        "transcribe",
        {
            "audio_ref": _ref("D:/media/canonical.wav", kind="audio"),
            "audio_path": "D:/media/legacy.wav",
            "model": "base",
        },
    )

    assert migrated["audio_ref"]["path"] == "D:/media/canonical.wav"
    assert "audio_path" not in migrated
    assert migrated["model"] == "base"


def test_result_input_refs_move_to_request_and_outputs_are_deduplicated():
    output = _ref("D:/renders/output.mp4", kind="video", role="output")
    second_output = _ref("D:/renders/preview.mp4", kind="video", role="output")
    subtitle_input = _ref("D:/media/source.srt", kind="subtitle", role="context")
    video_input = _ref("D:/media/source.mp4", kind="video", role="input")

    request, result = migrate_task_payload_v1_to_v2(
        task_type="synthesis",
        status="completed",
        request_params={"watermark_path": "D:/media/logo.png"},
        result={
            "success": True,
            "files": [{"type": "file", "path": output["path"]}],
            "meta": {
                "output_refs": [output, second_output],
                "output_paths": [output["path"], second_output["path"]],
                "subtitle_ref": subtitle_input,
                "original_ref": video_input,
                "preset": "fast",
            },
        },
        task_error=None,
    )

    assert request["video_ref"]["path"] == video_input["path"]
    assert request["srt_ref"]["path"] == subtitle_input["path"]
    assert request["watermark_ref"]["path"] == "D:/media/logo.png"
    assert "watermark_path" not in request
    typed_result = TaskResult.model_validate(result)
    assert [(artifact.kind, artifact.ref.path) for artifact in typed_result.artifacts] == [
        ("video", output["path"]),
        ("video", second_output["path"]),
    ]
    assert typed_result.meta == {"preset": "fast"}


def test_payload_normalization_is_content_idempotent():
    first_request, first_result = migrate_task_payload_v1_to_v2(
        task_type="translate",
        status="completed",
        request_params={
            "context_path": "D:/media/source.srt",
            "target_language": "Chinese",
        },
        result={
            "success": True,
            "files": [{"type": "srt", "path": "D:/media/source_ZH-CN.srt"}],
            "meta": {"language": "SimplifiedChinese"},
        },
        task_error=None,
    )
    second_request, second_result = migrate_task_payload_v1_to_v2(
        task_type="translate",
        status="completed",
        request_params=first_request,
        result=first_result,
        task_error=None,
    )

    assert second_request == first_request
    assert second_result == first_result
