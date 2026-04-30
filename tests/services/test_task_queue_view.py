from backend.contracts import TASK_CONTRACT_VERSION, TASK_LIFECYCLE
from backend.models.task_model import Task
from backend.services.task_queue_view import TaskQueueView


def create_task(task_id: str, status: str) -> Task:
    terminal = status in {"completed", "failed", "cancelled"}
    return Task(
        id=task_id,
        type="test",
        status=status,
        persistence_scope="history" if terminal else "runtime",
        lifecycle=TASK_LIFECYCLE["history_only"] if terminal else TASK_LIFECYCLE["resumable"],
        progress=0.0,
        message="",
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


def test_serialize_translate_task_does_not_add_empty_video_ref_slot():
    view = TaskQueueView()
    task = Task(
        id="task-translate-no-video",
        type="translate",
        status="running",
        progress=10.0,
        message="",
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
        message="",
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
            "files": [{"type": "subtitle", "path": "E:/subs/demo_zh.srt"}],
            "meta": {
                "subtitle_ref": {
                    "path": "E:/subs/demo_zh.srt",
                    "name": "demo_zh.srt",
                    "media_kind": "subtitle",
                    "role": "output",
                    "origin": "task",
                },
                "output_ref": {
                    "path": "E:/subs/demo_zh.srt",
                    "name": "demo_zh.srt",
                    "media_kind": "subtitle",
                    "role": "output",
                    "origin": "task",
                },
            },
        },
    )

    payload = view.serialize_task(
        task,
        running_ids=set(),
        queued_ids=set(),
        queued_order=[],
    ).model_dump(mode="json")

    assert payload["request_params"]["context_ref"]["path"] == "E:/subs/demo.srt"
    assert payload["result"]["meta"]["subtitle_ref"]["path"] == "E:/subs/demo_zh.srt"
