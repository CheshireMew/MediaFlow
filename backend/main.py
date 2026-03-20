from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
import contextlib

from backend.config import settings
from backend.core.database import shutdown_db
from backend.api.v1 import (
    transcribe, pipeline, analyze, ws, tasks, cookies,
    translate, settings as settings_api, audio, glossary,
    editor, ocr, preprocessing,
)

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # === Service Registration ===
    from backend.core.container import container, Services
    from backend.core.service_registry import register_all_services
    from backend.core.tasks.registry import (
        register_all_task_handlers,
        validate_required_task_handlers,
    )
    register_all_services()
    register_all_task_handlers()
    validate_required_task_handlers()
    
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
            level="DEBUG",
            encoding="utf-8",
            enqueue=True,
            backtrace=True,
            diagnose=True
        )
    except PermissionError:
        logger.warning("Falling back to non-queued file logging due to restricted environment.")
        logger.add(
            log_file,
            rotation="10 MB",
            retention="7 days",
            level="DEBUG",
            encoding="utf-8",
            enqueue=False,
            backtrace=True,
            diagnose=True
        )
    
    logger.info(f"Directories initialized at {settings.BASE_DIR}")
    logger.info(f"Log file configured at {log_file}")
    logger.info(f"Registered {len(container._factories)} services")
    
    # Initialize Database & Load Tasks, wire WebSocket notifier
    if container.has(Services.TASK_MANAGER):
        tm = container.get(Services.TASK_MANAGER)
        notifier = container.get(Services.WS_NOTIFIER)
        tm.set_notifier(notifier)
        await tm.init_async()

    # Write server.json for frontend discovery
    import json
    server_config = {
        "base_url": f"http://{settings.HOST}:{settings.PORT}/api/v1",
        "ws_url": f"ws://{settings.HOST}:{settings.PORT}/api/v1",
        "port": settings.PORT
    }
    config_path = settings.USER_DATA_DIR / "server.json"
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(server_config, f, indent=2)
        logger.info(f"Wrote server config to {config_path}")
    except Exception as e:
        logger.error(f"Failed to write server config: {e}")

    yield
    
    # === Shutdown Logic ===
    logger.info("Shutting down...")
    if container.has(Services.TASK_MANAGER) and Services.TASK_MANAGER in container._instances:
        tm = container.get(Services.TASK_MANAGER)
        await tm.shutdown_async()
    # Stop browser if it was instantiated
    if container.has(Services.BROWSER) and Services.BROWSER in container._instances:
        browser = container.get(Services.BROWSER)
        await browser.stop()
    await shutdown_db()
    container.reset()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


app.include_router(transcribe.router, prefix="/api/v1")
app.include_router(translate.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(analyze.router, prefix="/api/v1")
app.include_router(ws.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(settings_api.router, prefix="/api/v1")
app.include_router(audio.router, prefix="/api/v1")
app.include_router(glossary.router, prefix="/api/v1")

app.include_router(editor.router, prefix="/api/v1")
app.include_router(ocr.router, prefix="/api/v1/ocr")
app.include_router(preprocessing.router, prefix="/api/v1/preprocessing")

# CORS (Restricted to local Electron and Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",   # Vite Dev Server
        "http://localhost:5173",
        f"http://127.0.0.1:{settings.PORT}",   # FastAPI (self)
        f"http://localhost:{settings.PORT}",
        "file://",                  # Electron Production
        "app://.",                  # Electron custom protocol
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ─── Global Error Handlers ────────────────────────────────────────
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Return 400 for business logic / input validation errors."""
    logger.warning(f"ValueError on {request.method} {request.url}: {exc}")
    return JSONResponse(
        status_code=400,
        content={"error": str(exc), "detail": "Bad request"},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all: return 500 with consistent JSON shape."""
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "detail": "Internal server error"},
    )

@app.get("/health")
async def health_check():
    """Heartbeat endpoint to check if core is running."""
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app", 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.DEBUG
    )
