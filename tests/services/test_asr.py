import math
import struct
import subprocess
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from backend.services.asr import ASRService
from backend.core.adapters.faster_whisper import FasterWhisperAdapter
from backend.services.asr.cli_prewarm import CliPrewarmManager
from backend.services.asr.core_strategies import CoreStrategies
from backend.services.asr.engine_executor import ASREngineExecutor
from backend.services.asr.model_manager import ModelManager
from backend.utils.subtitle_writer import SubtitleWriter
from backend.utils.audio_processor import AudioProcessor
from backend.utils.segment_refiner import SegmentRefiner
from backend.utils.subtitle_text_splitter import (
    HARD_WORD_LIMIT_ENGLISH,
    count_text_units,
    find_text_split_index,
)
from backend.models.subtitle_contracts import SubtitleSegment
from backend.core.task_control import TaskPauseRequested

@pytest.fixture
def asr_dependencies(monkeypatch):
    def prepare_fake_audio(source_path, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(Path(source_path).read_bytes())
        return output_path

    monkeypatch.setattr(
        AudioProcessor,
        "prepare_for_transcription",
        prepare_fake_audio,
    )
    model_manager = ModelManager()
    adapter = FasterWhisperAdapter()
    core_strategies = CoreStrategies(ThreadPoolExecutor(max_workers=1))
    prewarm = CliPrewarmManager(model_manager=model_manager, adapter=adapter)
    engines = ASREngineExecutor(
        model_manager=model_manager,
        adapter=adapter,
        core_strategies=core_strategies,
    )
    service = ASRService(
        model_manager=model_manager,
        adapter=adapter,
        core_strategies=core_strategies,
        prewarm_manager=prewarm,
        engine_executor=engines,
    )
    return SimpleNamespace(
        service=service,
        model_manager=model_manager,
        adapter=adapter,
        core_strategies=core_strategies,
        prewarm=prewarm,
        engines=engines,
    )


@pytest.fixture
def asr_service(asr_dependencies):
    return asr_dependencies.service

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

def test_asr_service_uses_injected_prewarm_manager(asr_dependencies, monkeypatch):
    start = MagicMock(return_value=True)
    monkeypatch.setattr(asr_dependencies.prewarm, "start", start)

    assert asr_dependencies.service.start_cli_prewarm("base", "cpu") is True
    start.assert_called_once_with(model_name="base", device="cpu")


def test_builtin_direct_strategy_forwards_vad_filter(asr_dependencies):
    model = MagicMock()
    model.transcribe.return_value = (iter([]), None)

    asr_dependencies.core_strategies.transcribe_direct(
        "sample.wav",
        30.0,
        model,
        "en",
        None,
        False,
        None,
    )

    assert model.transcribe.call_args.kwargs["vad_filter"] is False


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
    monkeypatch.setattr("backend.services.asr.cli_prewarm.subprocess.Popen", fake_popen)
    cached_model_path = model_dir / "faster-whisper-base"
    cached_model_path.mkdir(parents=True)
    (cached_model_path / "model.bin").write_bytes(b"ok")
    CliPrewarmManager._completed_profiles.pop(resolved_key, None)
    CliPrewarmManager._threads.pop(resolved_key, None)
    CliPrewarmManager._processes.pop(resolved_key, None)
    CliPrewarmManager._cancelled_profiles.discard(resolved_key)

    assert asr_service.start_cli_prewarm(model_name="base", device="cuda") is True
    deadline = time.time() + 5
    while resolved_key not in CliPrewarmManager._completed_profiles and time.time() < deadline:
        thread = CliPrewarmManager._threads.get(resolved_key)
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


def test_cli_prewarm_does_not_download_missing_model(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake")
    model_dir = tmp_path / "models"
    resolved_key = (str(cli_path.resolve()), "large-v3", "cuda")
    run_mock = MagicMock()
    download_mock = MagicMock()

    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr("backend.services.asr.service.settings.ASR_MODEL_DIR", model_dir)
    monkeypatch.setattr("backend.services.asr.cli_prewarm.subprocess.Popen", run_mock)
    monkeypatch.setattr(asr_dependencies.model_manager, "ensure_model_downloaded", download_mock)
    CliPrewarmManager._completed_profiles.pop(resolved_key, None)
    CliPrewarmManager._threads.pop(resolved_key, None)
    CliPrewarmManager._processes.pop(resolved_key, None)
    CliPrewarmManager._cancelled_profiles.discard(resolved_key)

    assert asr_service.start_cli_prewarm(model_name="large-v3", device="cuda") is True
    deadline = time.time() + 5
    while CliPrewarmManager._threads.get(resolved_key) and time.time() < deadline:
        CliPrewarmManager._threads[resolved_key].join(timeout=0.1)

    download_mock.assert_not_called()
    run_mock.assert_not_called()


def test_cli_transcribe_waits_for_running_prewarm_for_same_profile(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
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

    CliPrewarmManager._completed_profiles.pop(resolved_key, None)
    CliPrewarmManager._threads[resolved_key] = prewarm_thread
    CliPrewarmManager._processes[resolved_key] = prewarm_process
    CliPrewarmManager._cancelled_profiles.discard(resolved_key)

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 3.0)
    monkeypatch.setattr("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path))
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "sample.srt",
    )
    monkeypatch.setattr(asr_dependencies.model_manager, "ensure_model_downloaded", lambda *args, **kwargs: "base")
    monkeypatch.setattr(asr_dependencies.adapter, "execute", lambda *args, **kwargs: [])

    try:
        result = asr_service.transcribe(
            audio_path=str(audio_path),
            model_name="base",
            device="cuda",
            language="en",
            engine="cli",
            vad_filter=False,
        )
    finally:
        CliPrewarmManager._threads.pop(resolved_key, None)
        CliPrewarmManager._processes.pop(resolved_key, None)
        CliPrewarmManager._cancelled_profiles.discard(resolved_key)

    assert result.success is True
    prewarm_process.terminate.assert_not_called()
    prewarm_process.wait.assert_not_called()
    prewarm_thread.join.assert_called_once_with(timeout=CliPrewarmManager.JOIN_TIMEOUT_SECONDS)


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
    monkeypatch.setattr("backend.services.asr.cli_prewarm.subprocess.Popen", fake_popen)
    cached_model_path = model_dir / "faster-whisper-base"
    cached_model_path.mkdir(parents=True)
    (cached_model_path / "model.bin").write_bytes(b"ok")
    CliPrewarmManager._completed_profiles[resolved_key] = (
        time.monotonic() - CliPrewarmManager.FRESH_SECONDS - 1
    )
    CliPrewarmManager._threads.pop(resolved_key, None)
    CliPrewarmManager._processes.pop(resolved_key, None)
    CliPrewarmManager._cancelled_profiles.discard(resolved_key)

    assert asr_service.start_cli_prewarm(model_name="base", device="cuda") is True
    deadline = time.time() + 5
    while len(calls) == 0 and time.time() < deadline:
        thread = CliPrewarmManager._threads.get(resolved_key)
        if thread:
            thread.join(timeout=0.1)
        else:
            time.sleep(0.01)

    assert len(calls) == 1


def test_transcribe_does_not_inject_default_initial_prompt(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
    audio_path = tmp_path / "sample.mp3"
    audio_path.write_bytes(b"fake-audio")
    cli_path = tmp_path / "fw.exe"
    cli_path.write_bytes(b"fake-cli")

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 3.0)
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "sample.srt",
    )

    with patch("backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH", str(cli_path)), \
         patch.object(asr_dependencies.model_manager, "ensure_model_downloaded", return_value="base"), \
         patch.object(
             asr_dependencies.adapter,
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
            vad_filter=False,
        )

    assert result.success is True
    config = mock_execute.call_args.args[0]
    assert config.initial_prompt is None
    assert config.vad_filter is False
    cmd = asr_dependencies.adapter.build_command(config)
    assert cmd[cmd.index("--initial_prompt") + 1] == "None"


def test_cli_transcribe_stages_input_with_short_temp_filename(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
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
    monkeypatch.setattr(asr_dependencies.model_manager, "ensure_model_downloaded", lambda *args, **kwargs: "base")

    captured_configs = []

    def fake_execute(config, *_args, **_kwargs):
        captured_configs.append(config)
        assert config.output_dir.exists()
        assert config.audio_path.exists()
        return []

    monkeypatch.setattr(asr_dependencies.adapter, "execute", fake_execute)

    result = asr_service.transcribe(
        audio_path=str(audio_path),
        model_name="base",
        device="cpu",
        language="en",
        engine="cli",
        task_id="task:with-invalid-chars",
        vad_filter=False,
    )

    assert result.success is True
    assert len(captured_configs) == 1
    config = captured_configs[0]
    output_dir = config.output_dir
    assert output_dir.parent == temp_dir / "asr-work"
    assert config.audio_path.parent == output_dir
    assert config.audio_path.name == "input.wav"
    assert long_name not in output_dir.name
    assert long_name not in config.audio_path.name
    assert "task_with-invalid-chars" in output_dir.name


def test_cli_transcribe_preserves_empty_transcript_without_disabling_vad(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
    audio_path = tmp_path / "silence.wav"
    audio_path.write_bytes(b"fake-audio")
    cli_path = tmp_path / "faster-whisper-xxl.exe"
    cli_path.write_bytes(b"fake-cli")

    monkeypatch.setattr(
        "backend.services.asr.service.AudioProcessor.get_audio_duration",
        lambda path: 3.0,
    )
    monkeypatch.setattr(
        "backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH",
        str(cli_path),
    )
    monkeypatch.setattr(
        "backend.services.asr.service.SubtitleWriter.save_srt",
        lambda segments, path: tmp_path / "silence.srt",
    )
    monkeypatch.setattr(
        asr_dependencies.model_manager,
        "ensure_model_downloaded",
        lambda *args, **kwargs: "base",
    )
    execute = MagicMock(return_value=[])
    monkeypatch.setattr(asr_dependencies.adapter, "execute", execute)

    result = asr_service.transcribe(
        audio_path=str(audio_path),
        model_name="base",
        device="cpu",
        engine="cli",
        vad_filter=True,
    )

    assert result.success is True
    assert result.outputs.transcription is not None
    assert result.outputs.transcription.segments == []
    execute.assert_called_once()


def _write_stereo_tone(path: Path, *, inverted: bool) -> None:
    sample_rate = 16000
    amplitude = 12000
    frames = bytearray()
    for index in range(sample_rate):
        left = int(amplitude * math.sin(2 * math.pi * 440 * index / sample_rate))
        right = -left if inverted else left
        frames.extend(struct.pack("<hh", left, right))
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(frames)


def _read_pcm_rms(path: Path) -> float:
    with wave.open(str(path), "rb") as wav_file:
        samples = struct.iter_unpack("<h", wav_file.readframes(wav_file.getnframes()))
        values = [sample[0] for sample in samples]
    return math.sqrt(sum(value * value for value in values) / len(values))


def test_prepare_for_transcription_recovers_antiphase_stereo(tmp_path):
    source = tmp_path / "antiphase.wav"
    output = tmp_path / "prepared.wav"
    _write_stereo_tone(source, inverted=True)

    prepared = AudioProcessor.prepare_for_transcription(str(source), output)

    assert prepared == output
    assert _read_pcm_rms(output) > 7000
    with wave.open(str(output), "rb") as wav_file:
        assert wav_file.getnchannels() == 1
        assert wav_file.getframerate() == 16000


def test_prepare_for_transcription_keeps_in_phase_stereo_audible(tmp_path):
    source = tmp_path / "in-phase.wav"
    output = tmp_path / "prepared.wav"
    _write_stereo_tone(source, inverted=False)

    AudioProcessor.prepare_for_transcription(str(source), output)

    assert _read_pcm_rms(output) > 7000


def test_stereo_phase_analysis_uses_bounded_windows_for_long_media(
    monkeypatch, tmp_path
):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return MagicMock(stdout="lavfi.aphasemeter.phase=-0.900000\n")

    monkeypatch.setattr(
        "backend.utils.audio_processor.subprocess.run",
        fake_run,
    )

    values = AudioProcessor._measure_stereo_phase(tmp_path / "long.wav", 3600.0)

    assert values == [-0.9, -0.9, -0.9]
    assert len(calls) == 3
    assert [cmd[cmd.index("-t") + 1] for cmd in calls] == [
        "30.000",
        "30.000",
        "30.000",
    ]
    assert "-ss" not in calls[0]
    assert calls[1][calls[1].index("-ss") + 1] == "1785.000"
    assert calls[2][calls[2].index("-ss") + 1] == "3570.000"


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


def test_smart_split_uses_short_temp_chunk_paths(asr_dependencies, monkeypatch, tmp_path):
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

    transcribe_kwargs = []

    class FakeModel:
        def transcribe(self, *_args, **_kwargs):
            transcribe_kwargs.append(_kwargs)
            return iter([]), None

    monkeypatch.setattr(
        "backend.services.asr.core_strategies.AudioProcessor.split_audio_physically",
        fake_split,
    )

    segments = asr_dependencies.core_strategies.transcribe_smart_split(
        str(audio_path),
        1200.0,
        FakeModel(),
        "en",
        None,
        False,
        None,
    )

    assert segments == []
    assert transcribe_kwargs == [
        {
            "beam_size": 5,
            "language": "en",
            "vad_filter": False,
            "initial_prompt": None,
            "word_timestamps": True,
        }
    ]
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
    assert "-ac" not in calls[0]
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


def test_transcribe_does_not_fallback_to_internal_engine_on_pause(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
    audio_path = tmp_path / "sample.mp4"
    audio_path.write_bytes(b"fake-audio")
    cli_path = tmp_path / "fw.exe"
    cli_path.write_bytes(b"fake-cli")

    monkeypatch.setattr("backend.services.asr.service.os.path.exists", lambda path: True)
    monkeypatch.setattr("backend.services.asr.service.AudioProcessor.get_audio_duration", lambda path: 120.0)
    monkeypatch.setattr(
        "backend.services.asr.service.settings.FASTER_WHISPER_CLI_PATH",
        str(cli_path),
    )

    pause_exc = TaskPauseRequested("Task paused by user")
    monkeypatch.setattr(asr_dependencies.adapter, "execute", lambda *args, **kwargs: (_ for _ in ()).throw(pause_exc))

    load_calls = {"count": 0}

    def fake_load_model(*args, **kwargs):
        load_calls["count"] += 1
        return MagicMock()

    monkeypatch.setattr(asr_dependencies.model_manager, "load_model", fake_load_model)
    monkeypatch.setattr(asr_dependencies.model_manager, "ensure_model_downloaded", lambda *args, **kwargs: "base")

    with pytest.raises(TaskPauseRequested, match="Task paused by user"):
        asr_service.transcribe(
            audio_path=str(audio_path),
            model_name="base",
            device="cuda",
            engine="cli",
            vad_filter=False,
        )

    assert load_calls["count"] == 0


def test_builtin_cuda_runtime_error_retries_on_cpu(
    asr_service, asr_dependencies, monkeypatch, tmp_path
):
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

    monkeypatch.setattr(asr_dependencies.model_manager, "load_model", fake_load_model)
    clear_loaded_model = MagicMock()
    monkeypatch.setattr(asr_dependencies.model_manager, "clear_loaded_model", clear_loaded_model)
    monkeypatch.setattr(asr_dependencies.core_strategies, "transcribe_direct", fake_transcribe_direct)

    emitted: list[tuple[float, str, dict]] = []
    result = asr_service.transcribe(
        audio_path=str(audio_path),
        model_name="base",
        device="cuda",
        language="en",
        engine="builtin",
        progress_callback=lambda progress, code, params: emitted.append(
            (progress, code, params)
        ),
        vad_filter=False,
    )

    assert result.success is True
    assert loaded_devices == ["cuda", "cpu"]
    assert calls["count"] == 2
    assert any(code == "asr_cuda_cpu_fallback" for _progress, code, _params in emitted)
    clear_loaded_model.assert_called_once()
