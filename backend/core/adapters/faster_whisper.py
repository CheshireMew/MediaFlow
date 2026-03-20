import os
import subprocess
import re
import shutil
from pathlib import Path
from typing import Optional, List, Callable, Any
from pydantic import BaseModel, Field, field_validator

from loguru import logger
from backend.core.adapters.base import BaseAdapter
from backend.config import settings
from backend.utils.subtitle_manager import SubtitleManager
from backend.models.schemas import SubtitleSegment

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
    vad_filter: bool = True
    max_line_width: int = Field(default=50, ge=10, le=200)
    max_line_count: int = 1
    device: str = "cpu"
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
            "--output_format", "srt",
            "--print_progress",
            "--vad_filter", "True" if config.vad_filter else "False",
            "--max_line_width", str(config.max_line_width),
            "--max_line_count", str(config.max_line_count),
            "--device", config.device
        ]

        if config.sentence:
            cmd.extend(["--sentence"])
            cmd.extend(["--max_comma", str(config.max_comma)])
            cmd.extend(["--max_comma_cent", str(config.max_comma_cent)])

        if config.language and config.language != "auto":
            cmd.extend(["--language", config.language])

        if config.initial_prompt:
            cmd.extend(["--initial_prompt", config.initial_prompt])

        return cmd

    def _resolve_model_name(self, config: FasterWhisperConfig) -> str:
        name = config.model_name

        # The CLI resolves model folders beneath --model_dir on its own and may
        # prepend "faster-whisper-" internally. Passing the prefixed folder name
        # here can therefore become "faster-whisper-faster-whisper-*" and miss
        # an otherwise valid local cache.
        if (config.model_dir / f"faster-whisper-{name}").exists():
            return name

        return name

    def execute(self, config: FasterWhisperConfig, progress_callback: Optional[Callable[[int, str], None]] = None) -> List[SubtitleSegment]:
        self.validate(config)
        
        # Ensure output dir exists
        config.output_dir.mkdir(parents=True, exist_ok=True)
        
        cmd = self.build_command(config)
        logger.info(f"Adapter executing: {' '.join(cmd)}")
        
        if progress_callback:
            progress_callback(0, "Starting transcription...")

        return self._run_subprocess(cmd, config, progress_callback)

    def _run_subprocess(self, cmd: List[str], config: FasterWhisperConfig, progress_callback) -> List[SubtitleSegment]:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        notable_output: list[str] = []
        
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                line = line.strip()
                # Progress parsing
                if match := re.search(r"(\d+)%", line):
                    p = int(match.group(1))
                    if "MB" not in line and "kB" not in line and progress_callback: 
                        progress_callback(10 + int(p * 0.8), f"Transcribing... {p}%")
                
                if not any(x in line for x in ["items/s", "it/s", "MB/s", ".bin", ".json"]) and line.strip():
                     logger.debug(f"CLI: {line}")
                     notable_output.append(line)
        
        # Wait for process to really finish
        process.wait()

        # Post-process: Find SRT first to see if work was actually done
        srt_files = list(config.output_dir.glob("*.srt"))
        has_output = len(srt_files) > 0 and srt_files[0].stat().st_size > 0

        if process.returncode != 0:
            # 3221226505 = 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN)
            # 3221225477 = 0xC0000005 (Access Violation)
            known_exit_crashes = [3221226505, 3221225477, -1073740791, -1073741819]
            
            if has_output:
                logger.warning(f"CLI succeeded (output found) but process crashed on exit with code {process.returncode}. This is likely a Windows-specific shutdown issue and can be ignored.")
            else:
                # True failure
                stderr_output = process.stdout.read() if process.stdout else "" # stdout was redirected to stderr in Popen? No, merged.
                raise RuntimeError(f"CLI process failed with code {process.returncode}. No output generated.")

        unknown_model_line = next(
            (line for line in notable_output if "Unknown model not found at:" in line),
            None,
        )
        if unknown_model_line:
            raise RuntimeError(unknown_model_line)

        if not has_output:
             hint = notable_output[-1] if notable_output else "No CLI details captured."
             raise RuntimeError(f"CLI process exited successfully but no SRT output was generated. Last detail: {hint}")
             
        srt_path = srt_files[0]
             
        srt_path = srt_files[0]
        content = srt_path.read_text(encoding='utf-8')
        
        return SubtitleManager.parse_srt(content)
