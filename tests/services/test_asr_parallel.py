import json
import subprocess
import sys
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.config import settings
from backend.core.adapters.faster_whisper import (
    FasterWhisperAdapter,
    FasterWhisperConfig,
)
from backend.core.asr_execution import (
    INFERENCE_LOCK,
    check_control,
    inference_slot,
    serialized_inference,
)
from backend.core.task_control import TaskCancelRequested, TaskPauseRequested
from backend.core.task_runtime import TaskRuntimeContext
from backend.models.subtitle_contracts import SubtitleSegment
from backend.services.asr.cli_prewarm import CliPrewarmManager
from backend.services.asr.core_strategies import CoreStrategies
from backend.services.asr.engine_executor import ASREngineExecutor
from backend.services.asr.service import ASRService
from backend.utils.audio_processor import AudioProcessor
from backend.utils.segment_refiner import SegmentRefiner


def config_for(tmp_path, **kwargs):
    audio = tmp_path / "input.flac"
    audio.touch()
    out = tmp_path / "output"
    out.mkdir(exist_ok=True)
    return FasterWhisperConfig(audio_path=audio, output_dir=out, model_dir=tmp_path, **kwargs)


@pytest.mark.parametrize("duration,device,vad,batch", [
    (901, "cuda", True, 4), (900, "cuda", True, 1),
    (1200, "cpu", True, 2), (1200, "cuda", False, 1),
])
def test_real_service_routes_long_audio_to_batching(tmp_path, monkeypatch, duration, device, vad, batch):
    audio = tmp_path / "source.flac"
    audio.write_bytes(b"test")
    monkeypatch.setattr(settings, "TEMP_DIR", tmp_path / "temp")
    monkeypatch.setattr(AudioProcessor, "get_audio_duration", lambda _: duration)
    monkeypatch.setattr(AudioProcessor, "prepare_for_transcription", lambda _src, out: (out.write_bytes(b"test"), out)[1])
    manager = MagicMock()
    prewarm = MagicMock()
    adapter = MagicMock()
    adapter.execute.return_value = []
    service = ASRService(model_manager=manager, adapter=adapter, prewarm_manager=prewarm)
    result = service.transcribe(audio_path=str(audio), model_name="large-v2", device=device, engine="cli", vad_filter=vad)
    assert result.success
    config = adapter.execute.call_args.args[0]
    assert config.batch_size == batch
    command = FasterWhisperAdapter().build_command(config)
    assert command[command.index("--compute_type") + 1] == ("float16" if device == "cuda" else "int8")
    assert ("--batched" in command) == (batch > 1)
    manager.clear_loaded_model.assert_called_once()


def test_cli_oom_reduces_batch_without_quantizing_or_switching_cpu(tmp_path):
    config = config_for(tmp_path, device="cuda", batch_size=4)
    adapter = MagicMock()
    seen = []

    def execute(active, _callback):
        seen.append(active)
        if active.batch_size > 1:
            active.output_dir.mkdir(exist_ok=True)
            (active.output_dir / "input.srt").write_text("partial output", encoding="utf-8")
            raise RuntimeError("CUDA failed with error out of memory")
        assert not (active.output_dir / "input.srt").exists()
        return []

    adapter.execute.side_effect = execute
    executor = ASREngineExecutor(model_manager=None, adapter=adapter, core_strategies=None)
    assert executor.execute_cli_with_device_fallback(config) == []
    assert [c.batch_size for c in seen] == [4, 2, 1]
    assert all(c.device == "cuda" for c in seen)
    assert len({c.output_dir for c in seen}) == 3
    adapter.execute.side_effect = RuntimeError("CUDA failed with error out of memory")
    with pytest.raises(RuntimeError, match="out of memory"):
        executor.execute_cli_with_device_fallback(config)


def test_builtin_batches_speech_and_preserves_original_timestamps(monkeypatch):
    calls = []

    class Pipeline:
        def __init__(self, model):
            assert model == "one-model"

        def transcribe(self, audio, **kwargs):
            calls.append((audio, kwargs))
            # Engine timestamps already include the silence between speech chunks.
            return iter([
                SimpleNamespace(start=601.0, end=602.0, text="Second sentence.", words=[]),
                SimpleNamespace(start=30.0, end=31.0, text="First sentence.", words=[]),
            ]), None

    monkeypatch.setattr("faster_whisper.BatchedInferencePipeline", Pipeline)
    segments = CoreStrategies().transcribe_smart_split("long.flac", 1200, "one-model", "auto", None, True, None)
    assert calls[0][1]["batch_size"] == 4
    assert calls[0][1]["language"] is None
    assert calls[0][1]["word_timestamps"] is True
    assert [(s.start, s.end) for s in segments] == [(30, 31), (601, 602)]


def test_builtin_retries_oom_raised_during_lazy_iteration(monkeypatch):
    batches = []

    class Pipeline:
        def __init__(self, model):
            pass

        def transcribe(self, _audio, **kwargs):
            batches.append(kwargs["batch_size"])

            def segments():
                yield SimpleNamespace(start=2, end=3, text="First.", words=[])
                if kwargs["batch_size"] > 1:
                    raise RuntimeError("CUDA out of memory")
                yield SimpleNamespace(start=40, end=41, text="Last.", words=[])
            return segments(), None

    monkeypatch.setattr("faster_whisper.BatchedInferencePipeline", Pipeline)
    result = CoreStrategies().transcribe_smart_split("long.flac", 1200, object(), None, None, True, None)
    assert batches == [4, 2, 1]
    assert [s.text for s in result] == ["First.", "Last."]


@pytest.mark.parametrize("stop_type", [TaskPauseRequested, TaskCancelRequested])
def test_cli_stops_silent_process_when_control_requested(tmp_path, stop_type):
    config = config_for(tmp_path)
    processes = []
    adapter = FasterWhisperAdapter()
    original_popen = subprocess.Popen

    def popen(*args, **kwargs):
        process = original_popen(*args, **kwargs)
        processes.append(process)
        return process

    def stop(*_args):
        raise stop_type("stop test")

    from unittest.mock import patch
    started = time.monotonic()
    with patch("backend.core.adapters.faster_whisper.subprocess.Popen", popen):
        with pytest.raises(stop_type):
            adapter._run_subprocess([sys.executable, "-c", "import time; time.sleep(30)"], config, stop)
    assert time.monotonic() - started < 8
    assert processes[0].poll() is not None


def test_cli_json_words_keep_long_chinese_cue_timing(tmp_path):
    config = config_for(tmp_path)
    text = "这是连续的中文语音内容" * 12
    words = [{"start": i * .5, "end": (i + 1) * .5, "word": c} for i, c in enumerate(text)]
    data = {"segments": [{"start": 0, "end": len(text) * .5, "text": text, "words": words}]}
    (config.output_dir / "input.json").write_text(json.dumps(data), encoding="utf-8")
    result = FasterWhisperAdapter()._run_subprocess([sys.executable, "-c", "pass"], config, None)
    assert "".join(s.text for s in result) == text
    assert len(result) > 1
    assert all(s.end - s.start <= 6.5 for s in result)
    assert result[-1].end == len(text) * .5


def test_cli_does_not_pick_unrelated_stale_subtitle(tmp_path):
    config = config_for(tmp_path)
    (config.output_dir / "another.srt").write_text("1\n00:00:00,000 --> 00:00:01,000\nStale\n", encoding="utf-8")
    result = FasterWhisperAdapter()._run_subprocess([sys.executable, "-c", "pass"], config, None)
    assert result == []


def test_repeated_speech_after_silence_is_not_deleted():
    cues = [SubtitleSegment(id="1", start=0, end=1, text="好的。"), SubtitleSegment(id="2", start=10, end=11, text="好的。")]
    result = SegmentRefiner._postprocess_word_segments(cues)
    assert [(s.start, s.end, s.text) for s in result] == [(0, 1, "好的。"), (10, 11, "好的。")]


def test_inference_slot_wait_can_be_cancelled_without_releasing_other_owner():
    assert INFERENCE_LOCK.acquire(timeout=1)
    try:
        def stop(*_args):
            raise TaskCancelRequested("cancel waiting task")
        with pytest.raises(TaskCancelRequested):
            with inference_slot("large-v2", stop):
                pytest.fail("must not enter occupied slot")
        assert INFERENCE_LOCK.locked()
    finally:
        INFERENCE_LOCK.release()


def test_failed_subtitle_write_does_not_report_completion(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.services.asr.service.SubtitleWriter.save_srt", lambda *_: "")
    progress = []
    result = ASRService._build_result([], audio_path=str(tmp_path / "audio.wav"), duration=1, language="en", task_id=None, progress_callback=lambda p, *_: progress.append(p))
    assert not result.success
    assert 100 not in progress


def test_final_subtitles_stay_inside_media_and_in_chronological_order(tmp_path):
    segments = [
        SubtitleSegment(id="2", start=953.41, end=960.26, text="最后一句。"),
        SubtitleSegment(id="1", start=-0.02, end=2, text="开头一句。"),
    ]
    result = ASRService._build_result(
        segments, audio_path=str(tmp_path / "audio.flac"), duration=960,
        language="zh", task_id=None, progress_callback=None,
    )
    assert result.success
    cues = result.outputs.transcription.segments
    assert [(s.start, s.end) for s in cues] == [(0, 2), (953.41, 960)]
    assert [s.text for s in cues] == ["开头一句。", "最后一句。"]
    assert [s.id for s in cues] == ["1", "2"]


def test_control_poll_checks_pause_without_publishing_duplicate_progress():
    manager = MagicMock()
    runtime = TaskRuntimeContext("task", task_manager=manager, loop=MagicMock())
    callback = runtime.build_progress_callback()

    class Worker:
        @serialized_inference
        def transcribe(self, **kwargs):
            manager.reset_mock()
            check_control(kwargs["progress_callback"], (10, "transcription_starting", {}))
            manager.raise_if_control_requested.assert_called_once_with("task")
            manager.submit_threadsafe_update.assert_not_called()
            manager.raise_if_control_requested.side_effect = TaskPauseRequested("paused")
            check_control(kwargs["progress_callback"], (10, "transcription_starting", {}))

    with pytest.raises(TaskPauseRequested):
        Worker().transcribe(progress_callback=callback)
    assert not INFERENCE_LOCK.locked()


def test_prewarm_does_not_allocate_second_model_during_transcription(monkeypatch):
    popen = MagicMock()
    monkeypatch.setattr("backend.services.asr.cli_prewarm.subprocess.Popen", popen)
    manager = MagicMock()
    prewarm = CliPrewarmManager(model_manager=manager, adapter=MagicMock())
    assert INFERENCE_LOCK.acquire(timeout=1)
    try:
        prewarm._run("cli.exe", "large-v2", "cuda")
        popen.assert_not_called()
        manager.clear_loaded_model.assert_not_called()
        assert INFERENCE_LOCK.locked()
    finally:
        INFERENCE_LOCK.release()


def test_builtin_pause_closes_lazy_generator_and_returns_no_partial_result():
    closed = []

    def segments():
        try:
            yield SimpleNamespace(start=0, end=1, text="partial", words=[])
            pytest.fail("must not process the next segment after pause")
        finally:
            closed.append(True)

    def pause(*_args):
        raise TaskPauseRequested("pause")

    with pytest.raises(TaskPauseRequested):
        CoreStrategies._collect(segments(), 1200, pause)
    assert closed == [True]
