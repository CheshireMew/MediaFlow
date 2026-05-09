from backend.core.container import Services
from backend.core.runtime_access import configure_runtime_services, reset_runtime_services


class ApplicationRuntime:
    def __init__(self, container):
        self._container = container

    def register_services(self) -> int:
        from backend.core.service_registry import register_all_services

        return register_all_services(self._container)

    def register_task_runners(self) -> None:
        from backend.core.tasks.registry import (
            register_all_task_runners,
            validate_required_task_runners,
        )

        register_all_task_runners()
        validate_required_task_runners()
        from backend.models.schemas import PIPELINE_STEP_PARAM_MODELS
        from backend.core.task_catalog import pipeline_step_names

        configured_steps = pipeline_step_names()
        model_steps = set(PIPELINE_STEP_PARAM_MODELS)
        if configured_steps != model_steps:
            raise RuntimeError(
                "Pipeline step model/catalog mismatch: "
                f"catalog={sorted(configured_steps)}, models={sorted(model_steps)}"
            )

    async def start(self) -> int:
        registered_count = self.register_services()
        self.register_task_runners()
        configure_runtime_services(self._container)
        return registered_count

    async def stop(self) -> None:
        if self._container.is_instantiated(Services.TASK_MANAGER):
            await self._container.get(Services.TASK_MANAGER).shutdown_async()
        if self._container.is_instantiated(Services.BROWSER):
            await self._container.get(Services.BROWSER).stop()
        from backend.core.database import shutdown_db

        await shutdown_db()
        reset_runtime_services()
        self._container.reset()
