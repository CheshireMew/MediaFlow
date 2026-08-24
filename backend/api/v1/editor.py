from fastapi import APIRouter, Query, Response, UploadFile

from backend.models.editor_contracts import (
    EditorPreviewMediaRequest,
    EditorPreviewMediaResponse,
    HighlightDetectionRequest,
    HighlightDetectionResponse,
    ImagePreviewResponse,
    MediaExportTimelineRequest,
    MediaExportTimelineResponse,
)
from backend.models.waveform_contract import (
    WAVEFORM_BINARY_MEDIA_TYPE,
    WAVEFORM_DEFAULT_RESPONSE_POINTS,
    WAVEFORM_MAX_POINTS,
)


async def upload_watermark_for_preview(file: UploadFile, *, editor_application):
    return await editor_application.save_watermark_preview(file.filename, file.file)


async def get_current_watermark(*, editor_application):
    return await editor_application.get_latest_watermark_preview()


async def get_media_export_timeline(req: MediaExportTimelineRequest, *, editor_application):
    return await editor_application.get_media_export_timeline(req)


async def resolve_preview_media_source(req: EditorPreviewMediaRequest, *, editor_application):
    return await editor_application.resolve_preview_media(req)


async def resolve_waveform_peaks(
    req: EditorPreviewMediaRequest,
    *,
    max_points: int,
    editor_application,
):
    return await editor_application.resolve_waveform(req, max_points=max_points)


async def detect_highlight_candidates(req: HighlightDetectionRequest, *, editor_application):
    return await editor_application.detect_highlights(req)


def create_router(editor_application) -> APIRouter:
    router = APIRouter(prefix="/editor", tags=["Editor"])
    async def upload_watermark(file: UploadFile):
        return await upload_watermark_for_preview(
            file,
            editor_application=editor_application,
        )

    router.add_api_route(
        "/preview/upload-watermark",
        upload_watermark,
        methods=["POST"],
        response_model=ImagePreviewResponse,
    )
    async def latest_watermark():
        return await get_current_watermark(editor_application=editor_application)

    router.add_api_route(
        "/preview/watermark/latest",
        latest_watermark,
        methods=["GET"],
        response_model=ImagePreviewResponse | None,
    )
    async def export_timeline(req: MediaExportTimelineRequest):
        return await get_media_export_timeline(
            req,
            editor_application=editor_application,
        )

    router.add_api_route(
        "/preview/media/export-timeline",
        export_timeline,
        methods=["POST"],
        response_model=MediaExportTimelineResponse,
    )
    async def preview_source(req: EditorPreviewMediaRequest):
        return await resolve_preview_media_source(
            req,
            editor_application=editor_application,
        )

    router.add_api_route(
        "/preview/media/source",
        preview_source,
        methods=["POST"],
        response_model=EditorPreviewMediaResponse,
    )
    async def waveform(
        req: EditorPreviewMediaRequest,
        max_points: int = Query(
            default=WAVEFORM_DEFAULT_RESPONSE_POINTS,
            ge=2,
            le=WAVEFORM_MAX_POINTS,
        ),
    ):
        payload = await resolve_waveform_peaks(
            req,
            max_points=max_points,
            editor_application=editor_application,
        )
        return Response(content=payload, media_type=WAVEFORM_BINARY_MEDIA_TYPE)

    router.add_api_route(
        "/preview/media/waveform",
        waveform,
        methods=["POST"],
        response_class=Response,
        responses={
            200: {
                "content": {
                    WAVEFORM_BINARY_MEDIA_TYPE: {
                        "schema": {"type": "string", "format": "binary"}
                    }
                }
            }
        },
    )

    async def detect(req: HighlightDetectionRequest):
        return await detect_highlight_candidates(
            req,
            editor_application=editor_application,
        )

    router.add_api_route(
        "/highlights/detect",
        detect,
        methods=["POST"],
        response_model=HighlightDetectionResponse,
    )
    return router
