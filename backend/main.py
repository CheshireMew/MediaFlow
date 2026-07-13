import contextlib
import os
from urllib.parse import urlparse

from loguru import logger
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from backend.config import settings
from backend.core.backend_bootstrap import backend_bootstrap
from backend.core.container import container

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


@contextlib.asynccontextmanager
async def lifespan(app: Starlette):
    # === Startup Logic ===
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    settings.init_dirs()
    
    # Configure File Logging
    log_file = settings.USER_DATA_DIR / "logs" / "mediaflow.log"
    try:
        logger.add(
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
        logger.warning("Falling back to non-queued file logging due to restricted environment.")
        logger.add(
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
    backend_bootstrap.configure(container)
    backend_bootstrap.start_background()

    yield
    
    # === Shutdown Logic ===
    logger.info("Shutting down...")
    await backend_bootstrap.stop()


backend_bootstrap.configure(container)


async def health_check(_request):
    """Heartbeat endpoint to check if core is running."""
    from backend.models.schemas import HealthResponse

    response = HealthResponse(
        status="online",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
    )
    return JSONResponse(
        response.model_dump(mode="json")
    )


app = Starlette(
    routes=[
        Route("/health", health_check, methods=["GET"]),
        Mount("/", app=backend_bootstrap),
    ],
    lifespan=lifespan,
)

# CORS (Restricted to local Electron and the active Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app", 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.DEBUG
    )
