import pytest
from backend.services.translator.llm_translator import (
    LLMTranslator,
    TranslationResponse,
    TranslatorSegment,
)
from backend.models.schemas import SubtitleSegment

def test_translate_segments_empty():
    """Test translation with empty segments list."""
    llm_translator = LLMTranslator()
    assert llm_translator.translate_segments([], "zh") == []

def test_llm_translator_init():
    """Test LLM translator initialization."""
    from backend.config import settings
    llm_translator = LLMTranslator()
    # This might vary based on ENV, but we check if it handles config
    assert hasattr(llm_translator, "model")
    assert llm_translator.model == settings.LLM_MODEL


def test_translate_segments_fails_after_consecutive_batch_errors(monkeypatch):
    llm_translator = LLMTranslator()
    segments = [
        SubtitleSegment(id=str(i), start=float(i), end=float(i + 1), text=f"line {i}")
        for i in range(25)
    ]

    def fail_batch(*args, **kwargs):
        raise ConnectionError("Network unreachable while contacting LLM provider")

    monkeypatch.setattr(llm_translator, "_translate_batch_struct", fail_batch)

    with pytest.raises(RuntimeError, match="consecutive LLM batch errors"):
        llm_translator.translate_segments(segments, "Chinese", batch_size=10)


def test_validate_response_rejects_same_count_but_wrong_ids():
    llm_translator = LLMTranslator()
    segments = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="Line 14"),
        SubtitleSegment(id="15", start=44.0, end=45.0, text="Line 15"),
    ]
    resp = TranslationResponse(
        segments=[
            TranslatorSegment(id="15", text="第15条"),
            TranslatorSegment(id="16", text="第16条"),
        ]
    )

    is_valid, error_msg, mapped = llm_translator._validate_response(resp, segments)

    assert is_valid is False
    assert mapped == []
    assert "Segment IDs/order did not match the input." in error_msg
    assert "Missing IDs: ['14']." in error_msg
    assert "Extra IDs: ['16']." in error_msg


def test_translate_with_correction_falls_back_when_ids_do_not_match(monkeypatch):
    llm_translator = LLMTranslator()
    segments = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="Line 14"),
        SubtitleSegment(id="15", start=44.0, end=45.0, text="Line 15"),
    ]

    bad_response = TranslationResponse(
        segments=[
            TranslatorSegment(id="15", text="最后一点"),
            TranslatorSegment(id="16", text="价格变化每天都在发生"),
        ]
    )

    class FakeCompletions:
        def __init__(self):
            self.calls = 0

        def create(self, **kwargs):
            self.calls += 1
            return bad_response

    class FakeClient:
        def __init__(self):
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

    fallback_result = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="正确14"),
        SubtitleSegment(id="15", start=44.0, end=45.0, text="正确15"),
    ]

    monkeypatch.setattr(
        llm_translator,
        "_translate_single_fallback",
        lambda *args, **kwargs: fallback_result,
    )

    result = llm_translator._translate_with_correction(
        client=FakeClient(),
        model_name="test-model",
        system_prompt="test",
        segments=segments,
        input_json_str='{"14":"Line 14","15":"Line 15"}',
        target_language="Chinese",
        mode_label="Standard",
    )

    assert result == fallback_result
