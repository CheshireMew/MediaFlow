from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
import wave
from pathlib import Path

from loguru import logger

from backend.config import settings
from backend.core.adapters.faster_whisper import FasterWhisperConfig


class CliPrewarmManager:
    FRESH_SECONDS = 20 * 60
    JOIN_TIMEOUT_SECONDS = 180

    _lock = threading.Lock()
    _completed_profiles: dict[tuple[str, str, str], float] = {}
    _threads: dict[tuple[str, str, str], threading.Thread] = {}
    _processes: dict[tuple[str, str, str], subprocess.Popen] = {}
    _cancelled_profiles: set[tuple[str, str, str]] = set()

    def __init__(self, *, model_manager, adapter):
        self._model_manager = model_manager
        self._adapter = adapter

    @staticmethod
    def available_cli_path() -> Path | None:
        configured_path = settings.FASTER_WHISPER_CLI_PATH or ""
        if not configured_path:
            return None
        cli_path = Path(configured_path)
        return cli_path.resolve() if cli_path.exists() else None

    @classmethod
    def profile_key(
        cls,
        model_name: str,
        device: str,
    ) -> tuple[str, str, str] | None:
        cli_path = cls.available_cli_path()
        if cli_path is None:
            return None
        return (str(cli_path), model_name or "base", device or "cpu")

    def start(self, model_name: str = "base", device: str = "cpu") -> bool:
        profile_key = self.profile_key(model_name, device)
        if profile_key is None:
            logger.info("Faster-Whisper CLI prewarm skipped: executable is not configured.")
            return False

        with self._lock:
            if self._is_fresh_locked(profile_key):
                logger.debug("Faster-Whisper CLI prewarm still fresh for {}", profile_key)
                return False

            existing_thread = self._threads.get(profile_key)
            if existing_thread and existing_thread.is_alive():
                logger.debug("Faster-Whisper CLI prewarm is already running for {}", profile_key)
                return False

            thread = threading.Thread(
                target=self._run,
                args=profile_key,
                name="faster-whisper-cli-prewarm",
                daemon=True,
            )
            self._threads[profile_key] = thread
            thread.start()
            return True

    def join_running(
        self,
        model_name: str,
        device: str,
        reason: str,
        progress_callback=None,
    ) -> None:
        profile_key = self.profile_key(model_name, device)
        if profile_key is None:
            return

        with self._lock:
            thread = self._threads.get(profile_key)
            process = self._processes.get(profile_key)
            if not thread or not thread.is_alive():
                return

        logger.info("Waiting for Faster-Whisper CLI prewarm for {}: {}", profile_key, reason)
        if progress_callback:
            progress_callback(0, "asr_cli_warmup_waiting", {})

        thread.join(timeout=self.JOIN_TIMEOUT_SECONDS)
        if not thread.is_alive():
            logger.info("Faster-Whisper CLI prewarm finished before transcription for {}", profile_key)
            return

        with self._lock:
            self._cancelled_profiles.add(profile_key)

        logger.warning(
            "Faster-Whisper CLI prewarm exceeded {}s while {}; stopping it.",
            self.JOIN_TIMEOUT_SECONDS,
            reason,
        )
        if process and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            except Exception as exc:
                logger.warning("Failed to stop Faster-Whisper CLI prewarm process: {}", exc)
        thread.join(timeout=5)

    @classmethod
    def _is_fresh_locked(cls, profile_key: tuple[str, str, str]) -> bool:
        completed_at = cls._completed_profiles.get(profile_key)
        if completed_at is None:
            return False
        age = time.monotonic() - completed_at
        if age <= cls.FRESH_SECONDS:
            return True
        cls._completed_profiles.pop(profile_key, None)
        logger.debug("Faster-Whisper CLI prewarm expired for {} after {:.1f}s", profile_key, age)
        return False

    def _run(self, cli_path: str, model_name: str, device: str) -> None:
        profile_key = (cli_path, model_name, device)
        started_at = time.perf_counter()
        logger.info(
            "Faster-Whisper CLI prewarm started: model={} device={} cli={}",
            model_name,
            device,
            cli_path,
        )

        try:
            cached_model_path = self._model_manager.get_cached_model_path(model_name)
            if not cached_model_path.exists() or not any(cached_model_path.iterdir()):
                logger.info(
                    "Faster-Whisper CLI prewarm skipped: model is not cached locally: {}",
                    cached_model_path,
                )
                return

            audio_path = self._ensure_audio()
            output_dir = (
                settings.TEMP_DIR
                / "faster-whisper-cli-prewarm"
                / self._profile_dir_name(model_name, device)
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
            command = self._adapter.build_command(config)
            command[0] = cli_path

            with self._lock:
                if profile_key in self._cancelled_profiles:
                    logger.info("Faster-Whisper CLI prewarm aborted before spawn for {}", profile_key)
                    return

            process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            with self._lock:
                self._processes[profile_key] = process

            returncode = process.wait(timeout=300)
            elapsed = time.perf_counter() - started_at
            with self._lock:
                was_cancelled = profile_key in self._cancelled_profiles

            if was_cancelled:
                logger.info("Faster-Whisper CLI prewarm stopped after {:.3f}s", elapsed)
            elif returncode == 0:
                with self._lock:
                    self._completed_profiles[profile_key] = time.monotonic()
                logger.info("Faster-Whisper CLI prewarm completed in {:.3f}s", elapsed)
            else:
                logger.warning("Faster-Whisper CLI prewarm exited with code {}", returncode)
        except subprocess.TimeoutExpired:
            logger.warning("Faster-Whisper CLI prewarm timed out")
        except Exception as exc:
            logger.warning("Faster-Whisper CLI prewarm failed: {}", exc)
        finally:
            with self._lock:
                self._threads.pop(profile_key, None)
                self._processes.pop(profile_key, None)
                self._cancelled_profiles.discard(profile_key)

    @staticmethod
    def _ensure_audio() -> Path:
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
    def _profile_dir_name(model_name: str, device: str) -> str:
        raw_name = f"{model_name}-{device}"
        return "".join(
            char if char.isalnum() or char in {"-", "_"} else "_"
            for char in raw_name
        )
