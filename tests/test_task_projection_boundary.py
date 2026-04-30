from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_status_projection_has_single_contract_source():
    forbidden = [
        'status in {"pending", "running", "paused", "processing_result"}',
        '"processing_result"])',
        'new Set<TaskStatus>(["running", "processing_result"])',
    ]
    scanned_paths = [
        "backend/services/task_repository.py",
        "backend/services/task_queue_view.py",
        "frontend/src/services/tasks/taskRuntimeState.ts",
        "frontend/src/contracts/runtimeContracts.ts",
    ]

    for path in scanned_paths:
        content = read(path)
        for pattern in forbidden:
            assert pattern not in content, f"{pattern} remains in {path}"


def test_renderer_task_projection_does_not_use_legacy_pipeline_or_output_ref_inference():
    forbidden_by_path = {
        "frontend/src/components/task-monitor/TaskMonitorItem.tsx": [
            "isDownloadPipeline",
            'case "pipeline"',
            "name?.toLowerCase().includes",
            'task.type !== "transcribe"',
            'task.type !== "translate"',
        ],
        "frontend/src/components/task-monitor/useTaskMonitorOverview.ts": [
            "task.type === 'pipeline'",
            "name?.toLowerCase().includes",
            "step.step_name === 'download'",
        ],
        "frontend/src/services/tasks/taskMediaResolver.ts": [
            "outputRef?.path",
            "params.output_ref",
            "resultMeta?.output_ref",
            'task.type === "pipeline"',
            'step.step_name === "transcribe"',
        ],
        "frontend/src/services/tasks/resultMediaReferences.ts": [
            "result.output_ref",
        ],
    }

    for path, patterns in forbidden_by_path.items():
        content = read(path)
        for pattern in patterns:
            assert pattern not in content, f"{pattern} remains in {path}"
