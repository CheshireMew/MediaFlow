from __future__ import annotations

import unicodedata
import re


_SUSPICIOUS_MARKERS = (
    "Ã",
    "Â",
    "â",
    "ð",
    "�",
    "鈥",
    "銆",
    "锟",
    "馃",
    "聽",
    "¡°",
    "¡±",
    "¡¯",
    "€™",
    "œ",
)

_WESTERN_REDECODE_ENCODINGS = ("cp1252", "latin1")
_CJK_REDECODE_ENCODINGS = ("gbk", "cp936")


def _suspicious_count(text: str) -> int:
    return sum(text.count(marker) for marker in _SUSPICIOUS_MARKERS)


def _quality_score(text: str) -> int:
    suspicious = _suspicious_count(text) * 10
    replacement = text.count("\ufffd") * 20
    question_marks = text.count("?") * 2
    control = 0
    printable = 0

    for ch in text:
        category = unicodedata.category(ch)
        if category.startswith("C") and ch not in {"\n", "\r", "\t"}:
            control += 5
        else:
            printable += 1

    return printable - suspicious - replacement - question_marks - control


def _try_redecode(text: str, encoding: str) -> str | None:
    try:
        return text.encode(encoding).decode("utf-8")
    except Exception:
        return None


def _try_redecode_lenient(text: str, encoding: str) -> str | None:
    try:
        return text.encode(encoding, errors="replace").decode("utf-8", errors="replace")
    except Exception:
        return None


def _try_redecode_ignore(text: str, encoding: str) -> str | None:
    try:
        return text.encode(encoding, errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return None


def repair_mojibake_text(text: str) -> str:
    if not text:
        return text

    if any(marker in text for marker in ("鈥", "銆", "锟", "馃")):
        encodings = _CJK_REDECODE_ENCODINGS + _WESTERN_REDECODE_ENCODINGS
    else:
        encodings = _WESTERN_REDECODE_ENCODINGS + _CJK_REDECODE_ENCODINGS

    best = text
    best_score = _quality_score(text)
    original_suspicious = _suspicious_count(text)

    for encoding in encodings:
        candidate = _try_redecode(text, encoding)
        if not candidate or candidate == text:
            continue
        candidate_score = _quality_score(candidate)
        candidate_suspicious = _suspicious_count(candidate)
        if candidate_suspicious < original_suspicious and candidate_score > best_score:
            best = candidate
            best_score = candidate_score

    if best != text:
        return best

    for encoding in encodings:
        for candidate in (
            _try_redecode_ignore(text, encoding),
            _try_redecode_lenient(text, encoding),
        ):
            if not candidate or candidate == text:
                continue
            candidate_score = _quality_score(candidate)
            candidate_suspicious = _suspicious_count(candidate)
            if candidate_suspicious < original_suspicious and candidate_score > best_score:
                best = candidate
                best_score = candidate_score

    return best


def normalize_external_text(text: str | None) -> str | None:
    if text is None:
        return None
    return repair_mojibake_text(text)


def normalize_filename_component(text: str | None, fallback: str = "download") -> str:
    normalized = normalize_external_text(text) or ""
    normalized = unicodedata.normalize("NFKC", normalized)
    normalized = "".join(
        ch
        for ch in normalized
        if unicodedata.category(ch) != "Cs"
        and not (unicodedata.category(ch).startswith("C") and ch not in {" ", "\t"})
        and ch != "\ufffd"
    )
    normalized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip().rstrip(". ")
    return normalized or fallback
