from __future__ import annotations

import json
import sys
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEV_FONT_CATALOG_PATH = REPO_ROOT / "frontend" / "src" / "shared" / "fontCatalog.json"


def _resolve_resource_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent.parent
    return REPO_ROOT


def _resolve_font_catalog_path() -> Path:
    resource_root = _resolve_resource_root()
    packaged_catalog = resource_root / "fontCatalog.json"
    if packaged_catalog.exists():
        return packaged_catalog
    return DEV_FONT_CATALOG_PATH


def _resolve_asset_path(asset_path: str) -> Path:
    candidate = REPO_ROOT / asset_path
    if candidate.exists():
        return candidate

    resource_root = _resolve_resource_root()
    packaged_candidate = resource_root / "fonts" / Path(asset_path).name
    if packaged_candidate.exists():
        return packaged_candidate

    return candidate


@lru_cache(maxsize=1)
def load_font_catalog() -> list[dict]:
    with _resolve_font_catalog_path().open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, list) else []


def get_font_entry(font_name: str) -> dict | None:
    normalized = font_name.strip()
    if not normalized:
        return None

    for entry in load_font_catalog():
        if entry.get("family") == normalized:
            return entry
    return None


def get_bundled_font_files(font_name: str) -> list[Path]:
    entry = get_font_entry(font_name)
    if not entry or entry.get("source") != "bundled":
        return []

    matches: list[Path] = []
    for asset_path in entry.get("assetFiles", []):
        candidate = _resolve_asset_path(asset_path)
        if candidate.is_file():
            matches.append(candidate)
    return [path for path in matches if path.is_file()]


def get_bundled_font_directory(font_name: str) -> Path | None:
    bundled_files = get_bundled_font_files(font_name)
    if not bundled_files:
        return None
    parents = {path.parent.resolve() for path in bundled_files}
    return next(iter(parents)) if len(parents) == 1 else None


def stage_font_files(font_name: str, _staging_dir: Path) -> Path | None:
    """Compatibility wrapper; bundled fonts are read in place instead of copied."""
    return get_bundled_font_directory(font_name)
