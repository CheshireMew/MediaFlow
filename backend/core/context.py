import time
from typing import Any, Dict, List, Optional

from backend.services.media_refs import create_media_ref

class PipelineContext:
    """Shared state passed between pipeline steps."""
    def __init__(self):
        self.data: Dict[str, Any] = {}
        self.history: List[str] = []
        self.trace: List[Dict[str, Any]] = []

    def set(self, key: str, value: Any):
        self.data[key] = value

    def get(self, key: str, default=None):
        return self.data.get(key, default)

    def set_media(
        self,
        *,
        path_key: str,
        ref_key: str,
        path: Optional[str],
        media_type: Optional[str] = None,
        mirror_path_keys: tuple[str, ...] = (),
        extra_ref_keys: tuple[str, ...] = (),
    ):
        self.set(path_key, path)
        media_ref = create_media_ref(path, media_type) if path else None
        self.set(ref_key, media_ref)
        for mirror_key in mirror_path_keys:
            self.set(mirror_key, path)
        for extra_ref_key in extra_ref_keys:
            self.set(extra_ref_key, media_ref)

    def get_media_path(self, ref_key: str, *path_keys: str) -> Optional[str]:
        ref_value = self.get(ref_key)
        if isinstance(ref_value, dict):
            ref_path = ref_value.get("path")
            if isinstance(ref_path, str) and ref_path:
                return ref_path

        for path_key in path_keys:
            value = self.get(path_key)
            if isinstance(value, str) and value:
                return value
        return None

    def add_trace(self, step_name: str, duration: float, status: str, error: str = None):
        self.trace.append({
            "step": step_name,
            "duration": round(duration, 3),
            "status": status,
            "error": error,
            "timestamp": time.time()
        })
