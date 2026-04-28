from typing import Any, Dict, List, Optional, Type

from json_repair import repair_json
from loguru import logger
from pydantic import BaseModel


class TranslationResponseParser:
    @staticmethod
    def strip_code_fence(payload: str) -> str:
        stripped = payload.strip()
        if stripped.startswith("```") and stripped.endswith("```"):
            lines = stripped.splitlines()
            if len(lines) >= 2:
                return "\n".join(lines[1:-1]).strip()
        return stripped

    @staticmethod
    def iter_completion_payloads(completion: Any) -> List[str]:
        payloads: List[str] = []
        choices = getattr(completion, "choices", None) or []
        for choice in choices:
            message = getattr(choice, "message", None)
            if message is None:
                continue

            tool_calls = getattr(message, "tool_calls", None) or []
            for tool_call in tool_calls:
                function = getattr(tool_call, "function", None)
                arguments = getattr(function, "arguments", None)
                if isinstance(arguments, str) and arguments.strip():
                    payloads.append(arguments)

            content = getattr(message, "content", None)
            if isinstance(content, str) and content.strip():
                payloads.append(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        text = part.get("text")
                    else:
                        text = getattr(part, "text", None)
                    if isinstance(text, str) and text.strip():
                        payloads.append(text)
        return payloads

    def parse_structured_response_payload(
        self,
        payload: str,
        response_model: Type[BaseModel],
        mode_label: str,
    ) -> Optional[BaseModel]:
        normalized = self.strip_code_fence(payload)
        if not normalized:
            return None

        try:
            return response_model.model_validate_json(normalized)
        except Exception as parse_error:
            try:
                repaired = repair_json(normalized, return_objects=True)
                return response_model.model_validate(repaired)
            except Exception as repair_error:
                logger.debug(
                    f"[LLM] {mode_label}: failed to recover structured payload. "
                    f"parse_error={parse_error}; repair_error={repair_error}"
                )
                return None

    def recover_structured_response_from_exception(
        self,
        error: Exception,
        response_model: Type[BaseModel],
        mode_label: str,
    ) -> Optional[BaseModel]:
        failed_attempts = getattr(error, "failed_attempts", None) or []
        for attempt in reversed(failed_attempts):
            for payload in self.iter_completion_payloads(attempt.completion):
                recovered = self.parse_structured_response_payload(
                    payload,
                    response_model,
                    mode_label,
                )
                if recovered:
                    logger.warning(
                        f"[LLM] {mode_label}: recovered structured response from failed completion payload"
                    )
                    return recovered
        return None

    def request_raw_structured_response(
        self,
        client,
        model_name: str,
        messages: List[Dict[str, str]],
        response_model: Type[BaseModel],
        mode_label: str,
    ) -> Optional[BaseModel]:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.3,
            )
        except Exception as error:
            recovered = self.recover_structured_response_from_exception(
                error,
                response_model,
                f"{mode_label} raw retry",
            )
            if recovered:
                return recovered
            logger.warning(
                f"[LLM] {mode_label}: raw retry failed before recovery: {error}"
            )
            return None

        for payload in self.iter_completion_payloads(completion):
            recovered = self.parse_structured_response_payload(
                payload,
                response_model,
                f"{mode_label} raw retry",
            )
            if recovered:
                logger.warning(
                    f"[LLM] {mode_label}: recovered structured response from raw retry payload"
                )
                return recovered
        return None

    def extract_plain_text_from_payload(self, payload: str) -> Optional[str]:
        normalized = self.strip_code_fence(payload)
        if not normalized:
            return None

        try:
            parsed = repair_json(normalized, return_objects=True)
        except Exception:
            parsed = None

        if isinstance(parsed, dict):
            text = parsed.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

            segments = parsed.get("segments")
            if (
                isinstance(segments, list)
                and len(segments) == 1
                and isinstance(segments[0], dict)
            ):
                segment_text = segments[0].get("text")
                if isinstance(segment_text, str) and segment_text.strip():
                    return segment_text.strip()

        if isinstance(parsed, list) and len(parsed) == 1:
            only_item = parsed[0]
            if isinstance(only_item, str) and only_item.strip():
                return only_item.strip()
            if isinstance(only_item, dict):
                segment_text = only_item.get("text")
                if isinstance(segment_text, str) and segment_text.strip():
                    return segment_text.strip()

        if isinstance(parsed, str) and parsed.strip():
            return parsed.strip()

        return normalized.strip() or None

    def extract_plain_text_from_completion(self, completion: Any) -> Optional[str]:
        for payload in self.iter_completion_payloads(completion):
            extracted = self.extract_plain_text_from_payload(payload)
            if extracted:
                return extracted
        return None
