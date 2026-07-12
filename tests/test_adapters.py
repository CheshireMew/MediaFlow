import pytest
from pathlib import Path
from backend.core.adapters.faster_whisper import FasterWhisperAdapter, FasterWhisperConfig
from backend.config import settings


class FakeProcess:
    def __init__(self, returncode: int):
        self.pid = 1234
        self.returncode = returncode
        self.stdout = self

    def readline(self) -> str:
        return ""

    def poll(self) -> int:
        return self.returncode

    def wait(self) -> int:
        return self.returncode


class TestFasterWhisperAdapter:
    def setup_method(self):
        settings.FASTER_WHISPER_CLI_PATH = "mock_cli.exe"
        settings.ASR_MODEL_DIR = Path("/mock/models")

    
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
        assert "True" in cmd
        assert "--max_line_width" not in cmd
        assert "--max_line_count" in cmd
        assert "1" in cmd
        assert "--sentence" in cmd
        assert "--max_comma" in cmd
        assert "20" in cmd
        assert "--max_comma_cent" in cmd
        assert "50" in cmd
        assert "--initial_prompt" in cmd
        assert "None" in cmd

    def test_build_command_disables_cli_default_initial_prompt(self, tmp_path):
        audio = tmp_path / "test.wav"
        audio.touch()

        config = FasterWhisperConfig(
            audio_path=audio,
            output_dir=tmp_path / "out",
            model_dir=Path("/models"),
            initial_prompt=None,
        )

        adapter = FasterWhisperAdapter()
        cmd = adapter.build_command(config)

        prompt_index = cmd.index("--initial_prompt")
        assert cmd[prompt_index + 1] == "None"

    def test_build_command_passes_explicit_initial_prompt(self, tmp_path):
        audio = tmp_path / "test.wav"
        audio.touch()

        config = FasterWhisperConfig(
            audio_path=audio,
            output_dir=tmp_path / "out",
            model_dir=Path("/models"),
            initial_prompt="finance terms",
        )

        adapter = FasterWhisperAdapter()
        cmd = adapter.build_command(config)

        prompt_index = cmd.index("--initial_prompt")
        assert cmd[prompt_index + 1] == "finance terms"

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

    def test_validation_rejects_invalid_max_comma_cent(self, tmp_path):
        audio = tmp_path / "test.wav"
        audio.touch()

        with pytest.raises(ValueError, match="max_comma_cent must be one of"):
            FasterWhisperConfig(
                audio_path=audio,
                output_dir=tmp_path / "out",
                model_dir=Path("/models"),
                max_comma_cent=35,
            )

    def test_known_windows_shutdown_crash_with_srt_output_is_tolerated(
        self, tmp_path, monkeypatch
    ):
        config = self._create_subprocess_config_with_srt(tmp_path)
        monkeypatch.setattr(
            "backend.core.adapters.faster_whisper.subprocess.Popen",
            lambda *args, **kwargs: FakeProcess(3221226505),
        )

        segments = FasterWhisperAdapter()._run_subprocess([], config, None)

        assert len(segments) == 1
        assert segments[0].text == "Hello"

    def test_unknown_nonzero_exit_with_partial_srt_output_fails(
        self, tmp_path, monkeypatch
    ):
        config = self._create_subprocess_config_with_srt(tmp_path)
        monkeypatch.setattr(
            "backend.core.adapters.faster_whisper.subprocess.Popen",
            lambda *args, **kwargs: FakeProcess(1),
        )

        with pytest.raises(
            RuntimeError,
            match=r"CLI process failed with code 1.*Partial SRT output.*not trusted",
        ):
            FasterWhisperAdapter()._run_subprocess([], config, None)

    def test_successful_exit_without_srt_is_an_empty_transcript(
        self, tmp_path, monkeypatch
    ):
        config = self._create_subprocess_config(tmp_path)
        monkeypatch.setattr(
            "backend.core.adapters.faster_whisper.subprocess.Popen",
            lambda *args, **kwargs: FakeProcess(0),
        )

        assert FasterWhisperAdapter()._run_subprocess([], config, None) == []

    def test_successful_exit_with_empty_srt_is_an_empty_transcript(
        self, tmp_path, monkeypatch
    ):
        config = self._create_subprocess_config(tmp_path)
        (config.output_dir / "test.srt").touch()
        monkeypatch.setattr(
            "backend.core.adapters.faster_whisper.subprocess.Popen",
            lambda *args, **kwargs: FakeProcess(0),
        )

        assert FasterWhisperAdapter()._run_subprocess([], config, None) == []

    @staticmethod
    def _create_subprocess_config_with_srt(tmp_path) -> FasterWhisperConfig:
        config = TestFasterWhisperAdapter._create_subprocess_config(tmp_path)
        (config.output_dir / "test.srt").write_text(
            "1\n00:00:00,000 --> 00:00:01,000\nHello\n",
            encoding="utf-8",
        )
        return config

    @staticmethod
    def _create_subprocess_config(tmp_path) -> FasterWhisperConfig:
        audio = tmp_path / "test.wav"
        audio.touch()
        output_dir = tmp_path / "out"
        output_dir.mkdir()
        return FasterWhisperConfig(
            audio_path=audio,
            output_dir=output_dir,
            model_dir=tmp_path / "models",
        )
