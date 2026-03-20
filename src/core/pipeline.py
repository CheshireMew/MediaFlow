from backend.core.container import container, Services
from backend.core.service_registry import register_all_services
from backend.core.pipeline import PipelineRunner

if not container.has(Services.TASK_MANAGER):
    register_all_services()

task_manager = container.get(Services.TASK_MANAGER)

__all__ = ["PipelineRunner", "task_manager"]
