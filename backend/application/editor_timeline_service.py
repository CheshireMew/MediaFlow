from backend.models.editor_contracts import MediaExportTimelineResponse
from backend.models.subtitle_contracts import SubtitleSegment
from backend.services.video.timeline import resolve_media_export_timeline


def build_media_export_timeline(
    video_path: str,
    *,
    speech_segments: list[SubtitleSegment],
    no_speech_trim_enabled: bool,
) -> MediaExportTimelineResponse:
    timeline = resolve_media_export_timeline(
        video_path,
        speech_segments=speech_segments,
        no_speech_trim_enabled=no_speech_trim_enabled,
    )
    return MediaExportTimelineResponse(**vars(timeline))
