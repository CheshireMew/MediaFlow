import hashlib
import json
import time
from typing import Dict, Optional

from loguru import logger

from backend.config import settings


CACHE_DIR = settings.TEMP_DIR / "translation_cache"
CACHE_MAX_AGE_DAYS = 7
CACHE_SCHEMA_VERSION = 2


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
            logger.debug(f"[Cache] HIT for {len(texts)} segments ({key[:12]}...)")
            return data
        except Exception:
            return None

    def put(self, texts: Dict[str, str], model: str, language: str, mode: str, result: Dict[str, str]):
        key = self._key(texts, model, language, mode)
        path = CACHE_DIR / f"{key}.json"
        try:
            path.write_text(json.dumps(result, ensure_ascii=False), "utf-8")
        except Exception as e:
            logger.warning(f"[Cache] Failed to write: {e}")

    def cleanup(self):
        try:
            now = time.time()
            for path in CACHE_DIR.glob("*.json"):
                if (now - path.stat().st_mtime) / 86400 > CACHE_MAX_AGE_DAYS:
                    path.unlink(missing_ok=True)
        except Exception:
            pass
