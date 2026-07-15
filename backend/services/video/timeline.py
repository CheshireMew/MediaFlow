import math
from dataclasses import dataclass

from backend.models.subtitle_contracts import SubtitleSegment
from backend.services.video.media_prober import MediaProber


@dataclass(frozen=True)
class MediaExportTimeline:
    duration: float
    trim_start: float
    trim_end: float
    no_speech_trim_enabled: bool
    has_speech_timeline: bool
    has_leading_black: bool
    has_leading_no_speech: bool
    has_trailing_no_speech: bool


def resolve_media_export_timeline(
    video_path: str,
    *,
    speech_segments: list[SubtitleSegment],
    no_speech_trim_enabled: bool,
) -> MediaExportTimeline:
    """Resolve full-video export bounds from Whisper's existing speech timeline."""
    duration = max(0.0, MediaProber.get_duration(video_path))
    leading_black_end = max(0.0, MediaProber.detect_leading_black_end(video_path))
    speech_intervals = sorted(
        (
            max(0.0, min(duration, segment.start)),
            max(0.0, min(duration, segment.end)),
        )
        for segment in speech_segments
        if (
            duration > 0
            and math.isfinite(segment.start)
            and math.isfinite(segment.end)
            and segment.end > segment.start
            and segment.end > 0
            and segment.start < duration
        )
    )
    speech_intervals = [
        (start, end)
        for start, end in speech_intervals
        if end > start
    ]
    has_speech_timeline = bool(speech_intervals)
    speech_start = speech_intervals[0][0] if has_speech_timeline else 0.0
    speech_end = max(end for _, end in speech_intervals) if has_speech_timeline else duration
    apply_no_speech_trim = no_speech_trim_enabled and has_speech_timeline

    trim_start = min(
        duration,
        max(leading_black_end, speech_start if apply_no_speech_trim else 0.0),
    )
    trim_end = speech_end if apply_no_speech_trim else duration
    if trim_end <= trim_start:
        trim_start = min(duration, leading_black_end)
        trim_end = duration
        apply_no_speech_trim = False

    return MediaExportTimeline(
        duration=duration,
        trim_start=trim_start,
        trim_end=trim_end,
        no_speech_trim_enabled=apply_no_speech_trim,
        has_speech_timeline=has_speech_timeline,
        has_leading_black=leading_black_end > 0,
        has_leading_no_speech=apply_no_speech_trim and speech_start > 0,
        has_trailing_no_speech=apply_no_speech_trim and speech_end < duration,
    )
