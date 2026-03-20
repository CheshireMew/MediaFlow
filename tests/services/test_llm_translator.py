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
