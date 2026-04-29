import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from backend.core.tasks.registry import (
    build_task_runner,
    register_all_task_runners,
    registered_task_types,
    validate_required_task_runners,
)
from backend.models.task_model import Task


def verify_registry():
    print("Verifying task runner registry...")

    register_all_task_runners()
    validate_required_task_runners()

    expected = {
        "transcribe",
        "synthesis",
        "enhancement",
        "cleanup",
        "pipeline",
        "download",
        "translate",
        "extract",
        "transcribe_segment",
    }
    registered = registered_task_types()
    missing = expected - registered
    if missing:
        raise RuntimeError(f"Missing task runners: {sorted(missing)}")

    print(f"Registered task runners: {sorted(registered)}")


def verify_runner_build():
    print("\nVerifying task runner build...")

    task = Task(
        id="test-123",
        type="transcribe",
        status="failed",
        request_params={
            "audio_path": "test.wav",
            "model": "base",
            "language": "en",
        },
    )

    runner = build_task_runner(task)
    if not callable(runner):
        raise RuntimeError(f"build_task_runner returned non-callable: {runner!r}")

    print("build_task_runner('transcribe') returned a callable runner.")


if __name__ == "__main__":
    verify_registry()
    verify_runner_build()
