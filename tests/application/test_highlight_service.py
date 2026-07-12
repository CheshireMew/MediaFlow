import pytest

from backend.application import highlight_service
from backend.application.highlight_service import (
    LlmHighlightCandidate,
    LlmHighlightResponse,
    detect_highlights,
)
from backend.models.schemas import SubtitleSegment
from backend.services.video.media_prober import MediaProber


class _FakeCompletions:
    def create(self, **kwargs):
        assert kwargs["response_model"] is LlmHighlightResponse
        assert "subtitle_windows" in kwargs["messages"][1]["content"]
        assert "start_cue_id" in kwargs["messages"][1]["content"]
        return LlmHighlightResponse(
            candidates=[
                LlmHighlightCandidate(
                    start_cue_id="cue-2",
                    end_cue_id="cue-3",
                    title="核心反转",
                    reason="这里给出完整问题和意外结果，适合单独切片。",
                    score=91.5,
                    transcript="但是最重要的问题来了 结果真的没想到！",
                )
            ]
        )


class _FakeChat:
    completions = _FakeCompletions()


class _FakeClient:
    chat = _FakeChat()


class _FakeClientFactory:
    def __init__(self, _settings_manager):
        pass

    def get_client(self):
        return _FakeClient(), "test-model"


def test_detect_highlights_uses_llm_provider(monkeypatch):
    monkeypatch.setattr(MediaProber, "get_duration", lambda _path: 180.0)
    monkeypatch.setattr(highlight_service, "TranslationClientFactory", _FakeClientFactory)

    candidates, source, duration = detect_highlights(
        settings_manager=object(),
        video_path="demo.mp4",
        subtitle_segments=[
            SubtitleSegment(id="1", start=5.0, end=12.0, text="普通开场"),
            SubtitleSegment(id="2", start=12.2, end=20.0, text="但是最重要的问题来了"),
            SubtitleSegment(id="3", start=20.3, end=30.0, text="结果真的没想到！"),
        ],
        max_candidates=2,
        min_duration=25.0,
        max_duration=40.0,
    )

    assert source == "llm"
    assert duration == 180.0
    assert len(candidates) == 1
    assert candidates[0].start == 12.2
    assert candidates[0].end == 30.0
    assert candidates[0].title == "核心反转"
    assert candidates[0].score == 91.5
    assert candidates[0].selected is True


def test_detect_highlights_requires_subtitles(monkeypatch):
    monkeypatch.setattr(MediaProber, "get_duration", lambda _path: 240.0)

    with pytest.raises(ValueError, match="requires subtitles"):
        detect_highlights(
            settings_manager=object(),
            video_path="demo.mp4",
            subtitle_segments=[],
            max_candidates=3,
            min_duration=10.0,
            max_duration=45.0,
        )
