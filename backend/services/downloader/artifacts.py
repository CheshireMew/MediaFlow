from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
import re

from loguru import logger

from backend.models.schemas import FileRef
from backend.utils.subtitle_manager import SubtitleManager


def sanitize_filename(name: str) -> str:
    if not name:
        return "download"
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)


def infer_media_file_type(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg"}:
        return "audio"
    return "video"


def infer_media_mime_type(path: str) -> str:
    media_type = infer_media_file_type(path)
    if media_type == "audio":
        return "audio/mpeg"
    return "video/mp4"


@dataclass(slots=True)
class DownloadArtifacts:
    media_path: Path
    media_type: str
    subtitle_path: Optional[Path] = None
    warnings: list[str] = field(default_factory=list)
    recovery: list[dict[str, str]] = field(default_factory=list)

    def to_files(self) -> list[FileRef]:
        files = [
            FileRef(
                type=self.media_type,
                path=str(self.media_path),
                label="source",
                mime_type=infer_media_mime_type(str(self.media_path)),
            )
        ]
        if self.subtitle_path:
            files.append(
                FileRef(
                    type="subtitle",
                    path=str(self.subtitle_path),
                    label="downloaded",
                    mime_type="application/x-subrip",
                )
            )
        return files

    def to_meta(self) -> dict[str, Any]:
        return {
            "primary": {
                "path": str(self.media_path),
                "type": self.media_type,
                "mime_type": infer_media_mime_type(str(self.media_path)),
            },
            "subtitle": (
                {
                    "path": str(self.subtitle_path),
                    "type": "subtitle",
                    "mime_type": "application/x-subrip",
                }
                if self.subtitle_path
                else None
            ),
            "warnings": list(self.warnings),
            "recovery": list(self.recovery),
        }


class DownloadArtifactResolver:
    _preferred_media_suffixes = {".mp4", ".mkv", ".webm", ".m4a", ".mp3", ".wav", ".mov"}
    _subtitle_priority = (
        ".en.vtt",
        ".zh.vtt",
        ".vtt",
        ".en.srt",
        ".zh.srt",
        ".srt",
    )

    def finalize_download(
        self,
        *,
        info: dict[str, Any],
        prepared_path: str,
        subtitle_requested: bool,
        preferred_stem: Optional[str] = None,
        subtitle_error: Optional[str] = None,
    ) -> DownloadArtifacts:
        media_path, recovery = self._resolve_primary_media(Path(prepared_path), info)
        subtitle_path, warnings = self._resolve_subtitle(media_path, subtitle_requested, subtitle_error)
        media_path, subtitle_path = self._normalize_names(
            media_path,
            subtitle_path,
            preferred_stem=preferred_stem,
        )
        return DownloadArtifacts(
            media_path=media_path,
            media_type=infer_media_file_type(str(media_path)),
            subtitle_path=subtitle_path,
            warnings=warnings,
            recovery=recovery,
        )

    def finalize_existing(
        self,
        *,
        media_path: str | Path,
        preferred_stem: Optional[str] = None,
    ) -> DownloadArtifacts:
        existing_path = Path(media_path)
        normalized_media_path, _ = self._normalize_names(
            existing_path,
            None,
            preferred_stem=preferred_stem,
        )
        return DownloadArtifacts(
            media_path=normalized_media_path,
            media_type=infer_media_file_type(str(normalized_media_path)),
        )

    def _resolve_primary_media(
        self,
        prepared_path: Path,
        info: dict[str, Any],
    ) -> tuple[Path, list[dict[str, str]]]:
        recovery: list[dict[str, str]] = []
        if prepared_path.exists():
            return prepared_path, recovery

        logger.warning(f"File not found at expected path: {prepared_path}. Searching for alternatives...")
        media_id = info.get("id")
        if media_id:
            id_candidates = list(prepared_path.parent.glob(f"*{media_id}*.*"))
            if id_candidates:
                recovered_path = self._sort_media_candidates(id_candidates)[0]
                recovery.append(
                    {
                        "strategy": "media_id",
                        "path": str(recovered_path),
                    }
                )
                logger.info(f"Recovered downloaded file by media id: {recovered_path}")
                return recovered_path, recovery

        stem_candidates = list(prepared_path.parent.glob(f"{prepared_path.stem}.*"))
        if stem_candidates:
            recovered_path = self._sort_media_candidates(stem_candidates)[0]
            recovery.append(
                {
                    "strategy": "matching_stem",
                    "path": str(recovered_path),
                }
            )
            logger.info(f"Recovered downloaded file by matching stem: {recovered_path}")
            return recovered_path, recovery

        raise FileNotFoundError(f"File not found: {prepared_path}")

    def _resolve_subtitle(
        self,
        media_path: Path,
        requested: bool,
        subtitle_error: Optional[str],
    ) -> tuple[Optional[Path], list[str]]:
        warnings: list[str] = []
        if not requested:
            return None, warnings

        subtitle_path = self._find_or_convert_subtitle(media_path)
        if subtitle_path:
            return subtitle_path, warnings

        if subtitle_error:
            warnings.append(f"Subtitle download failed: {subtitle_error}")
        else:
            warnings.append("Subtitle download requested, but no subtitle file was produced.")
        return None, warnings

    def _find_or_convert_subtitle(self, media_path: Path) -> Optional[Path]:
        for suffix in self._subtitle_priority:
            candidate = media_path.with_suffix(suffix)
            if not candidate.exists():
                continue

            if candidate.suffix.lower() == ".vtt":
                logger.info(f"Found VTT subtitle: {candidate}")
                srt_out = SubtitleManager.process_vtt_file(candidate)
                if not srt_out or not srt_out.exists():
                    logger.warning(f"Failed to convert subtitle to SRT: {candidate}")
                    continue

                standard_srt_path = media_path.with_suffix(".srt")
                if srt_out != standard_srt_path:
                    try:
                        if standard_srt_path.exists():
                            standard_srt_path.unlink()
                        srt_out.rename(standard_srt_path)
                        srt_out = standard_srt_path
                    except Exception as exc:
                        logger.warning(f"Failed to normalize subtitle filename: {exc}")
                logger.info(f"Selected subtitle: {srt_out}")
                return srt_out

            logger.info(f"Selected subtitle: {candidate}")
            return candidate

        for candidate in sorted(media_path.parent.glob(f"{media_path.stem}*.srt")):
            logger.info(f"Selected fallback subtitle: {candidate}")
            return candidate

        return None

    def _normalize_names(
        self,
        media_path: Path,
        subtitle_path: Optional[Path],
        *,
        preferred_stem: Optional[str],
    ) -> tuple[Path, Optional[Path]]:
        repaired_stem = sanitize_filename(preferred_stem or media_path.stem) or "download"
        if repaired_stem == media_path.stem:
            return media_path, subtitle_path

        repaired_media_path = media_path.with_name(f"{repaired_stem}{media_path.suffix}")
        if repaired_media_path.exists():
            logger.warning(
                f"Normalized media filename already exists, keeping original path: {repaired_media_path}"
            )
            return media_path, subtitle_path

        logger.info(f"Renaming downloaded media to normalized filename: {repaired_media_path}")
        media_path.rename(repaired_media_path)

        normalized_subtitle_path = subtitle_path
        if subtitle_path and subtitle_path.exists() and subtitle_path.stem == media_path.stem:
            repaired_subtitle_path = subtitle_path.with_name(f"{repaired_stem}{subtitle_path.suffix}")
            if not repaired_subtitle_path.exists():
                subtitle_path.rename(repaired_subtitle_path)
                normalized_subtitle_path = repaired_subtitle_path

        return repaired_media_path, normalized_subtitle_path

    def _sort_media_candidates(self, candidates: list[Path]) -> list[Path]:
        return sorted(
            candidates,
            key=lambda path: (
                path.suffix.lower() in self._preferred_media_suffixes,
                path.stat().st_mtime,
            ),
            reverse=True,
        )
