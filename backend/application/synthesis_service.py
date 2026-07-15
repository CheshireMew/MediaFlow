from backend.models.synthesis_contracts import SynthesisRequest
from backend.services.generated_output_paths import build_suffixed_output_path


def build_synthesis_worker_kwargs(
    req: SynthesisRequest,
    *,
    progress_callback=None,
) -> dict:
    output_path = (
        req.output_ref.path
        if req.output_ref
        else str(
            build_suffixed_output_path(
                req.video_ref.path,
                "_synthesized",
                extension=".mp4",
            )
        )
    )
    return {
        "video_path": req.video_ref.path,
        "srt_path": req.srt_ref.path if req.srt_ref else None,
        "output_path": output_path,
        "watermark_path": req.watermark_ref.path if req.watermark_ref else None,
        "options": req.options,
        "progress_callback": progress_callback,
    }
