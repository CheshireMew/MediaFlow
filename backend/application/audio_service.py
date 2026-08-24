import asyncio

from backend.application.media_input import require_input_file
from backend.models.audio_contracts import DetectSilenceRequest, DetectSilenceResponse
from backend.utils.audio_processor import AudioProcessor


class AudioApplicationService:
    async def detect_silence(
        self,
        request: DetectSilenceRequest,
    ) -> DetectSilenceResponse:
        audio_path = require_input_file(
            request.audio_ref.path,
            label="audio_ref.path",
        )
        intervals = await asyncio.to_thread(
            AudioProcessor.detect_silence,
            str(audio_path),
            silence_thresh=request.threshold,
            min_silence_dur=request.min_duration,
        )
        return DetectSilenceResponse(silence_intervals=intervals)
