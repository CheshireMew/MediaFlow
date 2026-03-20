import pytest
from backend.services.translator.llm_translator import LLMTranslator
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
