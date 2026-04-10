import pytest
from types import SimpleNamespace
from backend.services.translator.llm_translator import (
    IntelligentTranslationResponse,
    LLMTranslator,
    TranslationOutcome,
    TranslationResponse,
    TranslatorSegment,
)
from backend.models.schemas import SubtitleSegment


class FakeSettingsManager:
    def get_active_llm_provider(self):
        return None


class FakeGlossaryService:
    def get_relevant_terms(self, _text):
        return []


def make_translator() -> LLMTranslator:
    return LLMTranslator(
        settings_manager=FakeSettingsManager(),
        glossary_service=FakeGlossaryService(),
    )


def test_translate_segments_empty():
    """Test translation with empty segments list."""
    llm_translator = make_translator()
    assert llm_translator.translate_segments([], "zh") == []


def test_llm_translator_init():
    """Test LLM translator initialization."""
    from backend.config import settings
    llm_translator = make_translator()
    # This might vary based on ENV, but we check if it handles config
    assert hasattr(llm_translator, "model")
    assert llm_translator.model == settings.LLM_MODEL


def test_translate_segments_fails_immediately_when_batch_translation_cannot_fallback(monkeypatch):
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id=str(i), start=float(i), end=float(i + 1), text=f"line {i}")
        for i in range(25)
    ]

    def fail_batch(*args, **kwargs):
        raise ConnectionError("Network unreachable while contacting LLM provider")

    monkeypatch.setattr(llm_translator, "_translate_batch_struct", fail_batch)

    with pytest.raises(RuntimeError, match="before single-line fallback could complete"):
        llm_translator.translate_segments(segments, "Chinese", batch_size=10)


def test_validate_response_rejects_same_count_but_wrong_ids():
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="Line 14"),
        SubtitleSegment(id="15", start=44.0, end=45.0, text="Line 15"),
    ]
    resp = TranslationResponse(
        segments=[
            TranslatorSegment(id="15", source_text="Line 15", text="第15条"),
            TranslatorSegment(id="16", source_text="Line 16", text="第16条"),
        ]
    )

    is_valid, error_msg, mapped = llm_translator._validate_response(resp, segments)

    assert is_valid is False
    assert mapped == []
    assert "Segment IDs/order did not match the input." in error_msg
    assert "Expected order: ['14', '15']." in error_msg
    assert "Received order: ['15', '16']." in error_msg
    assert "Missing IDs: ['14']." in error_msg
    assert "Extra IDs: ['16']." in error_msg


def test_validate_response_rejects_duplicate_ids():
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="Line 14"),
        SubtitleSegment(id="15", start=44.0, end=45.0, text="Line 15"),
    ]
    resp = TranslationResponse(
        segments=[
            TranslatorSegment(id="14", source_text="Line 14", text="第14条"),
            TranslatorSegment(id="14", source_text="Line 15", text="重复14"),
        ]
    )

    is_valid, error_msg, mapped = llm_translator._validate_response(resp, segments)

    assert is_valid is False
    assert mapped == []
    assert "duplicate IDs" in error_msg


def test_translate_with_correction_falls_back_when_ids_do_not_match(monkeypatch):
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="Line 14"),
        SubtitleSegment(id="15", start=44.0, end=45.0, text="Line 15"),
    ]

    bad_response = TranslationResponse(
        segments=[
            TranslatorSegment(id="15", source_text="Line 15", text="最后一点"),
            TranslatorSegment(id="16", source_text="Line 16", text="价格变化每天都在发生"),
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
        lambda *args, **kwargs: TranslationOutcome(
            segments=fallback_result,
            cacheable=True,
        ),
    )

    result = llm_translator._translate_with_correction(
        client=FakeClient(),
        model_name="test-model",
        system_prompt="test",
        segments=segments,
        input_json_str='[{"id":"14","source_text":"Line 14"},{"id":"15","source_text":"Line 15"}]',
        target_language="Chinese",
        mode_label="Standard",
    )

    assert result.segments == fallback_result
    assert result.cacheable is True


def test_validate_response_rejects_empty_translated_text():
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="14", start=40.0, end=44.0, text="Line 14"),
    ]
    resp = TranslationResponse(
        segments=[
            TranslatorSegment(id="14", source_text="Line 14", text="   "),
        ]
    )

    is_valid, error_msg, mapped = llm_translator._validate_response(resp, segments)

    assert is_valid is False
    assert mapped == []
    assert "must not be empty" in error_msg


def test_validate_response_rejects_source_text_shift():
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="36", start=167.0, end=169.0, text="but, you know, it's a free world,"),
        SubtitleSegment(id="37", start=169.0, end=171.0, text="and everybody can invest in those sort of things,"),
    ]
    resp = TranslationResponse(
        segments=[
            TranslatorSegment(
                id="36",
                source_text="and everybody can invest in those sort of things,",
                text="每个人都可以投资那些类型的东西，",
            ),
            TranslatorSegment(
                id="37",
                source_text="but, you know, it's a free world,",
                text="但你知道，这是一个自由的世界，",
            ),
        ]
    )

    is_valid, error_msg, mapped = llm_translator._validate_response(resp, segments)

    assert is_valid is False
    assert mapped == []
    assert "shifted across segments" in error_msg


def test_translate_with_correction_recovers_broken_tool_call_json():
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(
            id="19",
            start=54.76,
            end=60.50,
            text="And I've never found anyone who said no or hung up the phone when I called.",
        ),
    ]

    broken_arguments = (
        "{\"segments\": [{\"id\": \"19\", \"source_text\": "
        "\"And I've never found anyone who said no or hung up the phone when I called.\", "
        "\"text\": \"而且我从未遇到过任何人在我打电话时说\"不\"或挂断电话。\"}]}"
    )
    completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        SimpleNamespace(
                            function=SimpleNamespace(arguments=broken_arguments),
                        )
                    ],
                )
            )
        ]
    )

    class FakeCompletions:
        def create(self, **kwargs):
            error = RuntimeError("Invalid JSON")
            error.failed_attempts = [
                SimpleNamespace(attempt_number=1, exception=RuntimeError("Invalid JSON"), completion=completion)
            ]
            raise error

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )

    result = llm_translator._translate_with_correction(
        client=client,
        model_name="test-model",
        system_prompt="test",
        segments=segments,
        input_json_str="""[{"id":"19","source_text":"And I've never found anyone who said no or hung up the phone when I called."}]""",
        target_language="Chinese",
        mode_label="Standard",
    )

    assert result.cacheable is True
    assert result.segments[0].text == '而且我从未遇到过任何人在我打电话时说"不"或挂断电话。'


def test_translate_single_fallback_uses_plain_text_completion():
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(
            id="19",
            start=54.76,
            end=60.50,
            text="And I've never found anyone who said no or hung up the phone when I called.",
        ),
    ]

    completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="而且我从未遇到过任何人在我打电话时说“不”或挂断电话。",
                    tool_calls=[],
                )
            )
        ]
    )

    class FakeCompletions:
        def create(self, **kwargs):
            return completion

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )

    result = llm_translator._translate_single_fallback(
        client=client,
        model_name="test-model",
        segments=segments,
        target_language="Chinese",
        mode_label="Standard",
    )

    assert result.cacheable is True
    assert result.segments[0].text == "而且我从未遇到过任何人在我打电话时说“不”或挂断电话。"


def test_translate_batch_struct_skips_cache_when_fallback_keeps_source(monkeypatch):
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="19", start=54.76, end=60.50, text="source line"),
    ]

    monkeypatch.setattr(
        llm_translator,
        "_get_client",
        lambda: (SimpleNamespace(), "test-model"),
    )

    cache_put_calls = []
    monkeypatch.setattr(llm_translator._cache, "get", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        llm_translator._cache,
        "put",
        lambda *args, **kwargs: cache_put_calls.append((args, kwargs)),
    )
    monkeypatch.setattr(
        llm_translator,
        "_translate_with_correction",
        lambda *args, **kwargs: TranslationOutcome(segments=segments, cacheable=False),
    )

    result = llm_translator._translate_batch_struct(
        segments=segments,
        target_language="Chinese",
        mode="standard",
    )

    assert result == segments
    assert cache_put_calls == []


def test_intelligent_mode_recovers_broken_tool_call_json(monkeypatch):
    llm_translator = make_translator()
    segments = [
        SubtitleSegment(id="1", start=0.0, end=2.0, text='He said "no".'),
    ]

    broken_arguments = (
        "{\"segments\": [{\"text\": \"他说\"不\"。\", \"time_percentage\": 1.0}]}"
    )
    completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        SimpleNamespace(
                            function=SimpleNamespace(arguments=broken_arguments),
                        )
                    ],
                )
            )
        ]
    )

    class FakeCompletions:
        def create(self, **kwargs):
            error = RuntimeError("Invalid JSON")
            error.failed_attempts = [
                SimpleNamespace(
                    attempt_number=1,
                    exception=RuntimeError("Invalid JSON"),
                    completion=completion,
                )
            ]
            raise error

    monkeypatch.setattr(
        llm_translator,
        "_get_client",
        lambda: (SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions())), "test-model"),
    )

    result = llm_translator._translate_batch_struct(
        segments=segments,
        target_language="Chinese",
        mode="intelligent",
    )

    assert len(result) == 1
    assert result[0].text == '他说"不"。'
