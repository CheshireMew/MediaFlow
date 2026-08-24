from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.core.container import ServiceContainer, Services
from backend.runtime.application_runtime import ApplicationRuntime


class FakeRuntimeContainer:
    def __init__(self, services):
        self._services = services
        self.accessed = []

    def has(self, name):
        return name in self._services

    def get(self, name):
        self.accessed.append(name)
        return self._services[name]


def test_app_runtime_starts_cli_prewarm_from_saved_asr_preferences():
    asr_service = SimpleNamespace(calls=[])
    asr_service.start_cli_prewarm = lambda **kwargs: asr_service.calls.append(kwargs) or True
    settings_manager = SimpleNamespace(
        get_asr_execution_preferences=lambda: SimpleNamespace(
            engine="cli",
            model="large-v2",
            device="cuda",
        )
    )
    container = FakeRuntimeContainer(
        {
            Services.SETTINGS_MANAGER: settings_manager,
            Services.ASR: asr_service,
        }
    )

    ApplicationRuntime(container)._start_asr_cli_prewarm()

    assert asr_service.calls == [{"model_name": "large-v2", "device": "cuda"}]


def test_app_runtime_does_not_start_cli_prewarm_for_builtin_engine():
    asr_service = SimpleNamespace(calls=[])
    asr_service.start_cli_prewarm = lambda **kwargs: asr_service.calls.append(kwargs) or True
    settings_manager = SimpleNamespace(
        get_asr_execution_preferences=lambda: SimpleNamespace(
            engine="builtin",
            model="large-v2",
            device="cuda",
        )
    )
    container = FakeRuntimeContainer(
        {
            Services.SETTINGS_MANAGER: settings_manager,
            Services.ASR: asr_service,
        }
    )

    ApplicationRuntime(container)._start_asr_cli_prewarm()

    assert asr_service.calls == []


@pytest.mark.asyncio
async def test_app_runtime_reaches_ready_boundary_only_after_task_runtime_is_warm():
    task_manager = SimpleNamespace(warm_start_async=AsyncMock())
    container = FakeRuntimeContainer({Services.TASK_MANAGER: task_manager})
    runtime = ApplicationRuntime(container)
    runtime.register_services = lambda: 17
    runtime.validate_runtime_contracts = lambda: None
    prewarm_calls: list[str] = []
    runtime._start_asr_cli_prewarm = lambda: prewarm_calls.append("prewarm")

    registered_count = await runtime.start()

    assert registered_count == 17
    task_manager.warm_start_async.assert_awaited_once()
    assert prewarm_calls == ["prewarm"]


@pytest.mark.asyncio
async def test_app_runtime_does_not_prewarm_asr_when_task_runtime_startup_fails():
    task_manager = SimpleNamespace(
        warm_start_async=AsyncMock(side_effect=RuntimeError("database unavailable"))
    )
    container = FakeRuntimeContainer({Services.TASK_MANAGER: task_manager})
    runtime = ApplicationRuntime(container)
    runtime.register_services = lambda: 17
    runtime.validate_runtime_contracts = lambda: None
    prewarm_calls: list[str] = []
    runtime._start_asr_cli_prewarm = lambda: prewarm_calls.append("prewarm")

    with pytest.raises(RuntimeError, match="database unavailable"):
        await runtime.start()

    assert prewarm_calls == []


def test_runtime_contract_validation_does_not_resolve_registered_services():
    class ValidationOnlyContainer:
        def get(self, _name):
            raise AssertionError("runtime validation must not instantiate services")

    ApplicationRuntime(ValidationOnlyContainer()).validate_runtime_contracts()


def test_api_dependency_wiring_keeps_heavy_services_lazy():
    container = ServiceContainer()
    instantiated: list[str] = []

    def register(name, instance):
        container.register(name, lambda: instance)

    register(Services.SETTINGS_MANAGER, SimpleNamespace())
    register(Services.TASK_MANAGER, SimpleNamespace())
    register(Services.WS_NOTIFIER, SimpleNamespace())
    for service in (
        Services.TASK_ORCHESTRATOR,
        Services.ANALYZER,
        Services.COOKIE_MANAGER,
        Services.ASR,
        Services.LLM_TRANSLATOR,
        Services.GLOSSARY,
    ):
        service_name = service.name

        def create_heavy(name=service_name):
            instantiated.append(name)
            return SimpleNamespace()

        container.register(service, create_heavy)

    dependencies = ApplicationRuntime(container).build_api_dependencies()

    assert dependencies.task_manager is container.get(Services.TASK_MANAGER)
    assert instantiated == []
