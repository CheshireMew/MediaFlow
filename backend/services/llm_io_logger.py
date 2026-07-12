import json
from collections import Counter
from typing import Any

from loguru import logger

from backend.config import settings


_KNOWN_ROLES = {"system", "developer", "user", "assistant", "tool"}
_COLLECTION_FIELDS = ("segments", "candidates", "choices", "items")


def log_llm_messages(label: str, messages: list[dict[str, str]]) -> None:
    role_counts: Counter[str] = Counter()
    content_chars = 0
    for message in messages:
        role = message.get("role")
        role_counts[role if role in _KNOWN_ROLES else "other"] += 1
        content = message.get("content")
        if isinstance(content, str):
            content_chars += len(content)

    logger.info(
        "[LLM IO] {} request summary: messages={}, roles={}, content_chars={}",
        label,
        len(messages),
        dict(sorted(role_counts.items())),
        content_chars,
    )
    if settings.ENABLE_DETAILED_LLM_LOGGING:
        try:
            logger.info(
                "[LLM IO] {} request payload:\n{}",
                label,
                json.dumps(messages, ensure_ascii=False, indent=2),
            )
        except Exception as exc:
            logger.warning(
                "[LLM IO] Failed to serialize {} request payload: {}",
                label,
                exc,
            )


def log_llm_response(label: str, response: Any) -> None:
    logger.info(
        "[LLM IO] {} response summary: {}",
        label,
        _response_summary(response),
    )
    if settings.ENABLE_DETAILED_LLM_LOGGING:
        try:
            logger.info(
                "[LLM IO] {} response payload:\n{}",
                label,
                _serialize_response(response),
            )
        except Exception as exc:
            logger.warning(
                "[LLM IO] Failed to serialize {} response payload: {}",
                label,
                exc,
            )


def _response_summary(response: Any) -> str:
    response_type = type(response).__name__
    details: list[str] = [f"type={response_type}"]
    if isinstance(response, str):
        details.append(f"content_chars={len(response)}")
    elif isinstance(response, dict):
        details.append(f"fields={len(response)}")
    elif isinstance(response, (list, tuple)):
        details.append(f"items={len(response)}")

    collection_counts = []
    for field_name in _COLLECTION_FIELDS:
        value = (
            response.get(field_name)
            if isinstance(response, dict)
            else getattr(response, field_name, None)
        )
        if isinstance(value, (list, tuple)):
            collection_counts.append(f"{field_name}={len(value)}")
    if collection_counts:
        details.append("collections=" + ",".join(collection_counts))
    return ", ".join(details)


def _serialize_response(response: Any) -> str:
    if hasattr(response, "model_dump_json"):
        return response.model_dump_json(indent=2)
    if hasattr(response, "model_dump"):
        return json.dumps(response.model_dump(), ensure_ascii=False, indent=2)
    if hasattr(response, "to_json"):
        return response.to_json()
    if hasattr(response, "to_dict"):
        return json.dumps(response.to_dict(), ensure_ascii=False, indent=2)
    return json.dumps(response, ensure_ascii=False, indent=2, default=str)
