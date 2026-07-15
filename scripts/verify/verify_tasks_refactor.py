import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.application.pipeline_steps.clip_export import ClipExportStep
from backend.application.pipeline_steps.download import DownloadStep
from backend.application.pipeline_steps.registry import StepRegistry
from backend.application.pipeline_steps.synthesize import SynthesizeStep
from backend.application.pipeline_steps.transcribe import TranscribeStep
from backend.application.pipeline_steps.translate import TranslateStep
from backend.contracts import pipeline_step_names, task_types
from backend.models.pipeline_contracts import PIPELINE_STEP_PARAM_MODELS, PipelineRequest


def create_registry() -> StepRegistry:
    dependency = object()
    return StepRegistry(
        [
            DownloadStep(downloader=dependency, task_manager=dependency),
            TranscribeStep(asr_service=dependency, task_manager=dependency),
            TranslateStep(translator=dependency, task_manager=dependency),
            SynthesizeStep(synthesis=dependency, task_manager=dependency),
            ClipExportStep(video_synthesis=dependency, task_manager=dependency),
        ]
    )


def verify_catalog_boundaries(registry: StepRegistry) -> None:
    print("Verifying canonical task and pipeline boundaries...")

    PipelineRequest.model_json_schema()
    schema_step_names = set(PIPELINE_STEP_PARAM_MODELS)
    catalog_step_names = pipeline_step_names()
    if schema_step_names != catalog_step_names:
        raise RuntimeError(
            "Pipeline schema/catalog mismatch: "
            f"schema={sorted(schema_step_names)}, catalog={sorted(catalog_step_names)}"
        )

    registered_steps = set(registry.list_steps())
    if registered_steps != catalog_step_names:
        raise RuntimeError(
            "Pipeline registry/catalog mismatch: "
            f"registered={sorted(registered_steps)}, catalog={sorted(catalog_step_names)}"
        )

    if task_types() != {"pipeline"}:
        raise RuntimeError(f"Retired task types remain in the catalog: {sorted(task_types())}")

    PipelineRequest.model_validate(
        {
            "pipeline_id": "verification",
            "steps": [
                {
                    "step_name": "transcribe",
                    "params": {
                        "audio_ref": {"path": "test.wav", "name": "test.wav"},
                    },
                }
            ],
        }
    )

    print("Task types and pipeline steps match the catalog.")


if __name__ == "__main__":
    verify_catalog_boundaries(create_registry())
