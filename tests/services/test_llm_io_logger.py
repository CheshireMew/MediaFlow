from dataclasses import dataclass

import pytest
from loguru import logger

from backend.services import llm_io_logger


@pytest.fixture
def captured_log_messages():
    messages: list[str] = []
    sink_id = logger.add(messages.append, level="INFO", format="{message}")
    try:
        yield messages
    finally:
        logger.remove(sink_id)


@dataclass
class FakeResponse:
    segments: list[dict[str, str]]
    secret: str

    def model_dump(self):
        return {"segments": self.segments, "secret": self.secret}


def test_llm_logs_only_diagnostic_summaries_by_default(
    monkeypatch,
    captured_log_messages,
):
    monkeypatch.setattr(
        llm_io_logger.settings,
        "ENABLE_DETAILED_LLM_LOGGING",
        False,
    )
    secret = "private subtitle text that must not be logged"
    messages = [
        {"role": "system", "content": "Translate subtitles."},
        {"role": "user", "content": secret},
    ]
    response = FakeResponse(segments=[{"text": secret}], secret=secret)

    llm_io_logger.log_llm_messages("translation", messages)
    llm_io_logger.log_llm_response("translation", response)

    output = "\n".join(captured_log_messages)
    assert secret not in output
    assert "request summary: messages=2" in output
    assert "'system': 1" in output
    assert "'user': 1" in output
    assert f"content_chars={len('Translate subtitles.') + len(secret)}" in output
    assert "response summary: type=FakeResponse" in output
    assert "collections=segments=1" in output


def test_llm_payload_logging_requires_explicit_detailed_mode(
    monkeypatch,
    captured_log_messages,
):
    monkeypatch.setattr(
        llm_io_logger.settings,
        "ENABLE_DETAILED_LLM_LOGGING",
        True,
    )
    secret = "explicit diagnostic payload"

    llm_io_logger.log_llm_messages(
        "translation",
        [{"role": "user", "content": secret}],
    )
    llm_io_logger.log_llm_response(
        "translation",
        FakeResponse(segments=[], secret=secret),
    )

    output = "\n".join(captured_log_messages)
    assert "request payload:" in output
    assert "response payload:" in output
    assert secret in output
