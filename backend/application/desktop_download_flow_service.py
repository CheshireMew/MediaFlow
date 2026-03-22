from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from pydantic import BaseModel

from backend.application.translation_service import build_translation_task_result
from backend.models.schemas import FileRef, SubtitleSegment, TaskResult
from backend.services.media_refs import create_media_ref
from backend.services.asr import ASRService
from backend.services.downloader.service import DownloaderService
from backend.services.translator.llm_translator import LLMTranslator
from backend.services.video_synthesizer import VideoSynthesizer


ProgressCallback = Callable[[int | float, str], None]


class DesktopDownloadFlowRequest(BaseModel):
    url: str
    proxy: Optional[str] = None
    output_dir: Optional[str] = None
    playlist_title: Optional[str] = None
    playlist_items: Optional[str] = None
    download_subs: bool = False
    resolution: str = "best"
    task_id: Optional[str] = None
    cookie_file: Optional[str] = None
    filename: Optional[str] = None
    local_source: Optional[str] = None
    codec: str = "best"
    auto_execute_flow: bool = False
    transcription_model: str = "base"
    device: str = "cpu"
    language: Optional[str] = None
    initial_prompt: Optional[str] = None
    target_language: str = "Chinese"


class DesktopDownloadFlowService:
    def __init__(
        self,
        downloader: DownloaderService | None = None,
        asr_service: ASRService | None = None,
        translator: LLMTranslator | None = None,
        synthesizer: VideoSynthesizer | None = None,
    ):
        self._downloader = downloader or DownloaderService()
        self._asr_service = asr_service or ASRService()
        self._translator = translator or LLMTranslator()
        self._synthesizer = synthesizer or VideoSynthesizer()

    async def execute(
        self,
        request: DesktopDownloadFlowRequest,
        *,
        progress_callback: ProgressCallback,
    ) -> TaskResult:
        result = await self._downloader.download(
            url=request.url,
            proxy=request.proxy,
            output_dir=request.output_dir,
            playlist_title=request.playlist_title,
            playlist_items=request.playlist_items,
            progress_callback=progress_callback,
            download_subs=request.download_subs,
            resolution=request.resolution,
            task_id=request.task_id,
            cookie_file=request.cookie_file,
            filename=request.filename,
            local_source=request.local_source,
            codec=request.codec,
        )

        if not result.success:
            raise RuntimeError(result.error or "Download failed")

        if request.auto_execute_flow:
            await self._run_auto_flow(
                request=request,
                result=result,
                progress_callback=progress_callback,
            )
            progress_callback(100, "Download flow completed")

        return result

    async def _run_auto_flow(
        self,
        *,
        request: DesktopDownloadFlowRequest,
        result: TaskResult,
        progress_callback: ProgressCallback,
    ) -> None:
        media_file = next(
            (file_ref for file_ref in result.files if file_ref.type in {"video", "audio"}),
            None,
        )
        if not media_file:
            return

        media_path = media_file.path
        subtitle_path = next(
            (file_ref.path for file_ref in result.files if file_ref.type == "subtitle"),
            None,
        )

        def transcribe_progress(progress: int, message: str) -> None:
            progress_callback(45 + progress * 0.30, message)

        asr_result = self._asr_service.transcribe(
            audio_path=media_path,
            model_name=request.transcription_model,
            device=request.device,
            language=request.language,
            initial_prompt=request.initial_prompt,
            task_id=request.task_id,
            progress_callback=transcribe_progress,
        )
        if not asr_result.success:
            raise RuntimeError(asr_result.error or "Transcription failed")

        subtitle_path = next(
            (file_ref.path for file_ref in asr_result.files if file_ref.type == "subtitle"),
            subtitle_path,
        )
        self._merge_result_files(result, asr_result.files)
        result.meta.update(
            {
                "transcript": asr_result.meta.get("text", ""),
                "transcription_language": asr_result.meta.get("language", "auto"),
            }
        )

        if not subtitle_path:
            return

        segments = [
            SubtitleSegment.model_validate(segment)
            for segment in asr_result.meta.get("segments", [])
        ]
        if not segments:
            return

        def translate_progress(progress: int, message: str) -> None:
            progress_callback(75 + progress * 0.15, message)

        translated_segments = self._translator.translate_segments(
            segments=segments,
            target_language=request.target_language,
            mode="standard",
            batch_size=10,
            progress_callback=translate_progress,
        )
        translation_result = build_translation_task_result(
            translated_segments,
            target_language=request.target_language,
            mode="standard",
            context_path=subtitle_path,
        )
        translated_srt_path = translation_result.meta.get("srt_path")
        if translated_srt_path:
            self._merge_result_files(result, translation_result.files)
            result.meta["translated_subtitle_path"] = translated_srt_path
            result.meta["subtitle_ref"] = create_media_ref(
                translated_srt_path,
                "application/x-subrip",
                role="output",
            )
            result.meta["output_ref"] = create_media_ref(
                translated_srt_path,
                "application/x-subrip",
                role="output",
            )

        if media_file.type != "video" or not translated_srt_path:
            return

        def synthesize_progress(progress: int | float, message: str) -> None:
            progress_callback(90 + float(progress) * 0.10, message)

        synthesized_path = self._synthesizer.burn_in_subtitles(
            video_path=media_path,
            srt_path=translated_srt_path,
            output_path=str(
                Path(media_path).with_name(
                    f"{Path(media_path).stem}_synthesized{Path(media_path).suffix}"
                )
            ),
            watermark_path=None,
            options={},
            progress_callback=synthesize_progress,
        )
        result.files.append(
            FileRef(type="video", path=synthesized_path, label="synthesis_output")
        )
        result.meta["video_path"] = synthesized_path
        result.meta["video_ref"] = create_media_ref(
            synthesized_path,
            "video/mp4",
            role="output",
        )
        result.meta["output_ref"] = create_media_ref(
            synthesized_path,
            "video/mp4",
            role="output",
        )

    @staticmethod
    def _merge_result_files(result: TaskResult, files: list[FileRef]) -> None:
        existing_paths = {file_ref.path for file_ref in result.files}
        for file_ref in files:
            if file_ref.path in existing_paths:
                continue
            result.files.append(file_ref)
            existing_paths.add(file_ref.path)
