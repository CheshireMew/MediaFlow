from backend.core.container import container, Services
from backend.core.service_registry import register_all_services
from backend.services.platforms.factory import PlatformFactory

if not container.has(Services.DOWNLOADER):
    register_all_services()

__all__ = ["PlatformFactory"]
