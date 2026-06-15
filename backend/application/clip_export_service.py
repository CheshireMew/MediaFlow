from __future__ import annotations

import re
import subprocess
from pathlib import Path

from loguru import logger

from backend.config import settings
from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.models.schemas import ClipExportSegment, MediaReference
from backend.services.media_refs import create_media_ref


def export_clips(
    *,
    video_ref: MediaReference,
    segments: list[ClipExportSegment],
    render_mode: str,
    srt_ref: MediaReference | None,
    watermark_path: str | None,
    options: dict | None,
    output_dir: str | None,
    progress_callback=None,
) -> list[MediaReference]:
    source = Path(video_ref.path)
    target_dir = Path(output_dir) if output_dir else source.with_name(f"{source.stem}_clips")
    target_dir.mkdir(parents=True, exist_ok=True)

    if render_mode not in {"burned", "source"}:
        raise ValueError(f"Unsupported clip export render mode: {render_mode}")
    if render_mode == "burned" and not _subtitles_disabled(options) and not srt_ref:
        raise ValueError("Burned clip export requires subtitles.")

    exported: list[MediaReference] = []
    total = len(segments)
    for index, segment in enumerate(segments, start=1):
        if segment.end <= segment.start:
            raise ValueError(f"Invalid clip range for {segment.id}: end must be greater than start")

        label = _slug(segment.title or segment.id)
        suffix = "source" if render_mode == "source" else "rendered"
        output_path = target_dir / f"{source.stem}_clip_{index:02d}_{suffix}_{label}.mp4"
        if progress_callback:
            progress_callback(_segment_progress(index - 1, total), f"Exporting clip {index}/{total}...")

        if render_mode == "source":
            _run_ffmpeg_copy_clip(str(source), str(output_path), segment.start, segment.end)
        else:
            _render_burned_clip(
                source_path=str(source),
                srt_path=srt_ref.path if srt_ref else None,
                output_path=str(output_path),
                watermark_path=watermark_path,
                options=options or {},
                segment=segment,
                progress_callback=_clip_progress_callback(progress_callback, index, total),
            )

        exported.append(
            MediaReference.model_validate(create_media_ref(str(output_path), "video/mp4", role="output"))
        )

    if progress_callback:
        progress_callback(100, "Clip export completed")
    return exported


def build_clip_export_task_result(files: list[MediaReference]) -> dict:
    return {
        "success": True,
        "files": [
            {"type": "video", "path": file.path, "label": "clip_export", "name": file.name}
            for file in files
        ],
        "meta": {
            "output_refs": [file.model_dump(mode="json") for file in files],
        },
    }


def _render_burned_clip(
    *,
    source_path: str,
    srt_path: str | None,
    output_path: str,
    watermark_path: str | None,
    options: dict,
    segment: ClipExportSegment,
    progress_callback=None,
) -> None:
    render_options = {
        **options,
        "trim_start": float(segment.start),
        "trim_end": float(segment.end),
        "disable_auto_trim": True,
    }
    runtime_service(Services.VIDEO_SYNTHESIS).synthesize(
        video_path=source_path,
        srt_path=srt_path,
        output_path=output_path,
        watermark_path=watermark_path,
        options=render_options,
        progress_callback=progress_callback,
    )


def _subtitles_disabled(options: dict | None) -> bool:
    return bool((options or {}).get("skip_subtitles"))


def _clip_progress_callback(parent_callback, index: int, total: int):
    if not parent_callback:
        return None

    start = _segment_progress(index - 1, total)
    span = 90 / max(total, 1)

    def progress(progress_value: float, message: str) -> None:
        bounded = max(0.0, min(100.0, float(progress_value)))
        parent_callback(min(99, start + (bounded / 100.0) * span), message)

    return progress


def _segment_progress(completed: int, total: int) -> float:
    if total <= 0:
        return 0
    return min(95, (completed / total) * 90)


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", value, flags=re.UNICODE).strip("_")
    return (cleaned or "clip")[:32]


def _run_ffmpeg_copy_clip(source_path: str, output_path: str, start: float, end: float) -> None:
    duration = max(0.001, end - start)
    command = [
        settings.FFMPEG_PATH,
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        source_path,
        "-t",
        f"{duration:.3f}",
        "-map",
        "0",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        output_path,
    ]
    logger.info(f"Source clip export command: {' '.join(command)}")
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=max(60, int(duration * 4 + 30)),
    )
    if result.returncode != 0:
        stderr_tail = "\n".join(result.stderr.splitlines()[-20:])
        raise RuntimeError(f"FFmpeg clip export failed:\n{stderr_tail}")
