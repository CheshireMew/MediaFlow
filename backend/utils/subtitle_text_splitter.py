from backend.models.schemas import SubtitleSegment

MAX_WORD_COUNT_CJK = 25
MAX_WORD_COUNT_ENGLISH = 18
SPLIT_SOFT_CJK = 18
SPLIT_SOFT_ENGLISH = 12
HARD_CHAR_LIMIT_CJK = 28
HARD_WORD_LIMIT_ENGLISH = 18
MIN_SPLIT_UNIT_CJK = 8
MIN_SPLIT_UNIT_ENGLISH = 4

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


def is_mainly_cjk(text: str) -> bool:
    if not text:
        return False
    cjk_count = sum(
        1
        for char in text
        if "\u4e00" <= char <= "\u9fff"
        or "\u3040" <= char <= "\u30ff"
        or "\uac00" <= char <= "\ud7af"
    )
    return cjk_count > len(text) * 0.3


def count_text_units(text: str) -> int:
    if not text:
        return 0
    if is_mainly_cjk(text):
        return len([char for char in text if not char.isspace()])
    return len(text.split())


def max_unit_count(text: str) -> int:
    return HARD_CHAR_LIMIT_CJK if is_mainly_cjk(text) else HARD_WORD_LIMIT_ENGLISH


def min_split_unit(text: str) -> int:
    return MIN_SPLIT_UNIT_CJK if is_mainly_cjk(text) else MIN_SPLIT_UNIT_ENGLISH


def join_subtitle_text(left: str, right: str) -> str:
    if not left:
        return right
    if not right:
        return left
    return left + right if is_mainly_cjk(left) else f"{left} {right}"


def candidate_split_score(text: str, split_at: int) -> int:
    left = text[:split_at].strip()
    right = text[split_at:].strip()
    if not left or not right:
        return -10**9

    left_units = count_text_units(left)
    right_units = count_text_units(right)
    if left_units < min_split_unit(text) or right_units < min_split_unit(text):
        return -10**8

    score = -abs(left_units - right_units)
    prev_char = text[split_at - 1] if split_at > 0 else ""
    next_word = right.split(maxsplit=1)[0].strip(" ,.!?;:，。！？；：\"'()[]{}").lower()

    if prev_char in "。！？.!?":
        score += 12
    elif prev_char in "，；：,;:":
        score += 8
    elif prev_char.isspace():
        score += 2

    if next_word in PREFIX_SPLIT_WORDS:
        score += 5

    return score


def find_text_split_index(text: str) -> int | None:
    if count_text_units(text) <= max_unit_count(text):
        return None

    candidate_indexes = []
    for index, char in enumerate(text):
        if char in "。！？.!?，；：,;:" or char.isspace():
            candidate_indexes.append(index + 1)

    if not candidate_indexes:
        midpoint = len(text) // 2
        return midpoint if 0 < midpoint < len(text) else None

    best_index = None
    best_score = -10**9
    for candidate in candidate_indexes:
        score = candidate_split_score(text, candidate)
        if score > best_score:
            best_score = score
            best_index = candidate

    if best_score <= -10**8:
        midpoint = len(text) // 2
        return midpoint if 0 < midpoint < len(text) else None
    return best_index


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
