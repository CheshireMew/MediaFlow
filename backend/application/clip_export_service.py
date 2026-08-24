from __future__ import annotations

import math
import re
import shutil
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

from backend.config import settings
from backend.models.editor_contracts import ClipExportSegment
from backend.models.media_contracts import MediaReference
from backend.models.synthesis_contracts import SynthesisOptions, SynthesisRuntimeOptions
from backend.services.media_refs import create_media_ref
from backend.services.video.media_prober import MediaProber

CLIP_DURATION_TOLERANCE_SECONDS = 0.15
SOURCE_CLIP_MAX_CONCURRENCY = 4
_source_reencode_slots = threading.BoundedSemaphore(1)


def export_clips(
    *,
    video_synthesis,
    video_ref: MediaReference,
    segments: list[ClipExportSegment],
    render_mode: str,
    srt_ref: MediaReference | None,
    watermark_ref: MediaReference | None,
    options: SynthesisOptions | dict | None,
    output_dir: str | None,
    progress_callback=None,
) -> list[MediaReference]:
    source = Path(video_ref.path)
    if render_mode not in {"burned", "source"}:
        raise ValueError(f"Unsupported clip export render mode: {render_mode}")
    if render_mode == "burned" and not _subtitles_disabled(options) and not srt_ref:
        raise ValueError("Burned clip export requires subtitles.")

    source_info = MediaProber.probe_media(str(source))
    planned_segments = plan_clip_segments(source, segments, duration=source_info.duration)
    synthesis_options = SynthesisRuntimeOptions.from_options(
        options,
        source_duration=source_info.duration,
        source_has_audio=source_info.has_audio,
        source_width=source_info.width,
        source_height=source_info.height,
    )

    target_root = Path(output_dir) if output_dir else source.with_name(f"{source.stem}_clips")
    target_root.mkdir(parents=True, exist_ok=True)
    batch_id = uuid.uuid4().hex[:8]
    batch_label = datetime.now(timezone.utc).strftime("export_%Y%m%d_%H%M%S_%f") + f"_{batch_id}"
    staging_dir = target_root / f".{batch_label}.staging"
    final_dir = target_root / batch_label
    staging_dir.mkdir(parents=False, exist_ok=False)

    staged_names: list[str] = []
    total = len(planned_segments)
    try:
        jobs = [
            (
                index,
                segment,
                (
                    f"{source.stem}_clip_{index:02d}_"
                    f"{'source' if render_mode == 'source' else 'rendered'}_"
                    f"{_slug(segment.title or segment.id)}.mp4"
                ),
            )
            for index, segment in enumerate(planned_segments, start=1)
        ]
        if render_mode == "source" and len(jobs) > 1:
            completed_names: dict[int, str] = {}
            with ThreadPoolExecutor(
                max_workers=min(SOURCE_CLIP_MAX_CONCURRENCY, len(jobs)),
                thread_name_prefix="clip-copy",
            ) as executor:
                futures = {
                    executor.submit(
                        _export_planned_clip,
                        video_synthesis=video_synthesis,
                        source=source,
                        staging_dir=staging_dir,
                        index=index,
                        segment=segment,
                        filename=filename,
                        render_mode=render_mode,
                        srt_ref=srt_ref,
                        watermark_ref=watermark_ref,
                        options=synthesis_options,
                        total=total,
                        progress_callback=progress_callback,
                    ): index
                    for index, segment, filename in jobs
                }
                for future in as_completed(futures):
                    index = futures[future]
                    completed_names[index] = future.result()
            staged_names = [completed_names[index] for index, *_rest in jobs]
        else:
            for index, segment, filename in jobs:
                staged_names.append(
                    _export_planned_clip(
                        video_synthesis=video_synthesis,
                        source=source,
                        staging_dir=staging_dir,
                        index=index,
                        segment=segment,
                        filename=filename,
                        render_mode=render_mode,
                        srt_ref=srt_ref,
                        watermark_ref=watermark_ref,
                        options=synthesis_options,
                        total=total,
                        progress_callback=progress_callback,
                    )
                )

        staging_dir.rename(final_dir)
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise

    exported = [
        MediaReference.model_validate(
            create_media_ref(str(final_dir / filename), "video/mp4", role="output")
        )
        for filename in staged_names
    ]

    if progress_callback:
        progress_callback(100, "clip_export_completed", {})
    return exported


def _export_planned_clip(
    *,
    video_synthesis,
    source: Path,
    staging_dir: Path,
    index: int,
    segment: ClipExportSegment,
    filename: str,
    render_mode: str,
    srt_ref: MediaReference | None,
    watermark_ref: MediaReference | None,
    options: SynthesisRuntimeOptions,
    total: int,
    progress_callback,
) -> str:
    staged_path = staging_dir / filename
    if progress_callback:
        progress_callback(
            _segment_progress(index - 1, total),
            "clip_exporting",
            {"current": index, "total": total},
        )

    _render_clip(
        video_synthesis=video_synthesis,
        source_path=str(source),
        srt_path=srt_ref.path if srt_ref else None,
        output_path=str(staged_path),
        watermark_ref=watermark_ref,
        options=options,
        segment=segment,
        render_mode=render_mode,
        progress_callback=_clip_progress_callback(progress_callback, index, total),
    )
    _validate_rendered_clip(staged_path, segment)
    return filename


def _render_clip(
    *,
    video_synthesis,
    source_path: str,
    srt_path: str | None,
    output_path: str,
    watermark_ref: MediaReference | None,
    options: SynthesisRuntimeOptions,
    segment: ClipExportSegment,
    render_mode: str,
    progress_callback=None,
) -> None:
    render_options = options.model_copy(
        update={
            "trim_start": float(segment.start),
            "trim_end": float(segment.end),
            "disable_auto_trim": True,
        }
    )
    effective_srt_path = srt_path
    effective_watermark_ref = watermark_ref
    if render_mode == "source":
        render_options = render_options.model_copy(
            update={"skip_subtitles": True, "preserve_frame_rate": True}
        )
        effective_srt_path = None
        effective_watermark_ref = None

        if _try_stream_copy(source_path, output_path, segment):
            return

    reencode_guard = _source_reencode_slots if render_mode == "source" else None
    if reencode_guard is not None:
        reencode_guard.acquire()
    try:
        video_synthesis.synthesize(
            video_path=source_path,
            srt_path=effective_srt_path,
            output_path=output_path,
            watermark_path=(
                effective_watermark_ref.path if effective_watermark_ref else None
            ),
            options=render_options,
            progress_callback=progress_callback,
        )
    finally:
        if reencode_guard is not None:
            reencode_guard.release()


def _try_stream_copy(
    source_path: str,
    output_path: str,
    segment: ClipExportSegment,
) -> bool:
    if not _starts_on_keyframe(source_path, segment.start):
        return False
    duration = segment.end - segment.start
    command = [
        settings.FFMPEG_PATH,
        "-hide_banner",
        "-v",
        "error",
        "-y",
        "-ss",
        f"{segment.start:.6f}",
        "-i",
        source_path,
        "-t",
        f"{duration:.6f}",
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        output_path,
    ]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        logger.info(
            "Source clip stream copy fell back to exact rendering for {}: {}",
            segment.id,
            completed.stderr[-500:],
        )
        return False
    try:
        _validate_rendered_clip(Path(output_path), segment)
    except RuntimeError as exc:
        logger.info(
            "Source clip stream copy did not meet the duration contract for {}: {}",
            segment.id,
            exc,
        )
        return False
    return True


def _starts_on_keyframe(source_path: str, start: float) -> bool:
    if start <= CLIP_DURATION_TOLERANCE_SECONDS:
        return True
    interval_start = max(0.0, start - 5.0)
    command = [
        settings.FFPROBE_PATH,
        "-v",
        "error",
        "-skip_frame",
        "nokey",
        "-select_streams",
        "v:0",
        "-read_intervals",
        f"{interval_start:.6f}%{start + CLIP_DURATION_TOLERANCE_SECONDS:.6f}",
        "-show_entries",
        "frame=best_effort_timestamp_time",
        "-of",
        "csv=p=0",
        source_path,
    ]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        return False
    for raw_value in completed.stdout.splitlines():
        try:
            timestamp = float(raw_value.strip().split(",", 1)[0])
        except (TypeError, ValueError):
            continue
        if abs(timestamp - start) <= CLIP_DURATION_TOLERANCE_SECONDS:
            return True
    return False


def plan_clip_segments(
    source: Path,
    segments: list[ClipExportSegment],
    *,
    duration: float | None = None,
) -> list[ClipExportSegment]:
    if not segments:
        raise ValueError("No clip segments selected")

    duration = MediaProber.get_duration(str(source)) if duration is None else duration
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"Unable to determine video duration: {source}")

    planned_segments: list[ClipExportSegment] = []
    for segment in segments:
        if segment.end > duration + CLIP_DURATION_TOLERANCE_SECONDS:
            raise ValueError(
                f"Clip range for {segment.id} exceeds video duration "
                f"({segment.end:.3f}s > {duration:.3f}s)"
            )
        normalized_end = min(segment.end, duration)
        if normalized_end <= segment.start:
            raise ValueError(
                f"Clip range for {segment.id} starts at or beyond video duration "
                f"({segment.start:.3f}s >= {duration:.3f}s)"
            )
        planned_segments.append(segment.model_copy(update={"end": normalized_end}))
    return planned_segments


def _validate_rendered_clip(output_path: Path, segment: ClipExportSegment) -> None:
    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise RuntimeError(f"Clip export produced no output: {output_path.name}")

    actual_duration = MediaProber.get_duration(str(output_path))
    expected_duration = segment.end - segment.start
    if (
        not math.isfinite(actual_duration)
        or actual_duration <= 0
        or abs(actual_duration - expected_duration) > CLIP_DURATION_TOLERANCE_SECONDS
    ):
        raise RuntimeError(
            f"Clip export duration mismatch for {segment.id}: "
            f"expected {expected_duration:.3f}s, got {actual_duration:.3f}s"
        )


def _subtitles_disabled(options: SynthesisOptions | dict | None) -> bool:
    return SynthesisOptions.model_validate(options or {}).skip_subtitles


def _clip_progress_callback(parent_callback, index: int, total: int):
    if not parent_callback:
        return None

    start = _segment_progress(index - 1, total)
    span = 90 / max(total, 1)

    def progress(progress_value: float, message_code: str, message_params=None) -> None:
        bounded = max(0.0, min(100.0, float(progress_value)))
        parent_callback(
            min(99, start + (bounded / 100.0) * span),
            message_code,
            message_params or {},
        )

    return progress


def _segment_progress(completed: int, total: int) -> float:
    if total <= 0:
        return 0
    return min(95, (completed / total) * 90)


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", value, flags=re.UNICODE).strip("_")
    return (cleaned or "clip")[:32]
