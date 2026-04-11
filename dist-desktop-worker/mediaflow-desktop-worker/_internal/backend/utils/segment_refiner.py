"""
Segment Refiner — Whisper output optimization and fragment merging.

Extracted from SubtitleManager to follow Single Responsibility Principle.
"""
from typing import List
from loguru import logger
from backend.models.schemas import SubtitleSegment


class SegmentRefiner:
    # ==================== 分割配置常量 (参考 VideoCaptioner) ====================
    MAX_WORD_COUNT_CJK = 25      # CJK文本单行最大字数
    MAX_WORD_COUNT_ENGLISH = 18  # 英文文本单行最大单词数
    MIN_WORD_COUNT = 5           # 最小字数阈值（才考虑分割）
    # 分割软阈值（到达此字数后开始寻找标点/连接词分割点）
    SPLIT_SOFT_CJK = 18        # CJK: 从18字开始找分割点
    SPLIT_SOFT_ENGLISH = 12    # EN: 从12词开始找分割点
    SPLIT_SCAN_WINDOW = 8      # 向后最多扫描N个词寻找分割点
    
    # 前缀分割词（在这些词前面分割）
    PREFIX_SPLIT_WORDS = {
        # 英文连接词
        "and", "or", "but", "if", "then", "because", "as", "until", "while",
        "what", "when", "where", "nor", "yet", "so", "for", "however", "moreover",
        "although", "though", "since", "unless", "whether", "after", "before",
        # 中文
        "和", "及", "与", "但", "而", "或", "因", "我", "你", "他", "她", "它",
        "咱", "您", "这", "那", "哪", "如果", "因为", "所以", "虽然", "但是",
    }
    
    # 后缀分割词（在这些词后面分割）
    SUFFIX_SPLIT_WORDS = {
        # 标点符号
        ".", ",", "!", "?", "。", "，", "！", "？", ";", "；", ":", "：",
        # 中文语气词
        "的", "了", "着", "过", "吗", "呢", "吧", "啊", "呀", "嘛", "啦",
    }
    HARD_CHAR_LIMIT_CJK = 28
    HARD_WORD_LIMIT_ENGLISH = 18
    MIN_SPLIT_UNIT_CJK = 8
    MIN_SPLIT_UNIT_ENGLISH = 4

    @staticmethod
    def _is_mainly_cjk(text: str) -> bool:
        """检测文本是否主要为CJK字符"""
        if not text:
            return False
        cjk_count = sum(1 for c in text if '\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u30ff' or '\uac00' <= c <= '\ud7af')
        return cjk_count > len(text) * 0.3

    @staticmethod
    def _count_words(text: str) -> int:
        """计算字数（CJK按字符，英文按单词）"""
        if not text:
            return 0
        if SegmentRefiner._is_mainly_cjk(text):
            return len([c for c in text if not c.isspace()])
        else:
            return len(text.split())

    @staticmethod
    def _max_unit_count(text: str) -> int:
        return (
            SegmentRefiner.HARD_CHAR_LIMIT_CJK
            if SegmentRefiner._is_mainly_cjk(text)
            else SegmentRefiner.HARD_WORD_LIMIT_ENGLISH
        )

    @staticmethod
    def _min_split_unit(text: str) -> int:
        return (
            SegmentRefiner.MIN_SPLIT_UNIT_CJK
            if SegmentRefiner._is_mainly_cjk(text)
            else SegmentRefiner.MIN_SPLIT_UNIT_ENGLISH
        )

    @staticmethod
    def _join_text(left: str, right: str) -> str:
        if not left:
            return right
        if not right:
            return left
        return left + right if SegmentRefiner._is_mainly_cjk(left) else f"{left} {right}"

    @staticmethod
    def _candidate_split_score(text: str, split_at: int) -> int:
        left = text[:split_at].strip()
        right = text[split_at:].strip()
        if not left or not right:
            return -10**9

        left_units = SegmentRefiner._count_words(left)
        right_units = SegmentRefiner._count_words(right)
        min_units = SegmentRefiner._min_split_unit(text)
        if left_units < min_units or right_units < min_units:
            return -10**8

        score = -abs(left_units - right_units)
        prev_char = text[split_at - 1] if split_at > 0 else ""
        next_char = text[split_at] if split_at < len(text) else ""
        next_word = right.split(maxsplit=1)[0].strip(" ,.!?;:，。！？；：\"'()[]{}").lower()

        if prev_char in "。！？.!?":
            score += 12
        elif prev_char in "，；：,;:":
            score += 8
        elif prev_char.isspace():
            score += 2

        if next_word in SegmentRefiner.PREFIX_SPLIT_WORDS:
            score += 5

        return score

    @staticmethod
    def _find_text_split_index(text: str) -> int | None:
        max_units = SegmentRefiner._max_unit_count(text)
        total_units = SegmentRefiner._count_words(text)
        if total_units <= max_units:
            return None

        candidate_indexes = []
        for idx, char in enumerate(text):
            if char in "。！？.!?，；：,;:":
                candidate_indexes.append(idx + 1)
            elif char.isspace():
                candidate_indexes.append(idx + 1)

        if not candidate_indexes:
            midpoint = len(text) // 2
            return midpoint if 0 < midpoint < len(text) else None

        best_index = None
        best_score = -10**9
        for candidate in candidate_indexes:
            score = SegmentRefiner._candidate_split_score(text, candidate)
            if score > best_score:
                best_score = score
                best_index = candidate

        if best_score <= -10**8:
            midpoint = len(text) // 2
            return midpoint if 0 < midpoint < len(text) else None
        return best_index

    @staticmethod
    def _rebalance_long_segment(segment: SubtitleSegment) -> List[SubtitleSegment]:
        text = (segment.text or "").strip()
        if not text:
            return []

        split_index = SegmentRefiner._find_text_split_index(text)
        if split_index is None:
            return [segment]

        left_text = text[:split_index].strip()
        right_text = text[split_index:].strip()
        if not left_text or not right_text:
            return [segment]

        duration = max(segment.end - segment.start, 0.001)
        total_len = max(len(left_text) + len(right_text), 1)
        ratio = len(left_text) / total_len
        midpoint = round(segment.start + duration * ratio, 3)

        left = SubtitleSegment(id=segment.id, start=segment.start, end=midpoint, text=left_text)
        right = SubtitleSegment(id=segment.id, start=midpoint, end=segment.end, text=right_text)

        result: List[SubtitleSegment] = []
        for part in (left, right):
            result.extend(SegmentRefiner._rebalance_long_segment(part))
        return result

    @staticmethod
    def refine_segments(segments, max_chars=70) -> List[SubtitleSegment]:
        """
        优化 Whisper 输出的字幕分段。
        
        新策略：信任 Whisper 的自然断句！
        1. 保留 Whisper 的 segment 边界（它有语义理解能力）
        2. 只拆分超长的 segment（使用 word 时间戳精确分割）
        3. 合并过短的 orphan segment
        """
        if not segments:
            return []
        
        refined = []
        
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            
            # 计算当前 segment 的字数
            is_cjk = SegmentRefiner._is_mainly_cjk(text)
            max_words = SegmentRefiner.MAX_WORD_COUNT_CJK if is_cjk else SegmentRefiner.MAX_WORD_COUNT_ENGLISH
            word_count = SegmentRefiner._count_words(text)
            
            # Case 1: segment 长度合适，直接保留（信任 Whisper）
            if word_count <= max_words:
                refined.append(SubtitleSegment(
                    id="0",
                    start=seg.start,
                    end=seg.end,
                    text=text
                ))
                continue
            
            # Case 2: segment 太长，需要用 word 时间戳拆分
            if not getattr(seg, 'words', None):
                # 没有 word 时间戳，直接保留（备用方案）
                refined.append(SubtitleSegment(
                    id="0", start=seg.start, end=seg.end, text=text
                ))
                continue
            
            # 使用 word 时间戳，在标点/连接词处智能拆分超长 segment
            current_words = []
            current_start = seg.words[0].start
            is_cjk_text = is_cjk
            soft_limit = SegmentRefiner.SPLIT_SOFT_CJK if is_cjk_text else SegmentRefiner.SPLIT_SOFT_ENGLISH

            for i, word in enumerate(seg.words):
                current_words.append(word)
                current_text = "".join(w.word for w in current_words)
                current_word_count = SegmentRefiner._count_words(current_text)

                # 还没到软阈值，继续积累
                if current_word_count < soft_limit:
                    continue

                # 到达软阈值后，检查是否在合适的分割点
                word_text = word.word.strip()
                should_split = False

                if current_word_count >= max_words:
                    # 硬上限：必须分割
                    should_split = True
                elif word_text and word_text[-1] in SegmentRefiner.SUFFIX_SPLIT_WORDS:
                    # 当前词以标点/语气词结尾 → 好的分割点
                    should_split = True
                elif i + 1 < len(seg.words):
                    next_word = seg.words[i + 1].word.strip().lower()
                    if next_word in SegmentRefiner.PREFIX_SPLIT_WORDS:
                        # 下一个词是连接词 → 好的分割点
                        should_split = True

                if should_split:
                    refined.append(SubtitleSegment(
                        id="0",
                        start=current_start,
                        end=word.end,
                        text=current_text.strip()
                    ))
                    current_words = []
                    if i + 1 < len(seg.words):
                        current_start = seg.words[i + 1].start
            
            # 处理剩余的词
            if current_words:
                remaining_text = "".join(w.word for w in current_words).strip()
                if remaining_text:
                    refined.append(SubtitleSegment(
                        id="0",
                        start=current_start,
                        end=current_words[-1].end,
                        text=remaining_text
                    ))
        
        # 后处理：合并过短的 orphan segment（<2词）
        final_segments = []
        if refined:
            final_segments.append(refined[0])
            for i in range(1, len(refined)):
                prev = final_segments[-1]
                curr = refined[i]
                
                prev_words = SegmentRefiner._count_words(prev.text)
                curr_words = SegmentRefiner._count_words(curr.text)
                combined_words = prev_words + curr_words
                
                is_cjk = SegmentRefiner._is_mainly_cjk(prev.text)
                max_words = SegmentRefiner.MAX_WORD_COUNT_CJK if is_cjk else SegmentRefiner.MAX_WORD_COUNT_ENGLISH
                
                # 只合并极短的 orphan（<2词），且合并后不超限
                time_gap = curr.start - prev.end
                is_orphan = curr_words < 2
                can_merge = combined_words <= max_words
                time_close = time_gap < 0.3
                
                if is_orphan and can_merge and time_close:
                    prev.text += " " + curr.text if not is_cjk else curr.text
                    prev.end = curr.end
                else:
                    final_segments.append(curr)
        
        return final_segments

    @staticmethod
    def _starts_like_continuation(text: str) -> bool:
        text = (text or "").lstrip()
        if not text:
            return False

        first = text[0]
        return (
            first.islower()
            or first.isdigit()
            or first in {",", ".", "!", "?", ";", ":", "'", '"', ")", "]", "}", "%"}
        )

    @staticmethod
    def merge_segments(segments: List[SubtitleSegment], gap_threshold=1.0, max_chars=80) -> List[SubtitleSegment]:
        """
        Smartly merge short segments to improve readability and flow.
        """
        if not segments:
            return []

        try:
            merged = [segments[0]]
            
            for i in range(1, len(segments)):
                prev = merged[-1]
                curr = segments[i]
                
                # Metadata
                time_gap = curr.start - prev.end
                combined_text = SegmentRefiner._join_text(prev.text, curr.text)
                combined_len = len(combined_text)
                combined_duration = curr.end - prev.start
                
                # --- Classification ---
                # A "Fragment" is a very short standalone utterance (e.g. "mistake.", "I do.")
                is_fragment = len(curr.text) < 15 or len(curr.text.split()) < 3
                
                # A "Tiny Tail" is an extremely short suffix (e.g. 1-2 words), often just a trailing word
                is_tiny_tail = len(curr.text) < 8 
                
                prev_ends_sentence = prev.text.strip()[-1] in {'.', '!', '?', '。', '！', '？'} if prev.text else False
                looks_like_continuation = SegmentRefiner._starts_like_continuation(curr.text)
                
                # --- Decision Logic ---
                should_merge = False
                
                # Logic 1: Handle "Orphan Fragments" (The User's specific case)
                # Scenario: "...making a grave" + "mistake."
                # We allow overflowing max_chars for these tiny tails to prevent them from standing alone.
                if is_tiny_tail:
                    # Allow large overflow (up to 120 chars total) for tiny tails
                    # Allow reasonable gap (up to 2.0s) for "dramatic pauses" before the final word
                    if combined_len <= 120 and time_gap < 2.0:
                        should_merge = True
                        
                # Logic 2: Standard Flow Merge
                # Merge if:
                # 1. Fits in standard length
                # 2. Not too much silence (gap < threshold)
                # 3. Previous sentence didn't explicitly end (no punctuation) OR current is a fragment
                elif not prev_ends_sentence:
                    if combined_len <= max_chars and time_gap < gap_threshold:
                        should_merge = True
                    # Sentence-level rescue: ASR often hard-wraps one sentence across
                    # consecutive cues. Allow a larger temporary subtitle block here;
                    # later rendering can still wrap lines visually.
                    elif (
                        looks_like_continuation
                        and combined_len <= 160
                        and combined_duration <= 8.0
                        and time_gap < 1.2
                    ):
                        should_merge = True
                         
                # Logic 3: Force Merge Fragments if very close
                # If it's a fragment and there is almost NO silence (<0.3s), merge it even if prev had punctuation
                elif is_fragment and time_gap < 0.3 and combined_len <= max_chars:
                    should_merge = True

                if should_merge:
                    # Execute Merge with smart separator
                    is_prev_cjk = SegmentRefiner._is_mainly_cjk(prev.text)
                    prev.text = SegmentRefiner._join_text(prev.text, curr.text)
                    prev.end = curr.end
                else:
                    merged.append(curr)
                    
            # Re-index IDs
            for i, seg in enumerate(merged):
                seg.id = str(i + 1)
            
            return merged

        except Exception as e:
            logger.error(f"Smart merge failed: {e}", exc_info=True)
            return segments

    @staticmethod
    def optimize_timing(segments: List[SubtitleSegment], threshold_s: float = 1.0) -> List[SubtitleSegment]:
        """
        Smooth adjacent subtitle boundaries to reduce flicker.
        If gap between consecutive segments < threshold, adjust boundary to 3/4 point.
        (Reference: VideoCaptioner asr_data.py:472-499)
        """
        if len(segments) < 2:
            return segments

        for i in range(len(segments) - 1):
            curr = segments[i]
            nxt = segments[i + 1]
            gap = nxt.start - curr.end

            if 0 < gap < threshold_s:
                mid = curr.end + gap * 0.75
                curr.end = round(mid, 3)
                nxt.start = round(mid, 3)

        return segments

    @staticmethod
    def rebalance_segment_lengths(segments: List[SubtitleSegment]) -> List[SubtitleSegment]:
        balanced: List[SubtitleSegment] = []
        for segment in segments:
            balanced.extend(SegmentRefiner._rebalance_long_segment(segment))

        for i, seg in enumerate(balanced):
            seg.id = str(i + 1)
        return balanced

    @staticmethod
    def normalize_segments(segments: List[SubtitleSegment]) -> List[SubtitleSegment]:
        if not segments:
            return []

        merged = SegmentRefiner.merge_segments(segments)
        balanced = SegmentRefiner.rebalance_segment_lengths(merged)
        timed = SegmentRefiner.optimize_timing(balanced)

        for i, seg in enumerate(timed):
            seg.id = str(i + 1)
        return timed
