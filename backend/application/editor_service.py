import asyncio
from typing import BinaryIO

from backend.application.editor_preview_service import resolve_editor_preview_media
from backend.application.editor_timeline_service import build_media_export_timeline
from backend.application.media_input import require_input_file
from backend.application.watermark_preview_service import (
    get_latest_watermark_preview,
    save_watermark_preview,
)
from backend.models.application_errors import InvalidInputError
from backend.models.editor_contracts import (
    EditorPreviewMediaRequest,
    EditorPreviewMediaResponse,
    HighlightDetectionRequest,
    HighlightDetectionResponse,
    MediaExportTimelineRequest,
    MediaExportTimelineResponse,
)


class EditorApplicationService:
    def __init__(self, *, highlight_application, settings_application):
        self._highlight = highlight_application
        self._settings = settings_application

    async def save_watermark_preview(self, filename: str | None, stream: BinaryIO):
        return await asyncio.to_thread(save_watermark_preview, filename, stream)

    async def get_latest_watermark_preview(self):
        return await asyncio.to_thread(get_latest_watermark_preview)

    async def get_media_export_timeline(
        self,
        request: MediaExportTimelineRequest,
    ) -> MediaExportTimelineResponse:
        video_path = require_input_file(request.video_ref.path, label="video_ref.path")
        user_settings = self._settings.get_settings()
        return await asyncio.to_thread(
            build_media_export_timeline,
            str(video_path),
            speech_segments=request.speech_segments,
            no_speech_trim_enabled=user_settings.auto_trim_silence,
        )

    async def resolve_preview_media(
        self,
        request: EditorPreviewMediaRequest,
    ) -> EditorPreviewMediaResponse:
        source_path = require_input_file(request.video_ref.path, label="video_ref.path")
        source_ref, media_ref, remuxed = await asyncio.to_thread(
            resolve_editor_preview_media,
            str(source_path),
        )
        return EditorPreviewMediaResponse(
            source_ref=source_ref,
            media_ref=media_ref,
            remuxed=remuxed,
        )

    async def resolve_waveform(
        self,
        request: EditorPreviewMediaRequest,
        *,
        max_points: int,
    ) -> bytes:
        from backend.application.waveform_service import resolve_waveform_binary

        source_path = require_input_file(request.video_ref.path, label="video_ref.path")
        return await asyncio.to_thread(
            resolve_waveform_binary,
            str(source_path),
            max_points=max_points,
        )

    async def detect_highlights(
        self,
        request: HighlightDetectionRequest,
    ) -> HighlightDetectionResponse:
        source_path = require_input_file(request.video_ref.path, label="video_ref.path")
        try:
            candidates, source, duration = await asyncio.to_thread(
                self._highlight.detect,
                video_path=str(source_path),
                subtitle_segments=request.subtitle_segments,
                max_candidates=request.max_candidates,
                min_duration=request.min_duration,
                max_duration=request.max_duration,
            )
        except ValueError as error:
            raise InvalidInputError(
                str(error),
                code="invalid_highlight_request",
            ) from error
        return HighlightDetectionResponse(
            candidates=candidates,
            source=source,
            duration=duration,
        )
