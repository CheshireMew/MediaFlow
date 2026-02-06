from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import contextlib

from src.config import settings
from src.api.v1 import transcribe, pipeline, analyze, ws, tasks, cookies, translate, settings as settings_api, audio, glossary

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # === Service Registration ===
    from src.core.container import container, Services
    from src.services.task_manager import TaskManager
    from src.services.asr import ASRService
    from src.services.downloader import DownloaderService
    from src.services.browser_service import BrowserService
    from src.services.sniffer import NetworkSniffer
    from src.services.settings_manager import SettingsManager
    from src.services.cookie_manager import CookieManager
    from src.services.analyzer import AnalyzerService
    from src.services.translator.llm_translator import LLMTranslator
    from src.services.translator.glossary_service import GlossaryService
    from src.core.pipeline import PipelineRunner
    
    container.register(Services.TASK_MANAGER, TaskManager)
    container.register(Services.ASR, ASRService)
    container.register(Services.DOWNLOADER, DownloaderService)
    container.register(Services.BROWSER, BrowserService)
    container.register(Services.SNIFFER, NetworkSniffer)
    container.register(Services.SETTINGS_MANAGER, SettingsManager)
    container.register(Services.COOKIE_MANAGER, CookieManager)
    container.register(Services.ANALYZER, AnalyzerService)
    container.register(Services.LLM_TRANSLATOR, LLMTranslator)
    container.register(Services.GLOSSARY, GlossaryService)
    container.register(Services.PIPELINE, PipelineRunner)
    
    # === Startup Logic ===
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    settings.init_dirs()
    logger.info(f"Directories initialized at {settings.BASE_DIR}")
    logger.info(f"Registered {len(container._factories)} services")
    
    yield
    
    # === Shutdown Logic ===
    logger.info("Shutting down...")
    # Stop browser if it was instantiated
    if container.has(Services.BROWSER) and Services.BROWSER in container._instances:
        browser = container.get(Services.BROWSER)
        await browser.stop()
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
app.include_router(cookies.router, prefix="/api/v1")
app.include_router(settings_api.router, prefix="/api/v1")
app.include_router(audio.router, prefix="/api/v1")
app.include_router(glossary.router, prefix="/api/v1")

# CORS (Restricted to local Electron and Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",   # Vite Dev Server
        "http://localhost:5173",
        "http://127.0.0.1:8000",   # FastAPI (self)
        "http://localhost:8000",
        "file://",                  # Electron Production
        "app://.",                  # Electron custom protocol
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
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
        "src.main:app", 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.DEBUG
    )
