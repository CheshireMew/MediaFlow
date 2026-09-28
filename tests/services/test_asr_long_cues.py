import json
import sys
from types import SimpleNamespace

import pytest

from backend.core.adapters.faster_whisper import (
    FasterWhisperAdapter,
    FasterWhisperConfig,
)
from backend.services.asr.service import ASRService
from backend.utils.segment_refiner import SegmentRefiner


@pytest.mark.parametrize("output_format", ["json", "srt"])
def test_cli_paragraph_without_word_times_is_bounded_in_final_result(tmp_path, output_format):
    audio = tmp_path / "input.flac"
    audio.touch()
    text = "这些问题都非常难回答所以我们需要每天花时间去思考和实践" * 35
    if output_format == "json":
        (tmp_path / "input.json").write_text(json.dumps({"segments": [
            {"start": 100, "end": 260, "text": text},
        ]}), encoding="utf-8")
    else:
        (tmp_path / "input.srt").write_text(
            f"1\n00:01:40,000 --> 00:04:20,000\n{text}\n", encoding="utf-8",
        )
    config = FasterWhisperConfig(audio_path=audio, output_dir=tmp_path, model_dir=tmp_path)
    segments = FasterWhisperAdapter()._run_subprocess([sys.executable, "-c", "pass"], config, None)
    result = ASRService._build_result(
        segments, audio_path=str(tmp_path / "result.flac"), duration=300,
        language="zh", task_id=None, progress_callback=None,
    )
    assert result.success
    cues = result.outputs.transcription.segments
    assert "".join(s.text for s in cues) == text
    assert max(len(s.text) for s in cues) <= 80
    assert max(s.end - s.start for s in cues) < 20
    assert (cues[0].start, cues[-1].end) == (100, 260)
    assert all(a.end <= b.start for a, b in zip(cues, cues[1:]))


def test_missing_word_times_in_middle_do_not_create_an_indivisible_paragraph():
    paragraph = "我们需要认真思考这个问题然后反复实践才能做好" * 40
    segments = [
        SimpleNamespace(start=0, end=1, text="开头。", words=[SimpleNamespace(start=0, end=1, word="开头。")]),
        SimpleNamespace(start=2, end=162, text=paragraph, words=[]),
        SimpleNamespace(start=163, end=164, text="结尾。", words=[SimpleNamespace(start=163, end=164, word="结尾。")]),
    ]
    result = SegmentRefiner.refine_segments(segments)
    assert "".join(s.text for s in result) == "开头。" + paragraph + "结尾。"
    assert max(len(s.text) for s in result) <= 80
    assert (result[0].start, result[0].end) == (0, 1)
    assert (result[-1].start, result[-1].end) == (163, 164)


def test_missing_english_alignment_keeps_the_space_after_a_real_word():
    segments = [
        SimpleNamespace(start=0, end=1, text="Hello", words=[SimpleNamespace(start=0, end=1, word="Hello")]),
        SimpleNamespace(start=1, end=2, text="world.", words=[]),
    ]
    result = SegmentRefiner.refine_segments(segments)
    assert result[0].text == "Hello world."
