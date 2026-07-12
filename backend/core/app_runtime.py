from backend.core.container import Services
from loguru import logger


class ApplicationRuntime:
    def __init__(self, container):
        self._container = container

    def register_services(self) -> int:
        from backend.core.service_registry import register_all_services

        return register_all_services(self._container)

    def validate_runtime_contracts(self) -> None:
        task_runners = self._container.get(Services.TASK_RUNNER_REGISTRY)
        task_runners.validate()
        from backend.models.schemas import PIPELINE_STEP_PARAM_MODELS
        from backend.core.task_catalog import pipeline_step_names

        configured_steps = set(
            self._container.get(Services.PIPELINE_STEPS).list_steps()
        )
        catalog_steps = pipeline_step_names()
        model_steps = set(PIPELINE_STEP_PARAM_MODELS)
        if configured_steps != catalog_steps or configured_steps != model_steps:
            raise RuntimeError(
                "Pipeline step model/catalog mismatch: "
                f"registered={sorted(configured_steps)}, "
                f"catalog={sorted(catalog_steps)}, models={sorted(model_steps)}"
            )

    async def start(self) -> int:
        registered_count = self.register_services()
        self.validate_runtime_contracts()
        self._start_asr_cli_prewarm()
        return registered_count

    def build_api_dependencies(self):
        from backend.application.download_service import DownloadApplicationService
        from backend.application.glossary_service import GlossaryApplicationService
        from backend.application.highlight_service import HighlightApplicationService
        from backend.application.settings_service import SettingsApplicationService
        from backend.application.task_operations import TaskOperationService
        from backend.core.api_dependencies import ApiDependencies

        task_orchestrator = self._container.get(Services.TASK_ORCHESTRATOR)
        task_executor = self._container.get(Services.TASK_OPERATION_EXECUTOR)
        settings_manager = self._container.get(Services.SETTINGS_MANAGER)
        return ApiDependencies(
            download=DownloadApplicationService(
                task_orchestrator=task_orchestrator,
                analyzer=self._container.get(Services.ANALYZER),
                cookie_manager=self._container.get(Services.COOKIE_MANAGER),
            ),
            task_operations=TaskOperationService(
                executor=task_executor,
                orchestrator=task_orchestrator,
            ),
            task_manager=self._container.get(Services.TASK_MANAGER),
            task_orchestrator=task_orchestrator,
            websocket_notifier=self._container.get(Services.WS_NOTIFIER),
            settings=SettingsApplicationService(settings_manager),
            glossary=GlossaryApplicationService(
                self._container.get(Services.GLOSSARY)
            ),
            highlight=HighlightApplicationService(settings_manager),
            asr_service=self._container.get(Services.ASR),
        )

    def _start_asr_cli_prewarm(self) -> None:
        if not self._container.has(Services.SETTINGS_MANAGER) or not self._container.has(Services.ASR):
            return

        settings_manager = self._container.get(Services.SETTINGS_MANAGER)
        preferences = settings_manager.get_asr_execution_preferences()
        if preferences.engine != "cli":
            return

        started = self._container.get(Services.ASR).start_cli_prewarm(
            model_name=preferences.model,
            device=preferences.device,
        )
        if started:
            logger.info(
                "Faster-Whisper CLI prewarm scheduled from ASR preferences: model={} device={}",
                preferences.model,
                preferences.device,
            )

    async def stop(self) -> None:
        if self._container.is_instantiated(Services.TASK_MANAGER):
            await self._container.get(Services.TASK_MANAGER).shutdown_async()
        if self._container.is_instantiated(Services.BROWSER):
            await self._container.get(Services.BROWSER).stop()
        from backend.core.database import shutdown_db

        await shutdown_db()
        self._container.reset()
