from __future__ import annotations

import math
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from backend.models.schemas import (
    ClipExportSegment,
    MediaReference,
    TaskArtifact,
    TaskResult,
)
from backend.services.media_refs import create_media_ref
from backend.services.video.media_prober import MediaProber


CLIP_DURATION_TOLERANCE_SECONDS = 0.15


def export_clips(
    *,
    video_synthesis,
    video_ref: MediaReference,
    segments: list[ClipExportSegment],
    render_mode: str,
    srt_ref: MediaReference | None,
    watermark_ref: MediaReference | None,
    options: dict | None,
    output_dir: str | None,
    progress_callback=None,
) -> list[MediaReference]:
    source = Path(video_ref.path)
    if render_mode not in {"burned", "source"}:
        raise ValueError(f"Unsupported clip export render mode: {render_mode}")
    if render_mode == "burned" and not _subtitles_disabled(options) and not srt_ref:
        raise ValueError("Burned clip export requires subtitles.")

    planned_segments = plan_clip_segments(source, segments)

    target_root = Path(output_dir) if output_dir else source.with_name(f"{source.stem}_clips")
    target_root.mkdir(parents=True, exist_ok=True)
    batch_id = uuid.uuid4().hex[:8]
    batch_label = datetime.now().strftime("export_%Y%m%d_%H%M%S_%f") + f"_{batch_id}"
    staging_dir = target_root / f".{batch_label}.staging"
    final_dir = target_root / batch_label
    staging_dir.mkdir(parents=False, exist_ok=False)

    staged_names: list[str] = []
    total = len(planned_segments)
    try:
        for index, segment in enumerate(planned_segments, start=1):
            label = _slug(segment.title or segment.id)
            suffix = "source" if render_mode == "source" else "rendered"
            filename = f"{source.stem}_clip_{index:02d}_{suffix}_{label}.mp4"
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
                options=options or {},
                segment=segment,
                render_mode=render_mode,
                progress_callback=_clip_progress_callback(progress_callback, index, total),
            )
            _validate_rendered_clip(staged_path, segment)
            staged_names.append(filename)

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


def build_clip_export_task_result(files: list[MediaReference]) -> dict:
    return TaskResult(
        success=True,
        artifacts=[
            TaskArtifact(kind="video", role="output", ref=file)
            for file in files
        ],
    ).model_dump(mode="json")


def _render_clip(
    *,
    video_synthesis,
    source_path: str,
    srt_path: str | None,
    output_path: str,
    watermark_ref: MediaReference | None,
    options: dict,
    segment: ClipExportSegment,
    render_mode: str,
    progress_callback=None,
) -> None:
    render_options = {
        **options,
        "trim_start": float(segment.start),
        "trim_end": float(segment.end),
        "disable_auto_trim": True,
    }
    effective_srt_path = srt_path
    effective_watermark_ref = watermark_ref
    if render_mode == "source":
        render_options["skip_subtitles"] = True
        render_options["preserve_frame_rate"] = True
        effective_srt_path = None
        effective_watermark_ref = None

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


def plan_clip_segments(source: Path, segments: list[ClipExportSegment]) -> list[ClipExportSegment]:
    if not segments:
        raise ValueError("No clip segments selected")

    duration = MediaProber.get_duration(str(source))
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


def _subtitles_disabled(options: dict | None) -> bool:
    return bool((options or {}).get("skip_subtitles"))


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
