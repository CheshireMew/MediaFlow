from types import SimpleNamespace

from backend.core.app_runtime import ApplicationRuntime
from backend.core.container import Services


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
