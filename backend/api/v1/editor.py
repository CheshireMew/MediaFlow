import asyncio
from fastapi import APIRouter, HTTPException, UploadFile
from backend.models.editor_contracts import EditorPreviewMediaRequest, EditorPreviewMediaResponse, EditorWaveformPeaksResponse, HighlightDetectionRequest, HighlightDetectionResponse, ImagePreviewResponse, MediaExportTimelineRequest, MediaExportTimelineResponse
from backend.services.video.timeline import resolve_media_export_timeline
from backend.utils.path_validator import validate_input_file

async def upload_watermark_for_preview(file: UploadFile):
    """
    Upload a watermark file and return the generated preview.
    """
    try:
        from backend.application.watermark_preview_service import save_watermark_preview

        return await asyncio.to_thread(save_watermark_preview, file.filename, file.file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_current_watermark():
    """
    Retrieve the last uploaded watermark (if exists).
    Returns: { png_path, data_url, width, height } or 404
    """
    from backend.application.watermark_preview_service import get_latest_watermark_preview

    return await asyncio.to_thread(get_latest_watermark_preview)


async def get_media_export_timeline(req: MediaExportTimelineRequest, *, settings_application):
    try:
        validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user_settings = settings_application.get_settings()
    timeline = await asyncio.to_thread(
        resolve_media_export_timeline,
        req.video_ref.path,
        speech_segments=req.speech_segments,
        no_speech_trim_enabled=user_settings.auto_trim_silence,
    )
    return MediaExportTimelineResponse(**vars(timeline))


async def resolve_preview_media_source(req: EditorPreviewMediaRequest):
    try:
        source_path = validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from backend.application.editor_preview_service import resolve_editor_preview_media

        source_ref, media_ref, remuxed = await asyncio.to_thread(
            resolve_editor_preview_media,
            str(source_path),
        )
        return EditorPreviewMediaResponse(
            source_ref=source_ref,
            media_ref=media_ref,
            remuxed=remuxed,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def resolve_waveform_peaks(req: EditorPreviewMediaRequest):
    try:
        source_path = validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from backend.application.waveform_service import resolve_waveform_peaks as resolve

        return EditorWaveformPeaksResponse.model_validate(
            await asyncio.to_thread(resolve, str(source_path))
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def detect_highlight_candidates(req: HighlightDetectionRequest, *, highlight_application):
    try:
        source_path = validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        candidates, source, duration = await asyncio.to_thread(
            highlight_application.detect,
            video_path=str(source_path),
            subtitle_segments=req.subtitle_segments,
            max_candidates=req.max_candidates,
            min_duration=req.min_duration,
            max_duration=req.max_duration,
        )
        return HighlightDetectionResponse(
            candidates=candidates,
            source=source,
            duration=duration,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def create_router(*, highlight_application, settings_application) -> APIRouter:
    router = APIRouter(prefix="/editor", tags=["Editor"])
    router.add_api_route(
        "/preview/upload-watermark",
        upload_watermark_for_preview,
        methods=["POST"],
        response_model=ImagePreviewResponse,
    )
    router.add_api_route(
        "/preview/watermark/latest",
        get_current_watermark,
        methods=["GET"],
        response_model=ImagePreviewResponse | None,
    )
    async def export_timeline(req: MediaExportTimelineRequest):
        return await get_media_export_timeline(
            req,
            settings_application=settings_application,
        )

    router.add_api_route(
        "/preview/media/export-timeline",
        export_timeline,
        methods=["POST"],
        response_model=MediaExportTimelineResponse,
    )
    router.add_api_route(
        "/preview/media/source",
        resolve_preview_media_source,
        methods=["POST"],
        response_model=EditorPreviewMediaResponse,
    )
    router.add_api_route(
        "/preview/media/waveform",
        resolve_waveform_peaks,
        methods=["POST"],
        response_model=EditorWaveformPeaksResponse,
    )

    async def detect(req: HighlightDetectionRequest):
        return await detect_highlight_candidates(
            req,
            highlight_application=highlight_application,
        )

    router.add_api_route(
        "/highlights/detect",
        detect,
        methods=["POST"],
        response_model=HighlightDetectionResponse,
    )
    return router
