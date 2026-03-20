from backend.application.task_orchestrator import TaskOrchestrator
from backend.services.task_manager import TaskManager


def create_orchestrator(manager: TaskManager) -> TaskOrchestrator:
    class DummySettingsManager:
        def get_settings(self):
            return None

    return TaskOrchestrator(
        task_manager=manager,
        pipeline_runner=None,
        settings_manager=DummySettingsManager(),
    )


def test_download_dedup_distinguishes_resolution_and_codec():
    manager = TaskManager()
    orchestrator = create_orchestrator(manager)

    params_720p = {
        "steps": [
            {
                "step_name": "download",
                "params": {
                    "url": "https://example.com/video",
                    "resolution": "720p",
                    "codec": "avc",
                    "download_subs": False,
                },
            }
        ]
    }
    params_1080p = {
        "steps": [
            {
                "step_name": "download",
                "params": {
                    "url": "https://example.com/video",
                    "resolution": "1080p",
                    "codec": "best",
                    "download_subs": False,
                },
            }
        ]
    }

    class DummyTask:
        def __init__(self, task_id: str, request_params: dict):
            self.id = task_id
            self.type = "download"
            self.request_params = request_params

    manager.tasks["task-a"] = DummyTask("task-a", params_720p)

    assert orchestrator.find_existing_task("download", params_720p) == "task-a"
    assert orchestrator.find_existing_task("download", params_1080p) is None


def test_download_dedup_distinguishes_subtitle_setting():
    manager = TaskManager()
    orchestrator = create_orchestrator(manager)

    params_without_subs = {
        "steps": [
            {
                "step_name": "download",
                "params": {
                    "url": "https://example.com/video",
                    "download_subs": False,
                },
            }
        ]
    }
    params_with_subs = {
        "steps": [
            {
                "step_name": "download",
                "params": {
                    "url": "https://example.com/video",
                    "download_subs": True,
                },
            }
        ]
    }

    class DummyTask:
        def __init__(self, task_id: str, request_params: dict):
            self.id = task_id
            self.type = "download"
            self.request_params = request_params

    manager.tasks["task-b"] = DummyTask("task-b", params_without_subs)

    assert orchestrator.find_existing_task("download", params_without_subs) == "task-b"
    assert orchestrator.find_existing_task("download", params_with_subs) is None
