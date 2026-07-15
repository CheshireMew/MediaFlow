import asyncio
from collections.abc import Awaitable

from loguru import logger

from backend.config import settings


POST_HEALTH_BOOTSTRAP_DELAY_SECONDS = 0.25


def _create_fastapi_app(dependencies):
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from backend.api.v1 import (
        analyze,
        audio,
        cookies,
        editor,
        glossary,
        pipeline,
        settings as settings_api,
        tasks,
        transcribe,
        translate,
        ws,
    )

    api_app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    routers = [
        transcribe.create_router(dependencies.transcription),
        translate.create_router(dependencies.translation),
        pipeline.create_router(dependencies.task_orchestrator),
        analyze.create_router(dependencies.download),
        cookies.create_router(dependencies.download),
        ws.create_router(
            notifier=dependencies.websocket_notifier,
            task_manager=dependencies.task_manager,
        ),
        tasks.create_router(
            task_manager=dependencies.task_manager,
            task_orchestrator=dependencies.task_orchestrator,
        ),
        settings_api.create_router(
            settings_application=dependencies.settings,
            asr_service=dependencies.asr_service,
        ),
        audio.router,
        glossary.create_router(dependencies.glossary),
        editor.create_router(
            highlight_application=dependencies.highlight,
            settings_application=dependencies.settings,
        ),
    ]
    prefixed_routers = [(router, "/api/v1") for router in routers]
    for router, prefix in prefixed_routers:
        api_app.include_router(router, prefix=prefix)

    @api_app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        logger.warning(f"ValueError on {request.method} {request.url}: {exc}")
        return JSONResponse(
            status_code=400,
            content={"error": str(exc), "detail": "Bad request"},
        )

    @api_app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": str(exc), "detail": "Internal server error"},
        )

    return api_app, len(prefixed_routers)


class BackendBootstrap:
    def __init__(self) -> None:
        self._container = None
        self._runtime = None
        self._ready_task: asyncio.Task | None = None
        self._background_task: asyncio.Task | None = None
        self._api_app = None
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def configure(self, container) -> None:
        self._container = container

    def start_background(self) -> None:
        self._bind_running_loop()
        if self._background_task and not self._background_task.done():
            return
        self._background_task = asyncio.create_task(self._start_after_health_window())

    async def _start_after_health_window(self) -> None:
        await asyncio.sleep(POST_HEALTH_BOOTSTRAP_DELAY_SECONDS)
        await self.ensure_ready()

    async def ensure_ready(self) -> None:
        self._bind_running_loop()
        async with self._lock:
            should_start = self._ready_task is None or self._ready_task.cancelled()
            if (
                not should_start
                and self._ready_task.done()
                and self._ready_task.exception()
            ):
                should_start = True

            if should_start:
                self._ready_task = asyncio.create_task(self._load())
            ready_task = self._ready_task

        await ready_task

    async def stop(self) -> None:
        tasks: list[Awaitable] = []
        if self._background_task and not self._background_task.done():
            self._background_task.cancel()
            tasks.append(self._background_task)
        if self._ready_task and not self._ready_task.done():
            self._ready_task.cancel()
            tasks.append(self._ready_task)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        if self._runtime is not None:
            await self._runtime.stop()
            self._runtime = None

        self._ready_task = None
        self._background_task = None
        self._api_app = None
        self._loop = None

    def _bind_running_loop(self) -> None:
        current_loop = asyncio.get_running_loop()
        if self._loop is current_loop:
            return

        self._runtime = None
        self._ready_task = None
        self._background_task = None
        self._api_app = None
        self._lock = asyncio.Lock()
        self._loop = current_loop

    async def _load(self) -> None:
        if self._container is None:
            raise RuntimeError("Backend bootstrap is not configured.")

        runtime = await self._start_runtime()
        await self._load_api_app(runtime.build_api_dependencies())

    async def _start_runtime(self) -> None:
        from backend.runtime.application_runtime import ApplicationRuntime

        runtime = ApplicationRuntime(self._container)
        registered_count = await runtime.start()
        self._runtime = runtime
        logger.info(f"Registered {registered_count} services")
        return runtime

    async def _load_api_app(self, dependencies) -> None:
        if self._api_app is not None:
            return

        api_app, router_count = await asyncio.to_thread(
            _create_fastapi_app,
            dependencies,
        )
        self._api_app = api_app
        logger.info(f"Loaded FastAPI app with {router_count} HTTP API routers")

    async def __call__(self, scope, receive, send) -> None:
        await self.ensure_ready()
        if self._api_app is None:
            raise RuntimeError("FastAPI app was not loaded.")
        await self._api_app(scope, receive, send)


backend_bootstrap = BackendBootstrap()
