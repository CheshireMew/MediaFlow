import os
import time
from pathlib import Path

from backend.services.translator import translation_cache
from backend.services.translator.translation_cache import TranslationCache


def test_translation_cache_writes_atomically_and_reuses_result(
    tmp_path: Path,
    monkeypatch,
):
    monkeypatch.setattr(translation_cache, "CACHE_DIR", tmp_path)
    cache = TranslationCache()
    texts = {"1": "hello"}
    result = {"1": "你好"}

    cache.put(texts, "model", "Chinese", "standard", result)

    assert cache.get(texts, "model", "Chinese", "standard") == result
    assert list(tmp_path.glob("*.tmp")) == []


def test_translation_cache_cleanup_is_size_bounded(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(translation_cache, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(translation_cache, "CACHE_MAX_BYTES", 5)
    monkeypatch.setattr(translation_cache, "CACHE_PRUNE_INTERVAL_SECONDS", 0)
    cache = TranslationCache()
    oldest = tmp_path / "oldest.json"
    newest = tmp_path / "newest.json"
    oldest.write_bytes(b"12345")
    newest.write_bytes(b"12345")
    old_time = time.time() - 20
    os.utime(oldest, (old_time, old_time))

    cache.cleanup()

    assert not oldest.exists()
    assert newest.exists()
