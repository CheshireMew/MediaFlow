import pytest
from pydantic import ValidationError

from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE
from backend.models.task_model import Task
from backend.services.task_queue_view import TaskQueueView


def create_task(task_id: str, status: str) -> Task:
    terminal = status in {"completed", "failed", "cancelled"}
    return Task(
        id=task_id,
        type="download",
        status=status,
        persistence_scope="history" if terminal else "runtime",
        lifecycle=TASK_LIFECYCLE["history_only"] if terminal else TASK_LIFECYCLE["resumable"],
        progress=0.0,
        message_code="queued",
        message_params={},
        request_params={},
    )


def test_serialize_task_marks_active_backend_tasks_as_runtime():
    view = TaskQueueView()
    task = create_task("task-runtime", "running")

    payload = view.serialize_task(
        task,
        running_ids={"task-runtime"},
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert payload["queue_state"] == "running"
    assert payload["task_source"] == "backend"
    assert payload["task_contract_version"] == TASK_CONTRACT_VERSION
    assert payload["persistence_scope"] == "runtime"
    assert payload["lifecycle"] == "resumable"


def test_serialize_task_marks_terminal_backend_tasks_as_history():
    view = TaskQueueView()
    task = create_task("task-history", "completed")

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert payload["queue_state"] == "completed"
    assert payload["task_source"] == "backend"
    assert payload["task_contract_version"] == TASK_CONTRACT_VERSION
    assert payload["persistence_scope"] == "history"
    assert payload["lifecycle"] == "history-only"


def test_serialize_paused_task_status_wins_over_runtime_membership():
    view = TaskQueueView()
    task = create_task("task-paused", "paused")

    payload = view.serialize_task(
        task,
        running_ids={"task-paused"},
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert payload["queue_state"] == "paused"
    assert payload["persistence_scope"] == "runtime"
    assert payload["lifecycle"] == "resumable"


def test_serialize_pipeline_primary_operation_comes_from_first_step():
    view = TaskQueueView()
    task = Task(
        id="task-transcriber-pipeline",
        type="pipeline",
        status="pending",
        progress=0.0,
        message_code="queued",
        message_params={},
        request_params={
            "pipeline_id": "transcriber_tool",
            "steps": [
                {
                    "step_name": "transcribe",
                    "params": {
                        "audio_ref": {
                            "path": "E:/media/input.wav",
                            "name": "input.wav",
                            "media_kind": "audio",
                        }
                    },
                }
            ],
        },
    )

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids={"task-transcriber-pipeline"},
        queued_order=["task-transcriber-pipeline"],
    ).model_dump(mode="json")

    assert payload["primary_operation"] == "transcribe"
    assert payload["artifacts"] == [
        {
            "kind": "audio",
            "role": "input",
            "ref": {
                "path": "E:/media/input.wav",
                "name": "input.wav",
                "size": None,
                "type": None,
                "media_id": None,
                "media_kind": "audio",
                    "role": "input",
                "origin": None,
            },
        }
    ]


def test_serialize_video_output_ref_does_not_create_subtitle_artifact():
    view = TaskQueueView()
    task = Task(
        id="task-synthesis",
        type="synthesis",
        status="completed",
        persistence_scope="history",
        lifecycle=TASK_LIFECYCLE["history_only"],
        progress=100.0,
        message_code="queued",
        message_params={},
        request_params={
            "video_ref": {
                "path": "E:/video/input.mp4",
                "name": "input.mp4",
                "media_kind": "video",
                "role": "input",
            }
        },
        result={
            "success": True,
            "artifacts": [
                {
                    "kind": "video",
                    "role": "output",
                    "ref": {
                        "path": "E:/video/output.mp4",
                        "name": "output.mp4",
                        "media_kind": "video",
                        "role": "output",
                        "origin": "task",
                    },
                }
            ],
            "meta": {},
        },
    )

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert {
        (artifact["kind"], artifact["role"], artifact["ref"]["path"])
        for artifact in payload["artifacts"]
    } == {
        ("video", "input", "E:/video/input.mp4"),
        ("video", "output", "E:/video/output.mp4"),
    }
    assert not any(artifact["kind"] == "subtitle" for artifact in payload["artifacts"])


def test_serialize_synthesis_result_keeps_input_subtitle_out_of_output_artifacts():
    view = TaskQueueView()
    task = Task(
        id="task-synthesis",
        type="synthesis",
        status="completed",
        persistence_scope="history",
        lifecycle=TASK_LIFECYCLE["history_only"],
        progress=100.0,
        message_code="queued",
        message_params={},
        request_params={
            "video_ref": {
                "path": "E:/source/source.mp4",
                "name": "source.mp4",
                "media_kind": "video",
            },
            "srt_ref": {
                "path": "E:/source/source.srt",
                "name": "source.srt",
                "media_kind": "subtitle",
            },
        },
        result={
            "success": True,
            "artifacts": [
                {
                    "kind": "video",
                    "role": "output",
                    "ref": {
                        "path": "E:/renders/source_burned.mp4",
                        "name": "source_burned.mp4",
                        "media_kind": "video",
                        "role": "output",
                        "origin": "task",
                    },
                }
            ],
            "meta": {"options": {}},
        },
    )

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert {
        (artifact["kind"], artifact["role"], artifact["ref"]["path"])
        for artifact in payload["artifacts"]
    } == {
        ("video", "input", "E:/source/source.mp4"),
        ("subtitle", "input", "E:/source/source.srt"),
        ("video", "output", "E:/renders/source_burned.mp4"),
    }


def test_serialize_task_rejects_legacy_result_files_at_wire_boundary():
    view = TaskQueueView()
    task = Task(
        id="task-ts-output",
        type="download",
        status="completed",
        persistence_scope="history",
        lifecycle=TASK_LIFECYCLE["history_only"],
        progress=100.0,
        message_code="queued",
        message_params={},
        request_params={},
        result={
            "files": [{"path": "E:/video/capture.ts"}],
        },
    )

    with pytest.raises(ValidationError, match="result.files"):
        view.serialize_task(
            task,
            running_ids=set(),
            queued_ids=set(),
            queued_order=[],
        )


def test_serialize_translate_task_does_not_add_empty_video_ref_slot():
    view = TaskQueueView()
    task = Task(
        id="task-translate-no-video",
        type="translate",
        status="running",
        progress=10.0,
        message_code="queued",
        message_params={},
        request_params={
            "context_ref": {
                "path": "E:/subs/demo.srt",
                "name": "demo.srt",
                "media_kind": "subtitle",
            }
        },
    )

    payload = view.serialize_task(
        task,
        running_ids={"task-translate-no-video"},
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert "video_ref" not in payload["request_params"]


def test_serialize_task_preserves_native_structured_refs_without_path_normalization():
    view = TaskQueueView()
    task = Task(
        id="task-native-refs",
        type="translate",
        status="completed",
        persistence_scope="history",
        lifecycle=TASK_LIFECYCLE["history_only"],
        progress=100.0,
        message_code="queued",
        message_params={},
        request_params={
            "context_ref": {
                "path": "E:/subs/demo.srt",
                "name": "demo.srt",
                "media_kind": "subtitle",
                "role": "context",
                "origin": "task",
            }
        },
        result={
            "success": True,
            "artifacts": [
                {
                    "kind": "subtitle",
                    "role": "output",
                    "ref": {
                        "path": "E:/subs/demo_zh.srt",
                        "name": "demo_zh.srt",
                        "media_kind": "subtitle",
                        "role": "output",
                        "origin": "task",
                    },
                }
            ],
            "meta": {"language": "SimplifiedChinese"},
        },
    )

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert payload["request_params"]["context_ref"]["path"] == "E:/subs/demo.srt"
    assert payload["result"]["artifacts"][0]["ref"]["path"] == "E:/subs/demo_zh.srt"
    assert "subtitle_ref" not in payload["result"]["meta"]


def test_serialize_translate_task_uses_request_field_as_artifact_role_source():
    view = TaskQueueView()
    task = Task(
        id="task-translate-stale-context-role",
        type="translate",
        status="completed",
        persistence_scope="history",
        lifecycle=TASK_LIFECYCLE["history_only"],
        progress=100.0,
        message_code="queued",
        message_params={},
        request_params={
            "context_ref": {
                "path": "E:/subs/demo.srt",
                "name": "demo.srt",
                "media_kind": "subtitle",
                "role": "output",
                "origin": "task",
            }
        },
        result={
            "success": True,
            "artifacts": [
                {
                    "kind": "subtitle",
                    "role": "output",
                    "ref": {
                        "path": "E:/subs/demo_ZH-CN.srt",
                        "name": "demo_ZH-CN.srt",
                        "media_kind": "subtitle",
                        "role": "output",
                        "origin": "task",
                    },
                }
            ],
            "meta": {"language": "SimplifiedChinese"},
        },
    )

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert [
        (artifact["role"], artifact["ref"]["role"], artifact["ref"]["path"])
        for artifact in payload["artifacts"]
    ] == [
        ("context", "context", "E:/subs/demo.srt"),
        ("output", "output", "E:/subs/demo_ZH-CN.srt"),
    ]
