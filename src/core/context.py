import time
from typing import Any, Dict, List

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

    def add_trace(self, step_name: str, duration: float, status: str, error: str = None):
        self.trace.append({
            "step": step_name,
            "duration": round(duration, 3),
            "status": status,
            "error": error,
            "timestamp": time.time()
        })
