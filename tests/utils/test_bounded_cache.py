import os
import time
from pathlib import Path

from backend.utils.bounded_cache import prune_cache_directory


def _set_age(path: Path, age_seconds: float) -> None:
    modified_at = time.time() - age_seconds
    os.utime(path, (modified_at, modified_at))


def test_prune_cache_expires_old_entries_and_keeps_active_temp_files(tmp_path: Path):
    expired = tmp_path / "expired.cache"
    active_temp = tmp_path / "active.tmp"
    expired.write_bytes(b"old")
    active_temp.write_bytes(b"in progress")
    _set_age(expired, 100)

    prune_cache_directory(tmp_path, max_bytes=1, max_age_seconds=10)

    assert not expired.exists()
    assert active_temp.exists()


def test_prune_cache_evicts_oldest_completed_entries_to_size_limit(tmp_path: Path):
    oldest = tmp_path / "oldest.cache"
    newest = tmp_path / "newest.cache"
    protected = tmp_path / "protected.cache"
    for path in (oldest, newest, protected):
        path.write_bytes(b"12345")
    _set_age(oldest, 30)
    _set_age(newest, 20)
    _set_age(protected, 40)

    prune_cache_directory(
        tmp_path,
        max_bytes=5,
        max_age_seconds=100,
        protected=(protected,),
    )

    assert not oldest.exists()
    assert newest.exists()
    assert protected.exists()
