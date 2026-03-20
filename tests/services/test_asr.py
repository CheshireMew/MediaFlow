import pytest
from unittest.mock import MagicMock, patch
from backend.services.asr import ASRService
from backend.utils.subtitle_manager import SubtitleManager
from backend.utils.audio_processor import AudioProcessor
from backend.models.schemas import FileRef, TaskResult

@pytest.fixture
def asr_service():
    return ASRService()

def test_format_timestamp():
    # Test moved to SubtitleManager
    assert SubtitleManager.format_timestamp(0) == "00:00:00,000"
    assert SubtitleManager.format_timestamp(61.5) == "00:01:01,500"
    assert SubtitleManager.format_timestamp(3661.001) == "01:01:01,001"

def test_calculate_split_points():
    # Test moved to AudioProcessor
    total_duration = 3000
    silence_intervals = [(590, 610), (1200, 1220), (1800, 1820)]
    
    # Target chunk duration = 600
    points = AudioProcessor.calculate_split_points(total_duration, silence_intervals, target_chunk_duration=600)
    
    assert len(points) >= 4
    # Points should be roughly at 600, 1200, 1800, 2400...
    # Based on silence intervals, first point should be around 600 (middle of 590-610 is 600)
    assert abs(points[0] - 600) < 1.0

def test_asr_service_singleton(asr_service):
    service2 = ASRService()
    assert asr_service is service2

def test_transcribe_does_not_inject_default_initial_prompt(asr_service, monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.mp3"
    audio_path.write_bytes(b"fake-audio")

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 3.0)
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "sample.srt",
    )

    with patch("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(tmp_path / "fw.exe")), \
         patch.object(asr_service.model_manager, "ensure_model_downloaded", return_value="base"), \
         patch.object(
             asr_service.adapter,
             "execute",
             return_value=[],
         ) as mock_execute:
        result = asr_service.transcribe(
            audio_path=str(audio_path),
            model_name="base",
            device="cpu",
            language="en",
            initial_prompt=None,
            generate_peaks=False,
        )

    assert result.success is True
    config = mock_execute.call_args.args[0]
    assert config.initial_prompt is None
