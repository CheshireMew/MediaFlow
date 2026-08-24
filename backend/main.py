import contextlib
import os
from urllib.parse import urlparse

from loguru import logger
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from backend.config import settings
from backend.core.container import ServiceContainer, container
from backend.runtime.backend_bootstrap import BackendBootstrap, backend_bootstrap
from backend.services.storage_policy import recover_interrupted_storage_runs

RENDERER_DEV_ORIGIN_ENV = "MEDIAFLOW_RENDERER_DEV_ORIGIN"


def _resolve_renderer_dev_origin() -> str | None:
    raw_origin = os.environ.get(RENDERER_DEV_ORIGIN_ENV, "").strip().rstrip("/")
    if not raw_origin:
        return None

    parsed = urlparse(raw_origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        logger.warning(f"Ignoring invalid {RENDERER_DEV_ORIGIN_ENV}: {raw_origin}")
        return None

    return f"{parsed.scheme}://{parsed.netloc}"


def _build_cors_origins() -> list[str]:
    origins = [
        f"http://127.0.0.1:{settings.PORT}",   # FastAPI (self)
        f"http://localhost:{settings.PORT}",
        "file://",                  # Electron Production
        "app://.",                  # Electron custom protocol
    ]

    renderer_dev_origin = _resolve_renderer_dev_origin()
    if renderer_dev_origin:
        origins.insert(0, renderer_dev_origin)

    return origins


def create_app(
    *,
    runtime_container: ServiceContainer | None = None,
    bootstrap: BackendBootstrap | None = None,
) -> Starlette:
    selected_container = runtime_container or ServiceContainer()
    selected_bootstrap = bootstrap or BackendBootstrap()
    selected_bootstrap.configure(selected_container)

    @contextlib.asynccontextmanager
    async def lifespan(_app: Starlette):
        logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
        settings.prepare_runtime_environment()
        recover_interrupted_storage_runs()

        log_file = settings.USER_DATA_DIR / "logs" / "mediaflow.log"
        log_sink_id = None
        try:
            log_sink_id = logger.add(
                log_file,
                rotation="10 MB",
                retention="7 days",
                level=settings.LOG_LEVEL,
                encoding="utf-8",
                enqueue=True,
                backtrace=settings.DEBUG,
                diagnose=settings.DEBUG,
            )
        except PermissionError:
            logger.warning(
                "Falling back to non-queued file logging due to restricted environment."
            )
            log_sink_id = logger.add(
                log_file,
                rotation="10 MB",
                retention="7 days",
                level=settings.LOG_LEVEL,
                encoding="utf-8",
                enqueue=False,
                backtrace=settings.DEBUG,
                diagnose=settings.DEBUG,
            )

        logger.info(f"Runtime directories initialized at {settings.RUNTIME_DIR}")
        logger.info(f"Log file configured at {log_file}")
        selected_bootstrap.start_background()

        try:
            yield
        finally:
            logger.info("Shutting down...")
            try:
                await selected_bootstrap.stop()
            finally:
                if log_sink_id is not None:
                    logger.remove(log_sink_id)

    async def health_check(_request):
        from backend.models.task_contracts import HealthResponse

        status, error = selected_bootstrap.health_snapshot()
        response = HealthResponse(
            status=status,
            service=settings.APP_NAME,
            version=settings.APP_VERSION,
            error=error,
        )
        return JSONResponse(
            response.model_dump(mode="json"),
            status_code=200 if status == "ready" else 503,
        )

    application = Starlette(
        routes=[
            Route("/health", health_check, methods=["GET"]),
            Mount("/", app=selected_bootstrap),
        ],
        lifespan=lifespan,
    )
    application.state.service_container = selected_container
    application.state.backend_bootstrap = selected_bootstrap
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_build_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    return application


app = create_app(runtime_container=container, bootstrap=backend_bootstrap)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app", 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.DEBUG
    )
