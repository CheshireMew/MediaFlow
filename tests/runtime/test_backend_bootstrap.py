from unittest.mock import AsyncMock

import pytest

from backend.runtime.backend_bootstrap import BackendBootstrap


@pytest.mark.asyncio
async def test_bootstrap_reports_ready_only_after_runtime_and_routes_are_loaded(monkeypatch):
    bootstrap = BackendBootstrap()
    bootstrap.configure(object())

    class RuntimeStub:
        def build_api_dependencies(self):
            return object()

    runtime = RuntimeStub()
    start_runtime = AsyncMock(return_value=runtime)

    async def load_api_app(_dependencies):
        bootstrap._api_app = object()

    monkeypatch.setattr(bootstrap, "_start_runtime", start_runtime)
    monkeypatch.setattr(bootstrap, "_load_api_app", load_api_app)

    assert bootstrap.health_snapshot() == ("starting", None)
    await bootstrap.ensure_ready()

    assert bootstrap.health_snapshot() == ("ready", None)
    start_runtime.assert_awaited_once()


@pytest.mark.asyncio
async def test_bootstrap_keeps_a_stable_failure_for_process_level_recovery(monkeypatch):
    bootstrap = BackendBootstrap()
    bootstrap.configure(object())
    start_runtime = AsyncMock(side_effect=RuntimeError("dependency startup failed"))
    monkeypatch.setattr(bootstrap, "_start_runtime", start_runtime)

    with pytest.raises(RuntimeError, match="dependency startup failed"):
        await bootstrap.ensure_ready()

    assert bootstrap.health_snapshot() == ("failed", "dependency startup failed")
    with pytest.raises(RuntimeError, match="dependency startup failed"):
        await bootstrap.ensure_ready()
    start_runtime.assert_awaited_once()
