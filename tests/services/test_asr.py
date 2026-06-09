import subprocess
import time
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from backend.services.asr import ASRService
from backend.utils.subtitle_writer import SubtitleWriter
from backend.utils.audio_processor import AudioProcessor
from backend.utils.segment_refiner import SegmentRefiner
from backend.utils.subtitle_text_splitter import (
    HARD_WORD_LIMIT_ENGLISH,
    count_text_units,
    find_text_split_index,
)
from backend.models.schemas import FileRef, TaskResult
from backend.models.schemas import SubtitleSegment
from backend.core.task_control import TaskPauseRequested

@pytest.fixture
def asr_service():
    return ASRService()

def test_format_timestamp():
    assert SubtitleWriter.format_timestamp(0) == "00:00:00,000"
    assert SubtitleWriter.format_timestamp(61.5) == "00:01:01,500"
    assert SubtitleWriter.format_timestamp(3661.001) == "01:01:01,001"

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

def test_asr_service_initializes_processing_dependencies(asr_service):
    assert asr_service.executor is not None
    assert asr_service.model_manager is not None
    assert asr_service.adapter is not None
    assert asr_service.core_strategies is not None


def test_cli_prewarm_runs_real_profile_once(asr_service, monkeypatch, tmp_path):
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake")
    temp_dir = tmp_path / "temp"
    model_dir = tmp_path / "models"
    resolved_key = (str(cli_path.resolve()), "base", "cuda")
    calls = []

    class FakeProcess:
        returncode = 0

        def wait(self, timeout=None):
            return self.returncode

        def poll(self):
            return self.returncode

    def fake_popen(cmd, **kwargs):
        calls.append((cmd, kwargs))
        return FakeProcess()

    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr("backend.services.asr.service.settings.TEMP_DIR", temp_dir)
    monkeypatch.setattr("backend.services.asr.service.settings.ASR_MODEL_DIR", model_dir)
    monkeypatch.setattr("backend.services.asr.service.subprocess.Popen", fake_popen)
    cached_model_path = model_dir / "faster-whisper-base"
    cached_model_path.mkdir(parents=True)
    (cached_model_path / "model.bin").write_bytes(b"ok")
    ASRService._cli_prewarmed_profiles.pop(resolved_key, None)
    ASRService._cli_prewarm_threads.pop(resolved_key, None)
    ASRService._cli_prewarm_processes.pop(resolved_key, None)
    ASRService._cli_prewarm_cancelled_profiles.discard(resolved_key)

    assert asr_service.start_cli_prewarm(model_name="base", device="cuda") is True
    deadline = time.time() + 5
    while resolved_key not in ASRService._cli_prewarmed_profiles and time.time() < deadline:
        thread = ASRService._cli_prewarm_threads.get(resolved_key)
        if thread:
            thread.join(timeout=0.1)
        else:
            time.sleep(0.01)

    assert len(calls) == 1
    cmd, kwargs = calls[0]
    assert cmd[0] == str(cli_path.resolve())
    assert "--model" in cmd
    assert cmd[cmd.index("--model") + 1] == "base"
    assert "--device" in cmd
    assert cmd[cmd.index("--device") + 1] == "cuda"
    assert "--vad_filter" in cmd
    assert cmd[cmd.index("--vad_filter") + 1] == "False"
    assert kwargs["stdout"] is subprocess.DEVNULL
    assert kwargs["stderr"] is subprocess.STDOUT
    assert asr_service.start_cli_prewarm(model_name="base", device="cuda") is False


def test_cli_prewarm_does_not_download_missing_model(asr_service, monkeypatch, tmp_path):
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake")
    model_dir = tmp_path / "models"
    resolved_key = (str(cli_path.resolve()), "large-v3", "cuda")
    run_mock = MagicMock()
    download_mock = MagicMock()

    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr("backend.services.asr.service.settings.ASR_MODEL_DIR", model_dir)
    monkeypatch.setattr("backend.services.asr.service.subprocess.Popen", run_mock)
    monkeypatch.setattr(asr_service.model_manager, "ensure_model_downloaded", download_mock)
    ASRService._cli_prewarmed_profiles.pop(resolved_key, None)
    ASRService._cli_prewarm_threads.pop(resolved_key, None)
    ASRService._cli_prewarm_processes.pop(resolved_key, None)
    ASRService._cli_prewarm_cancelled_profiles.discard(resolved_key)

    assert asr_service.start_cli_prewarm(model_name="large-v3", device="cuda") is True
    deadline = time.time() + 5
    while ASRService._cli_prewarm_threads.get(resolved_key) and time.time() < deadline:
        ASRService._cli_prewarm_threads[resolved_key].join(timeout=0.1)

    download_mock.assert_not_called()
    run_mock.assert_not_called()


def test_cli_transcribe_waits_for_running_prewarm_for_same_profile(asr_service, monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.mp4"
    audio_path.write_bytes(b"fake-audio")
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake")
    resolved_key = (str(cli_path.resolve()), "base", "cuda")
    prewarm_thread = MagicMock()
    prewarm_thread.is_alive.side_effect = [True, False]
    prewarm_thread.join = MagicMock()
    prewarm_process = MagicMock()
    prewarm_process.poll.return_value = None

    ASRService._cli_prewarmed_profiles.pop(resolved_key, None)
    ASRService._cli_prewarm_threads[resolved_key] = prewarm_thread
    ASRService._cli_prewarm_processes[resolved_key] = prewarm_process
    ASRService._cli_prewarm_cancelled_profiles.discard(resolved_key)

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 3.0)
    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "sample.srt",
    )
    monkeypatch.setattr(asr_service.model_manager, "ensure_model_downloaded", lambda *args, **kwargs: "base")
    monkeypatch.setattr(asr_service.adapter, "execute", lambda *args, **kwargs: [])

    try:
        result = asr_service.transcribe(
            audio_path=str(audio_path),
            model_name="base",
            device="cuda",
            language="en",
            engine="cli",
            generate_peaks=False,
        )
    finally:
        ASRService._cli_prewarm_threads.pop(resolved_key, None)
        ASRService._cli_prewarm_processes.pop(resolved_key, None)
        ASRService._cli_prewarm_cancelled_profiles.discard(resolved_key)

    assert result.success is True
    prewarm_process.terminate.assert_not_called()
    prewarm_process.wait.assert_not_called()
    prewarm_thread.join.assert_called_once_with(timeout=ASRService.CLI_PREWARM_JOIN_TIMEOUT_SECONDS)


def test_cli_prewarm_expires_completed_profile(asr_service, monkeypatch, tmp_path):
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake")
    temp_dir = tmp_path / "temp"
    model_dir = tmp_path / "models"
    resolved_key = (str(cli_path.resolve()), "base", "cuda")
    calls = []

    class FakeProcess:
        returncode = 0

        def wait(self, timeout=None):
            return self.returncode

        def poll(self):
            return self.returncode

    def fake_popen(cmd, **kwargs):
        calls.append((cmd, kwargs))
        return FakeProcess()

    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr("backend.services.asr.service.settings.TEMP_DIR", temp_dir)
    monkeypatch.setattr("backend.services.asr.service.settings.ASR_MODEL_DIR", model_dir)
    monkeypatch.setattr("backend.services.asr.service.subprocess.Popen", fake_popen)
    cached_model_path = model_dir / "faster-whisper-base"
    cached_model_path.mkdir(parents=True)
    (cached_model_path / "model.bin").write_bytes(b"ok")
    ASRService._cli_prewarmed_profiles[resolved_key] = (
        time.monotonic() - ASRService.CLI_PREWARM_FRESH_SECONDS - 1
    )
    ASRService._cli_prewarm_threads.pop(resolved_key, None)
    ASRService._cli_prewarm_processes.pop(resolved_key, None)
    ASRService._cli_prewarm_cancelled_profiles.discard(resolved_key)

    assert asr_service.start_cli_prewarm(model_name="base", device="cuda") is True
    deadline = time.time() + 5
    while len(calls) == 0 and time.time() < deadline:
        thread = ASRService._cli_prewarm_threads.get(resolved_key)
        if thread:
            thread.join(timeout=0.1)
        else:
            time.sleep(0.01)

    assert len(calls) == 1


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
            engine="cli",
            generate_peaks=False,
        )

    assert result.success is True
    config = mock_execute.call_args.args[0]
    assert config.initial_prompt is None
    cmd = asr_service.adapter.build_command(config)
    assert cmd[cmd.index("--initial_prompt") + 1] == "None"


def test_cli_transcribe_stages_input_with_short_temp_filename(asr_service, monkeypatch, tmp_path):
    long_name = (
        "X 上的 CopyRebeldia Hoy una industria entera dejo de tener sentido "
        "un tio publico en GitHub un repo que convierte cualquier foto en un mundo 3D"
    )
    audio_path = tmp_path / f"{long_name}.mp4"
    audio_path.write_bytes(b"fake-audio")
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake")
    temp_dir = tmp_path / "runtime-temp"

    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 3.0)
    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr("backend.services.asr.service.settings.TEMP_DIR", temp_dir)
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "sample.srt",
    )
    monkeypatch.setattr(asr_service.model_manager, "ensure_model_downloaded", lambda *args, **kwargs: "base")

    captured_configs = []

    def fake_execute(config, *_args, **_kwargs):
        captured_configs.append(config)
        assert config.output_dir.exists()
        assert config.audio_path.exists()
        return []

    monkeypatch.setattr(asr_service.adapter, "execute", fake_execute)

    result = asr_service.transcribe(
        audio_path=str(audio_path),
        model_name="base",
        device="cpu",
        language="en",
        engine="cli",
        task_id="task:with-invalid-chars",
        generate_peaks=False,
    )

    assert result.success is True
    assert len(captured_configs) == 1
    config = captured_configs[0]
    output_dir = config.output_dir
    assert output_dir.parent == temp_dir / "faster-whisper-cli"
    assert config.audio_path.parent == output_dir
    assert config.audio_path.name == "input.mp4"
    assert long_name not in output_dir.name
    assert long_name not in config.audio_path.name
    assert "task_with-invalid-chars" in output_dir.name


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
    assert [Path(path).name for path, _ in chunks] == [
        "chunk_000.wav",
        "chunk_001.wav",
        "chunk_002.wav",
    ]
    assert all("pcm_s16le" in cmd for cmd in calls)
    assert all(any(str(part).startswith("atrim=start=") for part in cmd) for cmd in calls)
    assert "atrim=start=0.000:end=10.000,asetpts=PTS-STARTPTS" in calls[0]
    assert "atrim=start=10.000:end=25.500,asetpts=PTS-STARTPTS" in calls[1]
    assert "atrim=start=25.500,asetpts=PTS-STARTPTS" in calls[2]


def test_smart_split_uses_short_temp_chunk_paths(asr_service, monkeypatch, tmp_path):
    long_name = (
        "X 上的 CopyRebeldia Hoy una industria entera dejo de tener sentido "
        "un tio publico en GitHub un repo que convierte cualquier foto en un mundo 3D"
    )
    audio_path = tmp_path / f"{long_name}.mp4"
    audio_path.write_bytes(b"fake")
    temp_dir = tmp_path / "runtime-temp"
    monkeypatch.setattr("backend.services.asr.core_strategies.settings.TEMP_DIR", temp_dir)
    monkeypatch.setattr(
        "backend.services.asr.core_strategies.AudioProcessor.detect_silence",
        lambda path: [],
    )
    monkeypatch.setattr(
        "backend.services.asr.core_strategies.AudioProcessor.calculate_split_points",
        lambda duration, intervals: [600.0],
    )

    captured_chunk_dir: list[Path] = []

    def fake_split(path, split_points, output_dir):
        captured_chunk_dir.append(output_dir)
        chunk_path = output_dir / "chunk_000.wav"
        chunk_path.write_bytes(b"chunk")
        return [(str(chunk_path), 0.0)]

    class FakeModel:
        def transcribe(self, *_args, **_kwargs):
            return iter([]), None

    monkeypatch.setattr(
        "backend.services.asr.core_strategies.AudioProcessor.split_audio_physically",
        fake_split,
    )

    segments = asr_service.core_strategies.transcribe_smart_split(
        str(audio_path),
        1200.0,
        FakeModel(),
        "en",
        None,
        None,
    )

    assert segments == []
    assert len(captured_chunk_dir) == 1
    chunk_dir = captured_chunk_dir[0]
    assert chunk_dir.parent == temp_dir / "asr-chunks"
    assert long_name not in chunk_dir.name
    assert not chunk_dir.exists()


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


def test_refine_segments_uses_word_timestamps_to_rescue_sentence_tail_after_pause():
    class Word:
        def __init__(self, start, end, word):
            self.start = start
            self.end = end
            self.word = word

    class Segment:
        def __init__(self, start, end, text, words):
            self.start = start
            self.end = end
            self.text = text
            self.words = words

    segments = [
        Segment(
            0.0,
            1.5,
            "This is a grave",
            [
                Word(0.0, 0.2, "This"),
                Word(0.25, 0.35, " is"),
                Word(0.4, 0.55, " a"),
                Word(0.6, 0.9, " grave"),
            ],
        ),
        Segment(
            1.55,
            3.0,
            "mistake. Now continue.",
            [
                Word(1.55, 1.85, " mistake."),
                Word(2.2, 2.45, " Now"),
                Word(2.5, 2.9, " continue."),
            ],
        ),
    ]

    refined = SegmentRefiner.refine_segments(segments)

    assert [segment.text for segment in refined] == [
        "This is a grave mistake.",
        "Now continue.",
    ]
    assert refined[0].end == 1.85
    assert refined[1].start == 2.2


def test_normalize_segments_rebalances_overlong_english_cue():
    segments = [
        SubtitleSegment(
            id="1",
            start=0.0,
            end=6.0,
            text="This is a very long subtitle line, and it keeps going because the speaker does not pause naturally at all.",
        )
    ]

    normalized = SegmentRefiner.normalize_segments(segments)

    assert len(normalized) == 2
    assert normalized[0].text.endswith(",")
    assert normalized[1].text.startswith("and ")
    assert all(count_text_units(seg.text) <= HARD_WORD_LIMIT_ENGLISH for seg in normalized)


def test_normalize_segments_can_preserve_semantic_sentence_units_for_translation():
    segments = [
        SubtitleSegment(
            id="3",
            start=8.0,
            end=10.0,
            text="And so the business version of the contrarian",
        ),
        SubtitleSegment(
            id="4",
            start=10.0,
            end=12.0,
            text="question that I always think is a good one to ask is,",
        ),
    ]

    normalized = SegmentRefiner.normalize_segments(segments, rebalance=False)

    assert len(normalized) == 1
    assert "contrarian question" in normalized[0].text


def test_backend_text_splitter_prefers_safe_cjk_pause_before_amount():
    text = "然后股价下跌，他们一直在等了三四年，等它涨回60美元以后才继续投资其他资产"

    split_index = find_text_split_index(text)

    assert split_index == text.index("，等它涨回") + 1
    assert text[:split_index] == "然后股价下跌，他们一直在等了三四年，"
    assert text[split_index:] == "等它涨回60美元以后才继续投资其他资产"


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
            engine="cli",
            generate_peaks=False,
        )

    assert load_calls["count"] == 0


def test_builtin_cuda_runtime_error_retries_on_cpu(asr_service, monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.mp4"
    audio_path.write_bytes(b"fake-audio")

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 12.0)
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "sample.srt",
    )

    loaded_devices: list[str] = []

    def fake_load_model(_model_name, device, _progress_callback=None):
        loaded_devices.append(device)
        return MagicMock()

    calls = {"count": 0}

    def fake_transcribe_direct(*_args, **_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
        return [
            SubtitleSegment(id="1", start=0.0, end=1.0, text="hello"),
        ]

    monkeypatch.setattr(asr_service.model_manager, "load_model", fake_load_model)
    monkeypatch.setattr(asr_service.model_manager, "clear_loaded_model", MagicMock())
    monkeypatch.setattr(asr_service.core_strategies, "transcribe_direct", fake_transcribe_direct)

    emitted: list[tuple[float, str]] = []
    result = asr_service.transcribe(
        audio_path=str(audio_path),
        model_name="base",
        device="cuda",
        language="en",
        engine="builtin",
        progress_callback=lambda progress, message: emitted.append((progress, message)),
        generate_peaks=False,
    )

    assert result.success is True
    assert loaded_devices == ["cuda", "cpu"]
    assert calls["count"] == 2
    assert any("Retrying transcription on CPU" in message for _progress, message in emitted)
    asr_service.model_manager.clear_loaded_model.assert_called_once()
