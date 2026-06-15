import asyncio
from fastapi import APIRouter, HTTPException, UploadFile
import os
from backend.models.schemas import (
    ClipExportRequest,
    EditorPreviewMediaRequest,
    EditorPreviewMediaResponse,
    HighlightDetectionRequest,
    HighlightDetectionResponse,
    MediaReference,
    MediaVisibleStartRequest,
    MediaVisibleStartResponse,
    SynthesisRequest,
    TaskResponse,
)
from backend.services.video.media_prober import MediaProber
from backend.utils.path_validator import validate_input_file, validate_output_file

router = APIRouter(prefix="/editor", tags=["Editor"])

@router.post("/preview/upload-watermark")
async def upload_watermark_for_preview(file: UploadFile):
    """
    Upload a watermark file and return the generated preview.
    """
    try:
        from backend.application.watermark_preview_service import save_watermark_preview

        return save_watermark_preview(file.filename, file.file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/watermark/latest")
async def get_current_watermark():
    """
    Retrieve the last uploaded watermark (if exists).
    Returns: { png_path, data_url, width, height } or 404
    """
    from backend.application.watermark_preview_service import get_latest_watermark_preview

    return get_latest_watermark_preview()


@router.post("/preview/media/visible-start", response_model=MediaVisibleStartResponse)
async def get_media_visible_start(req: MediaVisibleStartRequest):
    try:
        validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    visible_start = MediaProber.detect_leading_black_end(req.video_ref.path)
    return MediaVisibleStartResponse(
        visible_start=visible_start,
        has_leading_black=visible_start > 0,
    )


@router.post("/preview/media/source", response_model=EditorPreviewMediaResponse)
async def resolve_preview_media_source(req: EditorPreviewMediaRequest):
    try:
        source_path = validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from backend.application.editor_preview_service import resolve_editor_preview_media

        source_ref, media_ref, remuxed = resolve_editor_preview_media(str(source_path))
        return EditorPreviewMediaResponse(
            source_ref=source_ref,
            media_ref=media_ref,
            remuxed=remuxed,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/highlights/detect", response_model=HighlightDetectionResponse)
async def detect_highlight_candidates(req: HighlightDetectionRequest):
    try:
        source_path = validate_input_file(req.video_ref.path, label="video_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from backend.application.highlight_service import detect_highlights

        candidates, source, duration = await asyncio.to_thread(
            detect_highlights,
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


@router.post("/clips/export", response_model=TaskResponse)
async def export_clip_segments(req: ClipExportRequest):
    try:
        validate_input_file(req.video_ref.path, label="video_ref.path")
        subtitles_required = req.render_mode == "burned" and not (req.options or {}).get("skip_subtitles")
        if subtitles_required and req.srt_ref:
            validate_input_file(req.srt_ref.path, label="srt_ref.path")
        if req.watermark_path:
            validate_input_file(req.watermark_path, label="watermark_path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not req.segments:
        raise HTTPException(status_code=400, detail="No clip segments selected")

    if subtitles_required and not req.srt_ref:
        raise HTTPException(status_code=400, detail="Burned clip export requires subtitles")

    from backend.application.task_operations import submit_task_operation

    response = await submit_task_operation("clip_export", req)
    return TaskResponse(**response)


@router.post("/synthesize", response_model=TaskResponse)
async def start_synthesis_task(req: SynthesisRequest):
    """
    Start a video synthesis task (burn-in subtitles/watermark).
    This is a long-running process, so we offload it.
    """
    try:
        validate_input_file(req.video_ref.path, label="video_ref.path")
        validate_input_file(req.srt_ref.path, label="srt_ref.path")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Determine output path if not provided
    if not req.output_ref:
        base, _ = os.path.splitext(req.video_ref.path)
        req.output_ref = MediaReference(
            path=f"{base}_burned.mp4",
            name=os.path.basename(f"{base}_burned.mp4"),
            type="video/mp4",
            media_kind="video",
            role="output",
            origin="task",
        )
    try:
        validate_output_file(req.output_ref.path, label="output_ref.path")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from backend.application.task_operations import submit_task_operation

    response = await submit_task_operation("synthesis", req)
    return TaskResponse(**response)
