import json
import os
import queue
import re
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from types import SimpleNamespace
from typing import List, Optional

from loguru import logger
from pydantic import BaseModel, Field, field_validator

from backend.config import settings
from backend.core.adapters.base import BaseAdapter
from backend.core.asr_execution import check_control
from backend.models.subtitle_contracts import SubtitleSegment
from backend.models.task_message import TaskProgressCallback
from backend.models.transcription_contracts import DEFAULT_ASR_VAD_FILTER
from backend.utils.segment_refiner import SegmentRefiner
from backend.utils.subtitle_parser import SubtitleParser

WINDOWS_SHUTDOWN_CRASH_EXIT_CODES = frozenset(
    {
        3221226505,  # 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN)
        3221225477,  # 0xC0000005 (STATUS_ACCESS_VIOLATION)
        -1073740791,
        -1073741819,
    }
)


class FasterWhisperConfig(BaseModel):
    """
    Strict configuration for Faster Whisper CLI execution.
    """
    audio_path: Path
    output_dir: Path
    model_name: str = "base"
    model_dir: Path
    language: Optional[str] = "auto"
    initial_prompt: Optional[str] = None
    vad_filter: bool = DEFAULT_ASR_VAD_FILTER
    max_line_width: Optional[int] = Field(default=None, ge=10, le=200)
    max_line_count: Optional[int] = 1
    device: str = "cpu"
    batch_size: int = Field(default=1, ge=1, le=4)
    # Sentence segmentation (faster-whisper-xxl)
    sentence: bool = True
    max_comma: int = 20
    max_comma_cent: int = 50

    @field_validator("audio_path")
    @classmethod
    def validate_audio_exists(cls, v: Path) -> Path:
        if not v.exists():
            raise ValueError(f"Audio file not found: {v}")
        return v

    @field_validator("output_dir")
    @classmethod
    def validate_output_dir(cls, v: Path) -> Path:
        # We allow creation if not exists, but parent must exist? 
        # For simplicity, we just ensure it's a valid path structure.
        return v

    @field_validator("max_comma_cent")
    @classmethod
    def validate_max_comma_cent(cls, v: int) -> int:
        allowed = {20, 30, 40, 50, 60, 70, 80, 90, 100}
        if v not in allowed:
            raise ValueError(
                f"max_comma_cent must be one of {sorted(allowed)}, got {v}"
            )
        return v

class FasterWhisperAdapter(BaseAdapter[FasterWhisperConfig, List[SubtitleSegment]]):
    """
    Adapter for the standalone Faster-Whisper-XXL CLI.
    """

    def validate(self, config: FasterWhisperConfig) -> bool:
        # Pydantic handles most validation. 
        # We can add extra checks here, e.g., executable existence.
        if not Path(settings.FASTER_WHISPER_CLI_PATH).exists():
            raise FileNotFoundError(f"CLI executable not found at {settings.FASTER_WHISPER_CLI_PATH}")
        return True

    def build_command(self, config: FasterWhisperConfig) -> List[str]:
        """
        Pure function to build command args.
        """
        # Resolve max_line_width based on logic if not strict? 
        # No, config has it strict. Service layer must calculate it.

        cmd = [
            settings.FASTER_WHISPER_CLI_PATH,
            str(config.audio_path),
            "--model", self._resolve_model_name(config),
            "--model_dir", str(config.model_dir),
            "-o", str(config.output_dir),
            "--output_format", "json", "srt",
            "--print_progress",
            "--vad_filter", "True" if config.vad_filter else "False",
            "--device", config.device,
            "--compute_type", "float16" if config.device.startswith("cuda") else "int8",
            "--word_timestamps", "True",
            "--beep_off",
        ]
        if config.batch_size > 1 and config.vad_filter:
            cmd.extend(["--batched", "--batch_size", str(config.batch_size), "--chunk_length", "30"])

        # Keep line layout controls opt-in. The default cue shaping should come
        # from sentence segmentation rather than forced in-cue line wrapping.
        if config.max_line_width is not None:
            cmd.extend(["--max_line_width", str(config.max_line_width)])
        if config.max_line_count is not None:
            cmd.extend(["--max_line_count", str(config.max_line_count)])

        if config.sentence:
            cmd.extend(["--sentence"])
            cmd.extend(["--max_comma", str(config.max_comma)])
            cmd.extend(["--max_comma_cent", str(config.max_comma_cent)])

        if config.language and config.language != "auto":
            cmd.extend(["--language", config.language])

        cmd.extend(["--initial_prompt", config.initial_prompt or "None"])

        return cmd

    def _resolve_model_name(self, config: FasterWhisperConfig) -> str:
        name = Path(str(config.model_name)).name

        # The CLI resolves model folders beneath --model_dir on its own and may
        # prepend "faster-whisper-" internally. Passing the prefixed folder name
        # here can therefore become "faster-whisper-faster-whisper-*" and miss
        # an otherwise valid local cache.
        if (config.model_dir / f"faster-whisper-{name}").exists():
            return name

        return name

    def execute(
        self,
        config: FasterWhisperConfig,
        progress_callback: Optional[TaskProgressCallback] = None,
    ) -> List[SubtitleSegment]:
        self.validate(config)
        
        # Ensure output dir exists
        config.output_dir.mkdir(parents=True, exist_ok=True)
        
        cmd = self.build_command(config)
        logger.info(f"Adapter executing: {' '.join(cmd)}")
        
        if progress_callback:
            progress_callback(0, "transcription_starting", {})

        return self._run_subprocess(cmd, config, progress_callback)

    def _run_subprocess(self, cmd: List[str], config: FasterWhisperConfig, progress_callback) -> List[SubtitleSegment]:
        started_at = time.perf_counter()
        first_output_at: float | None = None
        cuda_ready_at: float | None = None
        process_start_at: float | None = None
        language_detect_at: float | None = None
        first_progress_at: float | None = None

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        logger.info(
            "Faster-Whisper CLI process spawned: pid={} spawn_elapsed={:.3f}s",
            process.pid,
            time.perf_counter() - started_at,
        )
        notable_output = deque(maxlen=80)
        output_queue = queue.Queue()

        def read_output():
            try:
                for line in iter(process.stdout.readline, ""):
                    output_queue.put(line)
            finally:
                output_queue.put(None)

        reader = threading.Thread(target=read_output, name="asr-cli-output", daemon=True)
        reader.start()
        progress_state = (0, "transcription_starting", {})
        last_callback_at = time.monotonic()
        
        try:
            while True:
                try:
                    line = output_queue.get(timeout=0.25)
                except queue.Empty:
                    line = ""
                if progress_callback and time.monotonic() - last_callback_at >= 0.5:
                    # Also checks pause/cancel during model loading and silent output.
                    check_control(progress_callback, progress_state)
                    last_callback_at = time.monotonic()
                if line is None:
                    if process.poll() is not None:
                        break
                    continue
                if not line and not reader.is_alive() and process.poll() is not None:
                    break
                if line:
                    line = line.strip()
                    now = time.perf_counter()
                    if first_output_at is None:
                        first_output_at = now
                        logger.info(
                            "Faster-Whisper CLI first output after {:.3f}s: {!r}",
                            first_output_at - started_at,
                            line,
                        )
                    if cuda_ready_at is None and "running on:" in line:
                        cuda_ready_at = now
                        logger.info("Faster-Whisper CLI runtime ready after {:.3f}s", now - started_at)
                    if process_start_at is None and line.startswith("Starting to process:"):
                        process_start_at = now
                        logger.info("Faster-Whisper CLI media processing started after {:.3f}s", now - started_at)
                    if language_detect_at is None and "Detecting language" in line:
                        language_detect_at = now
                        logger.info("Faster-Whisper CLI language detection started after {:.3f}s", now - started_at)
                    # Progress parsing
                    if match := re.search(r"^\s*(\d+)%\s*\|", line):
                        if first_progress_at is None:
                            first_progress_at = now
                            logger.info("Faster-Whisper CLI first progress after {:.3f}s", now - started_at)
                        p = max(0, min(100, int(match.group(1))))
                        if "MB" not in line and "kB" not in line and progress_callback:
                            progress_state = (
                                10 + int(p * 0.8),
                                "transcription_progress",
                                {"percent": p},
                            )
                            progress_callback(*progress_state)
                            last_callback_at = time.monotonic()

                    if not any(x in line for x in ["items/s", "it/s", "MB/s", ".bin", ".json"]) and line.strip():
                        logger.debug(f"CLI: {line}")
                        notable_output.append(line)

            process.wait()
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            reader.join(timeout=2)
            close = getattr(process.stdout, "close", None)
            if close:
                close()
        logger.info(
            "Faster-Whisper CLI process exited: returncode={} total_elapsed={:.3f}s",
            process.returncode,
            time.perf_counter() - started_at,
        )

        # Post-process: Find SRT first to see if work was actually done
        srt_path = config.output_dir / f"{config.audio_path.stem}.srt"
        srt_path = srt_path if srt_path.exists() and srt_path.stat().st_size else None
        json_path = config.output_dir / f"{config.audio_path.stem}.json"
        has_output = srt_path is not None or json_path.is_file()

        if process.returncode != 0:
            if (
                has_output
                and process.returncode in WINDOWS_SHUTDOWN_CRASH_EXIT_CODES
            ):
                logger.warning(f"CLI succeeded (output found) but process crashed on exit with code {process.returncode}. This is likely a Windows-specific shutdown issue and can be ignored.")
            else:
                detail = self._summarize_cli_failure(notable_output)
                output_state = (
                    "Partial SRT output was generated but is not trusted."
                    if has_output
                    else "No output generated."
                )
                raise RuntimeError(
                    f"CLI process failed with code {process.returncode}. "
                    f"{output_state} {detail}"
                )

        unknown_model_line = next(
            (line for line in notable_output if "Unknown model not found at:" in line),
            None,
        )
        if unknown_model_line:
            raise RuntimeError(unknown_model_line)

        if json_path.is_file():
            # JSON preserves word times, unlike the CLI sentence writer which
            # can merge minutes of unpunctuated Chinese into a single cue.
            data = json.loads(json_path.read_text(encoding="utf-8-sig"))
            segments = []
            for item in data["segments"]:
                words = [SimpleNamespace(**word) for word in item.get("words", [])]
                segments.append(SimpleNamespace(**{**item, "words": words}))
            segments.sort(key=lambda segment: (segment.start, segment.end))
            return SegmentRefiner.refine_segments(segments)

        if srt_path is None:
            logger.info(
                "Faster-Whisper CLI completed without speech segments: vad_filter={}",
                config.vad_filter,
            )
            return []

        content = srt_path.read_text(encoding='utf-8-sig')
        
        return SegmentRefiner.refine_segments(SubtitleParser.parse_srt(content))

    @staticmethod
    def _summarize_cli_failure(notable_output: List[str]) -> str:
        if not notable_output:
            return "No CLI details captured."
        notable_output = list(notable_output)

        combined_output = "\n".join(notable_output)
        cuda_match = re.search(r"(CUDA failed with error .+)", combined_output)
        if cuda_match and "driver version is insufficient" in cuda_match.group(1).lower():
            return (
                f"{cuda_match.group(1)}. CUDA 不可用：NVIDIA 驱动版本低于当前 CLI 的 CUDA 运行时要求。"
                "请切换到 CPU，或更新 NVIDIA 驱动后再使用 GPU/CUDA。"
            )

        error_lines = [
            line
            for line in notable_output
            if re.search(r"error|exception|traceback|failed|runtimeerror", line, re.IGNORECASE)
        ]
        selected_lines = error_lines[-6:] if error_lines else notable_output[-6:]
        return "CLI details: " + " | ".join(selected_lines)
