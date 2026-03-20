from backend.core.container import container, Services
from backend.core.service_registry import register_all_services

if not container.has(Services.ASR):
    register_all_services()

asr_service = container.get(Services.ASR)

__all__ = ["asr_service"]
