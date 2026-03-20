import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from backend.services.asr import ASRService
from backend.utils.subtitle_manager import SubtitleManager
from backend.utils.audio_processor import AudioProcessor
from backend.utils.segment_refiner import SegmentRefiner
from backend.models.schemas import FileRef, TaskResult
from backend.models.schemas import SubtitleSegment
from backend.core.task_control import TaskPauseRequested

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


def test_split_audio_physically_uses_precise_wav_chunks(monkeypatch, tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"fake")
    output_dir = tmp_path / "chunks"
    output_dir.mkdir()
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        Path(cmd[-1]).write_bytes(b"wav")
        return MagicMock()

    monkeypatch.setattr("backend.utils.audio_processor.subprocess.run", fake_run)

    chunks = AudioProcessor.split_audio_physically(
        str(source),
        [10.0, 25.5],
        output_dir,
    )

    assert len(chunks) == 3
    assert [offset for _, offset in chunks] == [0.0, 10.0, 25.5]
    assert all(path.endswith(".wav") for path, _ in chunks)
    assert all("pcm_s16le" in cmd for cmd in calls)
    assert all(any(str(part).startswith("atrim=start=") for part in cmd) for cmd in calls)
    assert "atrim=start=0.000:end=10.000,asetpts=PTS-STARTPTS" in calls[0]
    assert "atrim=start=10.000:end=25.500,asetpts=PTS-STARTPTS" in calls[1]
    assert "atrim=start=25.500,asetpts=PTS-STARTPTS" in calls[2]


def test_extract_segment_uses_precise_wav_trim(monkeypatch, tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"fake")
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        Path(cmd[-1]).write_bytes(b"wav")
        return MagicMock()

    monkeypatch.setattr("backend.utils.audio_processor.subprocess.run", fake_run)

    output = AudioProcessor.extract_segment(
        str(source),
        start=12.345,
        end=18.9,
        output_path=str(tmp_path / "segment.mp3"),
    )

    assert output.endswith(".wav")
    assert calls
    assert "pcm_s16le" in calls[0]
    assert "atrim=start=12.345:end=18.900,asetpts=PTS-STARTPTS" in calls[0]


def test_merge_segments_rescues_sentence_continuations():
    segments = [
        SubtitleSegment(
            id="14",
            start=40.84,
            end=44.78,
            text="And as a final point, my own judgment is the story that I hear from many",
        ),
        SubtitleSegment(
            id="15",
            start=44.78,
            end=45.58,
            text="of my peers.",
        ),
    ]

    merged = SegmentRefiner.merge_segments(segments)

    assert len(merged) == 1
    assert merged[0].start == 40.84
    assert merged[0].end == 45.58
    assert merged[0].text.endswith("of my peers.")


def test_transcribe_does_not_fallback_to_internal_engine_on_pause(asr_service, monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.mp4"
    audio_path.write_bytes(b"fake-audio")

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 120.0)
    monkeypatch.setattr(
        "backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH",
        str(tmp_path / "fw.exe"),
    )

    pause_exc = TaskPauseRequested("Task paused by user")
    monkeypatch.setattr(asr_service.adapter, "execute", lambda *args, **kwargs: (_ for _ in ()).throw(pause_exc))

    load_calls = {"count": 0}

    def fake_load_model(*args, **kwargs):
        load_calls["count"] += 1
        return MagicMock()

    monkeypatch.setattr(asr_service.model_manager, "load_model", fake_load_model)
    monkeypatch.setattr(asr_service.model_manager, "ensure_model_downloaded", lambda *args, **kwargs: "base")

    with pytest.raises(TaskPauseRequested, match="Task paused by user"):
        asr_service.transcribe(
            audio_path=str(audio_path),
            model_name="base",
            device="cuda",
            generate_peaks=False,
        )

    assert load_calls["count"] == 0
