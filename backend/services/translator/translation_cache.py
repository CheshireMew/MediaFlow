import hashlib
import json
import threading
import time
import uuid
from typing import Dict, Optional

from loguru import logger

from backend.config import settings
from backend.utils.bounded_cache import prune_cache_directory

CACHE_DIR = settings.TEMP_DIR / "translation_cache"
CACHE_MAX_AGE_DAYS = 7
CACHE_MAX_BYTES = 256 * 1024 * 1024
CACHE_PRUNE_INTERVAL_SECONDS = 5 * 60
CACHE_SCHEMA_VERSION = 2

_cleanup_lock = threading.Lock()
_last_cleanup_at = 0.0


class TranslationCache:
    """Disk-based translation cache keyed by content hash, model, language, and mode."""

    def __init__(self):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _key(texts: Dict[str, str], model: str, language: str, mode: str) -> str:
        payload = json.dumps(texts, sort_keys=True, ensure_ascii=False)
        raw = f"v{CACHE_SCHEMA_VERSION}|{payload}|{model}|{language}|{mode}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, texts: Dict[str, str], model: str, language: str, mode: str) -> Optional[Dict[str, str]]:
        key = self._key(texts, model, language, mode)
        path = CACHE_DIR / f"{key}.json"
        if not path.exists():
            return None

        try:
            age_days = (time.time() - path.stat().st_mtime) / 86400
            if age_days > CACHE_MAX_AGE_DAYS:
                path.unlink(missing_ok=True)
                return None
            data = json.loads(path.read_text("utf-8"))
            path.touch()
            logger.debug(f"[Cache] HIT for {len(texts)} segments ({key[:12]}...)")
            return data
        except Exception:
            return None

    def put(self, texts: Dict[str, str], model: str, language: str, mode: str, result: Dict[str, str]):
        key = self._key(texts, model, language, mode)
        path = CACHE_DIR / f"{key}.json"
        temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp_path.write_text(json.dumps(result, ensure_ascii=False), "utf-8")
            temp_path.replace(path)
        except Exception as e:
            logger.warning(f"[Cache] Failed to write: {e}")
        finally:
            temp_path.unlink(missing_ok=True)

    def cleanup(self):
        global _last_cleanup_at

        now = time.monotonic()
        if now - _last_cleanup_at < CACHE_PRUNE_INTERVAL_SECONDS:
            return
        with _cleanup_lock:
            now = time.monotonic()
            if now - _last_cleanup_at < CACHE_PRUNE_INTERVAL_SECONDS:
                return
            prune_cache_directory(
                CACHE_DIR,
                max_bytes=CACHE_MAX_BYTES,
                max_age_seconds=CACHE_MAX_AGE_DAYS * 86400,
            )
            _last_cleanup_at = now
