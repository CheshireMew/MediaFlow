from types import SimpleNamespace

from backend.application.task_request_deduplicator import TaskRequestDeduplicator


def pipeline_params(*, resolution: str = "best", download_subs: bool = False) -> dict:
    return {
        "pipeline_id": "downloader_tool",
        "steps": [
            {
                "step_name": "download",
                "params": {
                    "url": "https://example.com/video",
                    "resolution": resolution,
                    "codec": "best",
                    "download_subs": download_subs,
                },
            }
        ],
    }


def test_pipeline_dedup_distinguishes_download_result_inputs():
    existing = SimpleNamespace(
        id="task-a",
        type="pipeline",
        status="pending",
        request_params=pipeline_params(resolution="720p"),
    )
    deduplicator = TaskRequestDeduplicator()

    assert deduplicator.find_existing_task(
        [existing], "pipeline", pipeline_params(resolution="720p")
    ) == "task-a"
    assert deduplicator.find_existing_task(
        [existing], "pipeline", pipeline_params(resolution="1080p")
    ) is None
    assert deduplicator.find_existing_task(
        [existing], "pipeline", pipeline_params(resolution="720p", download_subs=True)
    ) is None


def test_pipeline_dedup_ignores_terminal_tasks():
    completed = SimpleNamespace(
        id="task-completed",
        type="pipeline",
        status="completed",
        request_params=pipeline_params(),
    )
    assert TaskRequestDeduplicator().find_existing_task(
        [completed], "pipeline", pipeline_params()
    ) is None
