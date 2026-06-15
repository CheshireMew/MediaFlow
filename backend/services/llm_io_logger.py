import json
from typing import Any

from loguru import logger


def log_llm_messages(label: str, messages: list[dict[str, str]]) -> None:
    try:
        logger.debug(
            f"[LLM IO] {label} request messages:\n"
            f"{json.dumps(messages, ensure_ascii=False, indent=2)}"
        )
    except Exception as exc:
        logger.warning(f"[LLM IO] Failed to serialize {label} request messages: {exc}")


def log_llm_response(label: str, response: Any) -> None:
    try:
        logger.debug(
            f"[LLM IO] {label} response payload:\n"
            f"{_serialize_response(response)}"
        )
    except Exception as exc:
        logger.warning(f"[LLM IO] Failed to serialize {label} response payload: {exc}")


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
