import re

from backend.contracts import load_contract
from backend.models.subtitle_contracts import SubtitleSegment


_SPLIT_CONTRACT = load_contract("subtitle-split-contract.json")

MAX_WORD_COUNT_CJK = 25
MAX_WORD_COUNT_ENGLISH = 18
SPLIT_SOFT_CJK = 18
SPLIT_SOFT_ENGLISH = 12
HARD_CHAR_LIMIT_CJK = 28
HARD_WORD_LIMIT_ENGLISH = 18

PREFIX_SPLIT_WORDS = {
    "and", "or", "but", "if", "then", "because", "as", "until", "while",
    "what", "when", "where", "nor", "yet", "so", "for", "however", "moreover",
    "although", "though", "since", "unless", "whether", "after", "before",
    "和", "及", "与", "但", "而", "或", "因", "我", "你", "他", "她", "它",
    "咱", "您", "这", "那", "哪", "如果", "因为", "所以", "虽然", "但是",
}

SUFFIX_SPLIT_WORDS = {
    ".", ",", "!", "?", "。", "，", "！", "？", ";", "；", ":", "：",
    "的", "了", "着", "过", "吗", "呢", "吧", "啊", "呀", "嘛", "啦",
}

EAST_ASIAN_PATTERN = re.compile(r"[\u3040-\u309F\u30A0-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]")
LATIN_WORD_PATTERN = re.compile(r"[A-Za-z0-9\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]+(?:['’-][A-Za-z0-9\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]+)*")
NUMERIC_EXPRESSION_PATTERN = re.compile(
    r"(?:[$￥€£]\s*)?[0-9０-９]+(?:[.,，．][0-9０-９]+)*(?:\s*(?:%|％|美元|美金|人民币|元|块|年期|年|月|日|万|亿|USD|usd|dollars?|K|M|B|k|m|b))?"
)
NUMERIC_CHAR_PATTERN = re.compile(r"[0-9０-９]")
SENTENCE_ENDINGS = set(".?!。？！")
PAUSE_MARKS = set(",;:，；：、")
LEADING_BREAK_PUNCTUATION = SENTENCE_ENDINGS | PAUSE_MARKS
NAME_JOINERS = {"·", "・", "･"}
BAD_START_CJK = {"的", "了", "呢", "吗", "は", "が", "を", "に", "で", "と", "か"}
BAD_END_CJK = {"的", "了", "和", "与", "及", "は", "が", "を", "に", "で", "と"}
BAD_START_WORDS = {
    "a", "an", "and", "as", "at", "because", "but", "by", "for", "from",
    "if", "in", "into", "of", "on", "or", "so", "than", "that", "the",
    "to", "with",
}
BAD_END_WORDS = {
    "a", "an", "and", "as", "at", "because", "but", "for", "from", "if",
    "in", "into", "of", "on", "or", "so", "than", "that", "the", "to",
    "with",
}
ABBREVIATIONS = tuple(_SPLIT_CONTRACT["abbreviations"])
STRICT_MIN_UNITS = _SPLIT_CONTRACT["strict_min_units"]
SOFT_MIN_UNITS = _SPLIT_CONTRACT["soft_min_units"]
REASON_PRIORITY = _SPLIT_CONTRACT["reason_priority"]


def is_mainly_cjk(text: str) -> bool:
    if not text:
        return False
    cjk_count = len(EAST_ASIAN_PATTERN.findall(text))
    return cjk_count > len(text) * 0.3


def _text_profile(text: str) -> str:
    cjk_count = len(EAST_ASIAN_PATTERN.findall(text))
    latin_count = sum(len(word) for word in LATIN_WORD_PATTERN.findall(text))
    if cjk_count == 0 and latin_count > 0:
        return "latin"
    if cjk_count > 0 and latin_count == 0:
        return "cjk"
    if cjk_count > latin_count * 1.5:
        return "cjk"
    if latin_count > cjk_count * 1.5:
        return "latin"
    return "mixed"


def count_text_units(text: str) -> int:
    if not text:
        return 0
    profile = _text_profile(text)
    cjk_units = len(EAST_ASIAN_PATTERN.findall(text))
    latin_units = len(LATIN_WORD_PATTERN.findall(text))
    if profile == "latin" and cjk_units == 0:
        return latin_units
    return cjk_units + latin_units


def max_unit_count(text: str) -> int:
    return HARD_CHAR_LIMIT_CJK if is_mainly_cjk(text) else HARD_WORD_LIMIT_ENGLISH


def join_subtitle_text(left: str, right: str) -> str:
    if not left:
        return right
    if not right:
        return left
    return left + right if is_mainly_cjk(left) else f"{left} {right}"


def _strict_min_units(profile: str) -> int:
    return int(STRICT_MIN_UNITS[profile])


def _soft_min_units(profile: str) -> int:
    return int(SOFT_MIN_UNITS[profile])


def _protected_spans(text: str) -> list[tuple[int, int, bool]]:
    spans: list[tuple[int, int, bool]] = []
    for match in NUMERIC_EXPRESSION_PATTERN.finditer(text):
        spans.append((match.start(), match.end(), True))
    for match in LATIN_WORD_PATTERN.finditer(text):
        if len(match.group(0)) > 1:
            spans.append((match.start(), match.end(), False))
    return sorted(spans)


def _inside_protected_span(index: int, spans: list[tuple[int, int, bool]]) -> bool:
    return any(start < index < end for start, end, _strict_edges in spans)


def _touches_strict_span_edge(index: int, spans: list[tuple[int, int, bool]]) -> bool:
    return any(strict_edges and index in {start, end} for start, end, strict_edges in spans)


def _touches_numeric_whitespace_boundary(text: str, split_at: int) -> bool:
    prev = text[split_at - 1] if split_at > 0 else ""
    next_char = text[split_at] if split_at < len(text) else ""
    if NUMERIC_CHAR_PATTERN.search(prev) and next_char.isspace():
        return True
    if not prev.isspace():
        return False
    index = split_at - 1
    while index >= 0 and text[index].isspace():
        index -= 1
    return index >= 0 and bool(NUMERIC_CHAR_PATTERN.search(text[index]))


def _ends_with_latin_initialism(text: str) -> bool:
    return bool(re.search(r"(?:^|[\s([{\"'“‘])(?:[A-Za-z]\.)+$", text))


def _touches_latin_initialism_boundary(text: str, split_at: int) -> bool:
    previous = text[split_at - 1] if split_at > 0 else ""
    next_char = text[split_at] if split_at < len(text) else ""
    before = text[:split_at]
    if previous == "." and _ends_with_latin_initialism(before):
        return True
    if previous.isspace() and _ends_with_latin_initialism(before.rstrip()):
        return bool(next_char and (next_char.isalpha() or EAST_ASIAN_PATTERN.match(next_char)))
    return False


def _raw_last_latin_word(text: str) -> str:
    match = re.search(r"([A-Za-z]+(?:['’-][A-Za-z]+)*)\W*$", text.strip())
    return match.group(1) if match else ""


def _raw_first_latin_word(text: str) -> str:
    match = re.match(r"([A-Za-z]+(?:['’-][A-Za-z]+)*)", text.strip())
    return match.group(1) if match else ""


def _is_likely_latin_name_part(word: str) -> bool:
    return bool(re.fullmatch(r"[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)*", word))


def _touches_latin_proper_name_boundary(text: str, split_at: int) -> bool:
    previous = text[split_at - 1] if split_at > 0 else ""
    if not previous.isspace():
        return False
    return _is_likely_latin_name_part(_raw_last_latin_word(text[:split_at])) and (
        _is_likely_latin_name_part(_raw_first_latin_word(text[split_at:]))
    )


def _can_break_at(text: str, split_at: int, spans: list[tuple[int, int, bool]]) -> bool:
    if split_at <= 0 or split_at >= len(text):
        return False
    prev = text[split_at - 1]
    next_char = text[split_at]
    if _inside_protected_span(split_at, spans):
        return False
    if _touches_strict_span_edge(split_at, spans):
        return False
    if _touches_numeric_whitespace_boundary(text, split_at):
        return False
    if next_char in LEADING_BREAK_PUNCTUATION:
        return False
    if prev in NAME_JOINERS or next_char in NAME_JOINERS:
        return False
    if _touches_latin_initialism_boundary(text, split_at):
        return False
    if _touches_latin_proper_name_boundary(text, split_at):
        return False
    char_before_boundary = text[split_at - 2] if split_at > 1 else ""
    if (
        prev in {".", ","}
        and NUMERIC_CHAR_PATTERN.search(char_before_boundary)
        and NUMERIC_CHAR_PATTERN.search(next_char)
    ):
        return False
    last_token = text[:split_at].strip().split()
    if last_token and any(last_token[-1].endswith(item) for item in ABBREVIATIONS):
        return False
    if prev in "([" or next_char in ")]}":
        return False
    return True


def _last_word(text: str) -> str:
    matches = list(LATIN_WORD_PATTERN.finditer(text.strip()))
    return matches[-1].group(0).lower() if matches else ""


def _first_word(text: str) -> str:
    match = LATIN_WORD_PATTERN.match(text.strip())
    return match.group(0).lower() if match else ""


def _last_cjk(text: str) -> str:
    matches = EAST_ASIAN_PATTERN.findall(text.strip())
    return matches[-1] if matches else ""


def _first_cjk(text: str) -> str:
    stripped = text.strip()
    match = EAST_ASIAN_PATTERN.match(stripped)
    return match.group(0) if match else ""


def _candidate_score(text: str, split_at: int, reason: str, profile: str) -> float:
    left = text[:split_at].strip()
    right = text[split_at:].strip()
    if not left or not right:
        return float("inf")

    left_units = count_text_units(left)
    right_units = count_text_units(right)
    strict_min = _strict_min_units(profile)
    if left_units < strict_min or right_units < strict_min:
        return float("inf")

    score = abs((split_at / len(text)) - 0.5) * 100
    soft_min = _soft_min_units(profile)
    if left_units < soft_min:
        score += (soft_min - left_units) * 7
    if right_units < soft_min:
        score += (soft_min - right_units) * 7

    if profile != "cjk":
        left_words = len(left.split())
        right_words = len(right.split())
        if left_words < 2 or right_words < 2:
            score += 22

    prev_word = _last_word(left)
    next_word = _first_word(right)
    if prev_word in BAD_END_WORDS:
        score += 18
    if next_word in BAD_START_WORDS:
        score += 24

    prev_cjk = _last_cjk(left)
    next_cjk = _first_cjk(right)
    if prev_cjk in BAD_END_CJK:
        score += 10
    if next_cjk in BAD_START_CJK:
        score += 12
    if reason == "pause" and text[split_at - 1] == "、":
        score += 18
    if prev_cjk == "的":
        score += 12
    if next_cjk == "的":
        score += 12

    return score


def _candidate_indexes(text: str) -> list[tuple[int, str]]:
    candidates: list[tuple[int, str]] = []
    for index in range(1, len(text) - 1):
        if text[index] == "-" and text[index - 1] in {" ", "\n"}:
            candidates.append((index, "dialog"))
    for index, char in enumerate(text[:-1]):
        if char in SENTENCE_ENDINGS:
            candidates.append((index + 1, "sentence"))
        elif char in PAUSE_MARKS:
            candidates.append((index + 1, "pause"))
        elif char.isspace():
            candidates.append((index + 1, "space"))
    return candidates


def _best_candidate(text: str, candidates: list[tuple[int, str]]) -> int | None:
    profile = _text_profile(text)
    spans = _protected_spans(text)
    scored: list[tuple[int, float, int]] = []
    for index, reason in candidates:
        if not _can_break_at(text, index, spans):
            continue
        score = _candidate_score(text, index, reason, profile)
        if score != float("inf"):
            scored.append((REASON_PRIORITY[reason], score, index))
    if not scored:
        return None
    scored.sort()
    return scored[0][2]


def _nearest_safe_midpoint(text: str) -> int | None:
    profile = _text_profile(text)
    spans = _protected_spans(text)
    midpoint = len(text) / 2
    scored: list[tuple[float, float, int]] = []
    for index in range(1, len(text)):
        if not _can_break_at(text, index, spans):
            continue
        score = _candidate_score(text, index, "midpoint", profile)
        if score != float("inf"):
            scored.append((abs(index - midpoint), score, index))
    if not scored:
        return None
    scored.sort()
    return scored[0][2]


def find_text_split_index(text: str) -> int | None:
    if count_text_units(text) <= max_unit_count(text):
        return None

    return get_best_split_index(text)


def get_best_split_index(text: str) -> int | None:
    if len(text) < 2:
        return None
    best = _best_candidate(text, _candidate_indexes(text))
    if best is not None:
        return best
    return _nearest_safe_midpoint(text)


def rebalance_long_subtitle_segment(segment: SubtitleSegment) -> list[SubtitleSegment]:
    text = (segment.text or "").strip()
    if not text:
        return []

    split_index = find_text_split_index(text)
    if split_index is None:
        return [segment]

    left_text = text[:split_index].strip()
    right_text = text[split_index:].strip()
    if not left_text or not right_text:
        return [segment]

    duration = max(segment.end - segment.start, 0.001)
    total_len = max(len(left_text) + len(right_text), 1)
    midpoint = round(segment.start + duration * (len(left_text) / total_len), 3)

    left = SubtitleSegment(id=segment.id, start=segment.start, end=midpoint, text=left_text)
    right = SubtitleSegment(id=segment.id, start=midpoint, end=segment.end, text=right_text)

    result: list[SubtitleSegment] = []
    for part in (left, right):
        result.extend(rebalance_long_subtitle_segment(part))
    return result
