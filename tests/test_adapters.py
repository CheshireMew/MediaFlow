import pytest
import os
from pathlib import Path
from backend.core.adapters.faster_whisper import FasterWhisperAdapter, FasterWhisperConfig
from backend.config import settings

# Mock settings for test
settings.FASTER_WHISPER_CLI_PATH = "mock_cli.exe"
settings.ASR_MODEL_DIR = Path("/mock/models")

class TestFasterWhisperAdapter:
    
    def test_validation_fails_if_audio_missing(self):
        with pytest.raises(ValueError, match="Audio file not found"):
            FasterWhisperConfig(
                audio_path=Path("non_existent.wav"),
                output_dir=Path("/tmp"),
                model_dir=Path("/models")
            )

    def test_build_command_basic(self, tmp_path):
        # Create dummy audio
        audio = tmp_path / "test.wav"
        audio.touch()
        
        config = FasterWhisperConfig(
             audio_path=audio,
             output_dir=tmp_path / "out",
             model_dir=Path("/models"),
             model_name="base",
             language="en",
             device="cpu"
        )
        
        adapter = FasterWhisperAdapter()
        cmd = adapter.build_command(config)
        
        assert cmd[0] == "mock_cli.exe"
        assert str(audio) in cmd
        assert "--model" in cmd
        assert "base" in cmd
        assert "--language" in cmd
        assert "en" in cmd
        assert "--vad_filter" in cmd
        assert "True" in cmd # checking string conversion
        assert "--max_line_width" not in cmd
        assert "--max_line_count" not in cmd

    def test_build_command_auto_language(self, tmp_path):
        audio = tmp_path / "test.wav"
        audio.touch()
        
        config = FasterWhisperConfig(
             audio_path=audio,
             output_dir=tmp_path / "out",
             model_dir=Path("/models"),
             language="auto"
        )
        
        adapter = FasterWhisperAdapter()
        cmd = adapter.build_command(config)
        
        assert "--language" not in cmd

    def test_model_name_resolution(self, tmp_path):
        audio = tmp_path / "test.wav"
        audio.touch()
        
        config = FasterWhisperConfig(
             audio_path=audio,
             output_dir=tmp_path / "out",
             model_dir=Path("/models"),
             model_name="path/to/large-v3"
        )
        
        adapter = FasterWhisperAdapter()
        # Should resolve to "large-v3"
        assert adapter._resolve_model_name(config) == "large-v3"

    def test_build_command_includes_line_limits_when_explicitly_set(self, tmp_path):
        audio = tmp_path / "test.wav"
        audio.touch()

        config = FasterWhisperConfig(
            audio_path=audio,
            output_dir=tmp_path / "out",
            model_dir=Path("/models"),
            max_line_width=50,
            max_line_count=2,
        )

        adapter = FasterWhisperAdapter()
        cmd = adapter.build_command(config)

        assert "--max_line_width" in cmd
        assert "50" in cmd
        assert "--max_line_count" in cmd
        assert "2" in cmd
