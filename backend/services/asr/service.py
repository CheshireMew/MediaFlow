import os
import time
import shutil
import subprocess
import threading
import wave
import tempfile
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor
from loguru import logger
from backend.config import settings
from backend.models.schemas import SubtitleSegment, TranscribeResponse, TaskResult, FileRef
from backend.utils.audio_processor import AudioProcessor
from backend.utils.subtitle_writer import SubtitleWriter
from backend.utils.segment_refiner import SegmentRefiner
from backend.core.adapters.faster_whisper import FasterWhisperAdapter, FasterWhisperConfig
from backend.core.task_control import TaskControlRequested
from backend.services.runtime_diagnostics import RuntimeDiagnosticsService
from backend.services.media_refs import create_media_ref

from .model_manager import ModelManager
from .core_strategies import CoreStrategies

class ASRService:
    CLI_PREWARM_FRESH_SECONDS = 20 * 60
    CLI_PREWARM_JOIN_TIMEOUT_SECONDS = 180

    _cli_prewarm_lock = threading.Lock()
    _cli_prewarmed_profiles: dict[tuple[str, str, str], float] = {}
    _cli_prewarm_threads: dict[tuple[str, str, str], threading.Thread] = {}
    _cli_prewarm_processes: dict[tuple[str, str, str], subprocess.Popen] = {}
    _cli_prewarm_cancelled_profiles: set[tuple[str, str, str]] = set()

    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=settings.ASR_MAX_WORKERS)
        self.model_manager = ModelManager()
        self.adapter = FasterWhisperAdapter()
        self.core_strategies = CoreStrategies(self.executor)

    def start_cli_prewarm(self, model_name: str = "base", device: str = "cpu") -> bool:
        profile_key = self._cli_prewarm_profile_key(model_name, device)
        if profile_key is None:
            logger.info("Faster-Whisper CLI prewarm skipped: executable is not configured.")
            return False

        with ASRService._cli_prewarm_lock:
            if self._is_cli_prewarm_fresh_locked(profile_key):
                logger.debug("Faster-Whisper CLI prewarm still fresh for {}", profile_key)
                return False

            existing_thread = ASRService._cli_prewarm_threads.get(profile_key)
            if existing_thread and existing_thread.is_alive():
                logger.debug("Faster-Whisper CLI prewarm is already running for {}", profile_key)
                return False

            thread = threading.Thread(
                target=self._run_cli_prewarm,
                args=profile_key,
                name="faster-whisper-cli-prewarm",
                daemon=True,
            )
            ASRService._cli_prewarm_threads[profile_key] = thread
            thread.start()
            return True

    def _join_running_cli_prewarm(
        self,
        model_name: str,
        device: str,
        reason: str,
        progress_callback=None,
    ) -> None:
        profile_key = self._cli_prewarm_profile_key(model_name, device)
        if profile_key is None:
            return

        with ASRService._cli_prewarm_lock:
            thread = ASRService._cli_prewarm_threads.get(profile_key)
            process = ASRService._cli_prewarm_processes.get(profile_key)
            if not thread or not thread.is_alive():
                return

        logger.info("Waiting for Faster-Whisper CLI prewarm for {}: {}", profile_key, reason)
        if progress_callback:
            progress_callback(0, "Waiting for Faster-Whisper CLI warmup to finish...")

        thread.join(timeout=self.CLI_PREWARM_JOIN_TIMEOUT_SECONDS)
        if not thread.is_alive():
            logger.info("Faster-Whisper CLI prewarm finished before real transcription for {}", profile_key)
            return

        with ASRService._cli_prewarm_lock:
            ASRService._cli_prewarm_cancelled_profiles.add(profile_key)

        logger.warning(
            "Faster-Whisper CLI prewarm exceeded {}s while {}; stopping it and continuing.",
            self.CLI_PREWARM_JOIN_TIMEOUT_SECONDS,
            reason,
        )

        if process and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning("Faster-Whisper CLI prewarm did not terminate promptly; killing process.")
                process.kill()
                process.wait(timeout=5)
            except Exception as exc:
                logger.warning("Failed to stop Faster-Whisper CLI prewarm process: {}", exc)

        thread.join(timeout=5)

    @classmethod
    def _is_cli_prewarm_fresh_locked(cls, profile_key: tuple[str, str, str]) -> bool:
        completed_at = cls._cli_prewarmed_profiles.get(profile_key)
        if completed_at is None:
            return False

        age = time.monotonic() - completed_at
        if age <= cls.CLI_PREWARM_FRESH_SECONDS:
            return True

        cls._cli_prewarmed_profiles.pop(profile_key, None)
        logger.debug(
            "Faster-Whisper CLI prewarm expired for {} after {:.1f}s",
            profile_key,
            age,
        )
        return False

    @staticmethod
    def _cli_prewarm_profile_key(model_name: str, device: str) -> tuple[str, str, str] | None:
        cli_path = getattr(settings, "FASTER_WHISPER_CLI_PATH", "") or ""
        if not cli_path or not Path(cli_path).exists():
            return None

        return (
            str(Path(cli_path).resolve()),
            model_name or "base",
            device or "cpu",
        )

    def _run_cli_prewarm(self, cli_path: str, model_name: str, device: str) -> None:
        profile_key = (cli_path, model_name, device)
        started_at = time.perf_counter()
        logger.info(
            "Faster-Whisper CLI prewarm started: model={} device={} cli={}",
            model_name,
            device,
            cli_path,
        )

        try:
            cached_model_path = self.model_manager.get_cached_model_path(model_name)
            if not cached_model_path.exists() or not any(cached_model_path.iterdir()):
                logger.info(
                    "Faster-Whisper CLI prewarm skipped: model is not cached locally: {}",
                    cached_model_path,
                )
                return

            audio_path = self._ensure_cli_prewarm_audio()
            output_dir = settings.TEMP_DIR / "faster-whisper-cli-prewarm" / self._prewarm_profile_dir_name(
                model_name,
                device,
            )
            if output_dir.exists():
                shutil.rmtree(output_dir, ignore_errors=True)

            config = FasterWhisperConfig(
                audio_path=audio_path,
                output_dir=output_dir,
                model_name=model_name,
                model_dir=settings.ASR_MODEL_DIR,
                language="en",
                initial_prompt=None,
                vad_filter=False,
                max_line_count=None,
                device=device,
                sentence=False,
            )
            cmd = self.adapter.build_command(config)
            cmd[0] = cli_path

            with ASRService._cli_prewarm_lock:
                if profile_key in ASRService._cli_prewarm_cancelled_profiles:
                    logger.info("Faster-Whisper CLI prewarm aborted before process spawn for {}", profile_key)
                    return

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            with ASRService._cli_prewarm_lock:
                ASRService._cli_prewarm_processes[profile_key] = process

            returncode = process.wait(timeout=300)
            elapsed = time.perf_counter() - started_at
            with ASRService._cli_prewarm_lock:
                was_cancelled = profile_key in ASRService._cli_prewarm_cancelled_profiles

            if was_cancelled:
                logger.info(
                    "Faster-Whisper CLI prewarm stopped after {:.3f}s: model={} device={}",
                    elapsed,
                    model_name,
                    device,
                )
            elif returncode == 0:
                with ASRService._cli_prewarm_lock:
                    ASRService._cli_prewarmed_profiles[profile_key] = time.monotonic()
                logger.info(
                    "Faster-Whisper CLI prewarm completed in {:.3f}s: model={} device={}",
                    elapsed,
                    model_name,
                    device,
                )
            else:
                logger.warning(
                    "Faster-Whisper CLI prewarm exited with code {} after {:.3f}s",
                    returncode,
                    elapsed,
                )
        except subprocess.TimeoutExpired:
            logger.warning(
                "Faster-Whisper CLI prewarm timed out after {:.3f}s",
                time.perf_counter() - started_at,
            )
        except Exception as exc:
            logger.warning("Faster-Whisper CLI prewarm failed: {}", exc)
        finally:
            with ASRService._cli_prewarm_lock:
                ASRService._cli_prewarm_threads.pop(profile_key, None)
                ASRService._cli_prewarm_processes.pop(profile_key, None)
                ASRService._cli_prewarm_cancelled_profiles.discard(profile_key)

    @staticmethod
    def _ensure_cli_prewarm_audio() -> Path:
        audio_path = settings.TEMP_DIR / "faster-whisper-cli-prewarm.wav"
        if audio_path.exists():
            return audio_path

        audio_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(audio_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(b"\x00\x00" * 16000)
        return audio_path

    @staticmethod
    def _prewarm_profile_dir_name(model_name: str, device: str) -> str:
        raw_name = f"{model_name}-{device}"
        return "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in raw_name)

    @staticmethod
    def _create_cli_transcription_output_dir(task_id: str | None) -> Path:
        base_dir = settings.TEMP_DIR / "faster-whisper-cli"
        base_dir.mkdir(parents=True, exist_ok=True)
        safe_task_id = "".join(
            char if char.isascii() and (char.isalnum() or char in {"-", "_"}) else "_"
            for char in (task_id or "sync")
        )[:32] or "sync"
        return Path(tempfile.mkdtemp(prefix=f"transcribe-{safe_task_id}-", dir=base_dir))

    @staticmethod
    def _stage_cli_audio_input(audio_path: Path, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        suffix = audio_path.suffix if audio_path.suffix.isascii() and len(audio_path.suffix) <= 16 else ""
        staged_path = output_dir / f"input{suffix.lower()}"

        try:
            os.link(audio_path, staged_path)
            return staged_path
        except OSError:
            pass

        try:
            os.symlink(audio_path, staged_path)
            return staged_path
        except OSError:
            pass

        logger.info("Copying media to CLI-safe temp path: {}", staged_path)
        shutil.copy2(audio_path, staged_path)
        return staged_path

    @staticmethod
    def _create_segment_audio_path(segment_id: str) -> Path:
        segment_dir = settings.TEMP_DIR / "asr-segments"
        segment_dir.mkdir(parents=True, exist_ok=True)
        return segment_dir / f"segment_{segment_id}.wav"

    def transcribe(self, audio_path: str, model_name: str = "base", device: str = "cpu", language: str = None, task_id: str = None, initial_prompt: str = None, progress_callback=None, generate_peaks: bool = True, engine: str = "builtin") -> TaskResult:
        """
        Main entry point for transcription. Dispatches to specific strategies.
        """
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            return TaskResult(success=False, error=f"File not found: {audio_path}")

        # Calculate duration once for all paths
        try:
            duration = AudioProcessor.get_audio_duration(audio_path)
            logger.info(f"Audio Duration: {duration:.2f}s")
        except Exception as e:
            logger.error(f"Failed to get duration: {e}")
            duration = 0.0

        # Engine selection is request-driven. Do not silently switch engines.
        cli_available = (
            hasattr(settings, "FASTER_WHISPER_CLI_PATH")
            and os.path.exists(settings.FASTER_WHISPER_CLI_PATH)
        )
        use_cli = engine == "cli"
        if use_cli and not cli_available:
            return TaskResult(success=False, error="CLI transcription engine is unavailable")
        if use_cli:
            logger.info("Faster-Whisper CLI enabled. Using CLI transcription path.")

        final_segments = []
        
        if use_cli:
            output_dir = self._create_cli_transcription_output_dir(task_id)
            try:
                cli_audio_path = self._stage_cli_audio_input(Path(audio_path), output_dir)
                # 1. Ensure model is available locally
                # ModelManager returns path to model dir (or model name if fallback)
                local_model_path_str = self.model_manager.ensure_model_downloaded(model_name, progress_callback)
                self._join_running_cli_prewarm(
                    model_name=model_name,
                    device=device,
                    reason="real transcription is starting",
                    progress_callback=progress_callback,
                )
                
                # 2. Configure Adapter
                config = FasterWhisperConfig(
                    audio_path=cli_audio_path,
                    output_dir=output_dir,
                    model_name=model_name,
                    # Pass the root model directory so CLI can find "faster-whisper-{model}" inside it
                    # OR pass the specific path if it's "large-v3" inside "faster-whisper-large-v3"
                    # FasterWhisperAdapter logic: cmd.extend(["--model_dir", str(config.model_dir)])
                    # The CLI --model_dir usually expects the directory containing the model folder, OR the model folder itself?
                    # If I pass the specific folder, then --model arg should be "."? 
                    # Standard Faster-Whisper CLI usage: --model large-v3 --model_dir /path/to/models
                    # It looks for /path/to/models/large-v3 (or faster-whisper-large-v3 depending on impl).
                    # Our ModelManager downloads to settings.ASR_MODEL_DIR / f"faster-whisper-{model_name}"
                    # So we should pass settings.ASR_MODEL_DIR as model_dir.
                    model_dir=settings.ASR_MODEL_DIR,
                    language=language,
                    initial_prompt=initial_prompt,
                    device=device,
                )

                try:
                    final_segments = self.adapter.execute(config, progress_callback)
                except RuntimeError as cli_error:
                    if device == "cuda" and self._is_cli_cuda_unavailable_error(cli_error):
                        logger.warning(f"CLI CUDA unavailable, retrying on CPU: {cli_error}")
                        if progress_callback:
                            progress_callback(0, "CUDA 不可用，已自动切换到 CPU 重试...")
                        cpu_config = config.model_copy(update={"device": "cpu"})
                        final_segments = self.adapter.execute(cpu_config, progress_callback)
                    else:
                        raise
                
            except TaskControlRequested:
                raise
            except Exception as e:
                logger.error(f"CLI Transcription failed: {e}.")
                return TaskResult(success=False, error=f"CLI transcription failed: {e}")
            finally:
                # Cleanup temp output
                if output_dir.exists():
                     try:
                         shutil.rmtree(output_dir, ignore_errors=True)
                     except OSError:
                         pass

        if not use_cli:
            try:
                all_segments = self._transcribe_builtin(
                    audio_path=audio_path,
                    duration=duration,
                    model_name=model_name,
                    device=device,
                    language=language,
                    initial_prompt=initial_prompt,
                    progress_callback=progress_callback,
                )
            except TaskControlRequested:
                raise
            except RuntimeError as error:
                if device == "cuda" and self._is_cuda_runtime_unavailable_error(error):
                    logger.warning(f"Built-in CUDA runtime unavailable, retrying on CPU: {error}")
                    self.model_manager.clear_loaded_model()
                    if progress_callback:
                        progress_callback(8, "CUDA runtime unavailable. Retrying transcription on CPU...")
                    all_segments = self._transcribe_builtin(
                        audio_path=audio_path,
                        duration=duration,
                        model_name=model_name,
                        device="cpu",
                        language=language,
                        initial_prompt=initial_prompt,
                        progress_callback=progress_callback,
                    )
                else:
                    raise

            if progress_callback:
                progress_callback(95, "Finalizing segments...")
            all_segments.sort(key=lambda x: x.start)
            final_segments = all_segments

        # Unified post-processing for both CLI and Python API paths
        logger.info("Applying smart segment merging...")
        if final_segments:
            final_segments = SegmentRefiner.normalize_segments(final_segments)
        else:
            final_segments = []

        # Generate full text
        full_text = "\n".join([s.text for s in final_segments])
            
        logger.success(f"Transcription complete. Total segments: {len(final_segments)}")
        if progress_callback: progress_callback(100, "Completed")
        
        # 5. Save SRT file
        srt_path = SubtitleWriter.save_srt(final_segments, audio_path)
        logger.success(f"SRT file saved to: {srt_path}")

        files = [
            FileRef(type="subtitle", path=str(srt_path), label="transcription")
        ]
        subtitle_ref = create_media_ref(
            str(srt_path),
            "application/x-subrip",
            role="output",
        )

        return TaskResult(
            success=True,
            files=files,
            meta={
                "task_id": task_id or "sync_task",
                "language": language or "auto",
                "duration": duration,
                "segments": [s.model_dump() for s in final_segments],
                "text": full_text,
                "subtitle_ref": subtitle_ref,
            }
        )

    def _transcribe_builtin(
        self,
        *,
        audio_path: str,
        duration: float,
        model_name: str,
        device: str,
        language: str | None,
        initial_prompt: str | None,
        progress_callback=None,
    ) -> list:
        model = self.model_manager.load_model(model_name, device, progress_callback)
        logger.info(f"Audio Duration: {duration:.2f}s")

        if duration > 900:
            return self.core_strategies.transcribe_smart_split(
                audio_path, duration, model, language, initial_prompt, progress_callback
            )
        return self.core_strategies.transcribe_direct(
            audio_path, duration, model, language, initial_prompt, progress_callback
        )

    @staticmethod
    def _is_cli_cuda_unavailable_error(error: Exception) -> bool:
        return RuntimeDiagnosticsService.is_cuda_runtime_unavailable_error(error)

    @staticmethod
    def _is_cuda_runtime_unavailable_error(error: Exception) -> bool:
        return RuntimeDiagnosticsService.is_cuda_runtime_unavailable_error(error)

    def transcribe_segment(
        self,
        audio_path: str,
        start: float,
        end: float,
        model_name: str = "base",
        device: str = "cpu",
        language: str = None,
        engine: str = "builtin",
        task_id: str = None,
        progress_callback=None,
    ) -> TaskResult:
        """
        Transcribe a specific segment of the audio file.
        This is a synchronous blocking call designed for short segments (<60s).
        """
        import uuid
        temp_id = str(uuid.uuid4())[:8]
        segment_path = self._create_segment_audio_path(temp_id)
        
        try:
            # 1. Extract Segment
            AudioProcessor.extract_segment(audio_path, start, end, str(segment_path))
            
            # 2. Transcribe (Recursive call but with short audio)
            # We force internal engine for speed on short segments? 
            # Actually, standard transcribe logic is fine, it handles short files via direct strategy.
            result = self.transcribe(
                audio_path=str(segment_path),
                model_name=model_name,
                device=device,
                language=language,
                engine=engine,
                task_id=task_id or f"seg_{temp_id}",
                progress_callback=progress_callback,
                generate_peaks=False,  # Disable redundant peak generation
            )
            
            # 3. Adjust timestamps relative to original audio
            if result.success and result.meta and "segments" in result.meta:
                for seg in result.meta["segments"]:
                    seg["start"] += start
                    seg["end"] += start
            
            return result

        except Exception as e:
            logger.error(f"Segment transcription failed: {e}")
            return TaskResult(success=False, error=str(e))
        finally:
            # Cleanup
            if segment_path.exists():
                try:
                    os.remove(segment_path)
                except OSError:
                    pass
