import re
from typing import Optional

_CHINESE_TARGET_LANGUAGE_KEYS = {
    "chinese",
    "zh",
    "zh-cn",
    "zh-hans",
    "zh-hant",
    "zh-tw",
    "zh-hk",
    "中文",
    "汉语",
    "漢語",
}

_CJK_CHAR_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
_EM_DASH_RUN_RE = re.compile(r"\s*[—]{1,}\s*")
_SOURCE_STRONG_BREAK_RE = re.compile(r"(?:—|--|---|…|\.\.\.)")
_FULLWIDTH_PUNCT_WITH_OPTIONAL_LEFT_SPACE_RE = re.compile(r"\s+([，。！？；：、）】」》])")
_FULLWIDTH_PUNCT_WITH_OPTIONAL_RIGHT_SPACE_RE = re.compile(r"([（【「《])\s+")


def normalize_text_for_target_language(
    text: str,
    *,
    target_language: Optional[str],
    source_text: Optional[str] = None,
) -> str:
    normalized = text.strip()
    if not normalized:
        return normalized

    if not _should_normalize_as_chinese(normalized, target_language):
        return normalized

    normalized = _normalize_chinese_em_dash(normalized, source_text)
    normalized = _FULLWIDTH_PUNCT_WITH_OPTIONAL_LEFT_SPACE_RE.sub(r"\1", normalized)
    normalized = _FULLWIDTH_PUNCT_WITH_OPTIONAL_RIGHT_SPACE_RE.sub(r"\1", normalized)
    return normalized.strip()


def _should_normalize_as_chinese(text: str, target_language: Optional[str]) -> bool:
    language_key = (target_language or "").strip().lower()
    return language_key in _CHINESE_TARGET_LANGUAGE_KEYS or bool(_CJK_CHAR_RE.search(text))


def _normalize_chinese_em_dash(text: str, source_text: Optional[str]) -> str:
    if source_text and _SOURCE_STRONG_BREAK_RE.search(source_text):
        return text

    result_parts: list[str] = []
    last_index = 0

    for match in _EM_DASH_RUN_RE.finditer(text):
        start, end = match.span()
        result_parts.append(text[last_index:start])
        result_parts.append(_replacement_for_em_dash_run(text, start, end))
        last_index = end

    result_parts.append(text[last_index:])
    return "".join(result_parts)


def _replacement_for_em_dash_run(text: str, start: int, end: int) -> str:
    previous_char = text[start - 1] if start > 0 else ""
    next_char = text[end] if end < len(text) else ""

    if not previous_char or not next_char:
        return ""

    if previous_char in "，。！？；：、,.;:!?":
        return ""

    if next_char in "，。！？；：、,.;:!?":
        return ""

    return "，"
