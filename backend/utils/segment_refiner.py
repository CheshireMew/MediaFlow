"""
Segment Refiner — Whisper output optimization and fragment merging.

Whisper segment normalization and timing helpers.
"""
from typing import List
from loguru import logger
from backend.models.schemas import SubtitleSegment
from backend.utils.subtitle_text_splitter import (
    MAX_WORD_COUNT_CJK,
    MAX_WORD_COUNT_ENGLISH,
    PREFIX_SPLIT_WORDS,
    SPLIT_SOFT_CJK,
    SPLIT_SOFT_ENGLISH,
    SUFFIX_SPLIT_WORDS,
    count_text_units,
    is_mainly_cjk,
    join_subtitle_text,
    rebalance_long_subtitle_segment,
)


SENTENCE_END = ".?!。？！…"
SOFT_BREAK = ",;:，；：、"


class _PseudoWord:
    def __init__(self, start: float, end: float, text: str):
        self.start = start
        self.end = end
        self.word = text


class SegmentRefiner:
    @staticmethod
    def _word_text(words) -> str:
        return "".join(getattr(word, "word", "") for word in words).strip()

    @staticmethod
    def _flush_words(words) -> SubtitleSegment | None:
        text = SegmentRefiner._word_text(words)
        if not text:
            return None
        return SubtitleSegment(
            id="0",
            start=float(words[0].start),
            end=float(words[-1].end),
            text=text,
        )

    @staticmethod
    def _find_soft_cut(words) -> int | None:
        for index in range(len(words) - 1, -1, -1):
            text = str(getattr(words[index], "word", "")).strip()
            if text and text[-1] in SOFT_BREAK:
                return index
        return None

    @staticmethod
    def _find_pause_cut(words, min_gap_s: float = 0.2) -> int | None:
        best_gap = min_gap_s
        best_index = None
        start_index = max(1, len(words) // 3)
        for index in range(start_index, len(words) - 1):
            gap = float(words[index + 1].start) - float(words[index].end)
            if gap > best_gap:
                best_gap = gap
                best_index = index
        return best_index

    @staticmethod
    def _postprocess_word_segments(segments: List[SubtitleSegment]) -> List[SubtitleSegment]:
        cleaned: List[SubtitleSegment] = []
        for segment in segments:
            if segment.end <= segment.start or not segment.text.strip():
                continue
            if cleaned and segment.text == cleaned[-1].text:
                cleaned[-1].end = max(cleaned[-1].end, segment.end)
                continue
            cleaned.append(segment)

        merged: List[SubtitleSegment] = []
        for segment in cleaned:
            duration = segment.end - segment.start
            unit_count = count_text_units(segment.text)
            if merged and duration < 0.4 and unit_count < 3:
                merged[-1].text = join_subtitle_text(merged[-1].text, segment.text)
                merged[-1].end = segment.end
            else:
                merged.append(segment)

        for index in range(1, len(merged)):
            previous = merged[index - 1]
            current = merged[index]
            if current.start < previous.end:
                current.start = previous.end
            if current.end <= current.start:
                current.end = current.start + 0.3

        for index, segment in enumerate(merged):
            segment.id = str(index + 1)
        return merged

    @staticmethod
    def _refine_with_word_boundaries(
        segments,
        *,
        max_line_ms: int = 6000,
        pause_ms: int = 500,
        max_chars: int = 80,
    ) -> List[SubtitleSegment]:
        flat_words = []
        has_real_words = False
        for segment in segments:
            words = list(getattr(segment, "words", None) or [])
            if words:
                has_real_words = True
                flat_words.extend(words)
            else:
                flat_words.append(
                    _PseudoWord(
                        float(segment.start),
                        float(segment.end),
                        str(getattr(segment, "text", "")),
                    )
                )

        if not has_real_words or not flat_words:
            return []

        result: List[SubtitleSegment] = []
        current_words = []
        total = len(flat_words)
        for index, word in enumerate(flat_words):
            current_words.append(word)
            word_text = str(getattr(word, "word", "")).strip()
            current_text = SegmentRefiner._word_text(current_words)
            duration_ms = (float(word.end) - float(current_words[0].start)) * 1000
            gap_ms = (
                (float(flat_words[index + 1].start) - float(word.end)) * 1000
                if index + 1 < total
                else 0
            )
            next_word_text = (
                str(getattr(flat_words[index + 1], "word", "")).strip()
                if index + 1 < total
                else ""
            )

            ends_sentence = bool(word_text) and word_text[-1] in SENTENCE_END
            next_looks_continuation = SegmentRefiner._starts_like_continuation(next_word_text)
            big_pause = gap_ms >= pause_ms and not next_looks_continuation
            too_long = duration_ms >= max_line_ms or len(current_text) >= max_chars

            if ends_sentence or big_pause:
                segment = SegmentRefiner._flush_words(current_words)
                if segment:
                    result.append(segment)
                current_words = []
            elif too_long:
                cut_index = SegmentRefiner._find_soft_cut(current_words)
                if cut_index is None or cut_index >= len(current_words) - 1:
                    cut_index = SegmentRefiner._find_pause_cut(current_words)
                if cut_index is not None and cut_index < len(current_words) - 1:
                    head = current_words[:cut_index + 1]
                    current_words = current_words[cut_index + 1:]
                    segment = SegmentRefiner._flush_words(head)
                    if segment:
                        result.append(segment)
                else:
                    segment = SegmentRefiner._flush_words(current_words)
                    if segment:
                        result.append(segment)
                    current_words = []

        if current_words:
            segment = SegmentRefiner._flush_words(current_words)
            if segment:
                result.append(segment)

        return SegmentRefiner._postprocess_word_segments(result)

    @staticmethod
    def refine_segments(segments) -> List[SubtitleSegment]:
        """
        优化 Whisper 输出的字幕分段。
        
        新策略：信任 Whisper 的自然断句！
        1. 保留 Whisper 的 segment 边界（它有语义理解能力）
        2. 只拆分超长的 segment（使用 word 时间戳精确分割）
        3. 合并过短的 orphan segment
        """
        if not segments:
            return []

        word_boundary_segments = SegmentRefiner._refine_with_word_boundaries(segments)
        if word_boundary_segments:
            return word_boundary_segments
        
        refined = []
        
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            
            # 计算当前 segment 的字数
            is_cjk = is_mainly_cjk(text)
            max_words = MAX_WORD_COUNT_CJK if is_cjk else MAX_WORD_COUNT_ENGLISH
            word_count = count_text_units(text)
            
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
            soft_limit = SPLIT_SOFT_CJK if is_cjk_text else SPLIT_SOFT_ENGLISH

            for i, word in enumerate(seg.words):
                current_words.append(word)
                current_text = "".join(w.word for w in current_words)
                current_word_count = count_text_units(current_text)

                # 还没到软阈值，继续积累
                if current_word_count < soft_limit:
                    continue

                # 到达软阈值后，检查是否在合适的分割点
                word_text = word.word.strip()
                should_split = False

                if current_word_count >= max_words:
                    # 硬上限：必须分割
                    should_split = True
                elif word_text and word_text[-1] in SUFFIX_SPLIT_WORDS:
                    # 当前词以标点/语气词结尾 → 好的分割点
                    should_split = True
                elif i + 1 < len(seg.words):
                    next_word = seg.words[i + 1].word.strip().lower()
                    if next_word in PREFIX_SPLIT_WORDS:
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
                
                prev_words = count_text_units(prev.text)
                curr_words = count_text_units(curr.text)
                combined_words = prev_words + curr_words
                
                is_cjk = is_mainly_cjk(prev.text)
                max_words = MAX_WORD_COUNT_CJK if is_cjk else MAX_WORD_COUNT_ENGLISH
                
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
                combined_text = join_subtitle_text(prev.text, curr.text)
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
                    prev.text = join_subtitle_text(prev.text, curr.text)
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
            balanced.extend(rebalance_long_subtitle_segment(segment))

        for i, seg in enumerate(balanced):
            seg.id = str(i + 1)
        return balanced

    @staticmethod
    def normalize_segments(
        segments: List[SubtitleSegment],
        *,
        rebalance: bool = True,
    ) -> List[SubtitleSegment]:
        if not segments:
            return []

        merged = SegmentRefiner.merge_segments(segments)
        balanced = SegmentRefiner.rebalance_segment_lengths(merged) if rebalance else merged
        timed = SegmentRefiner.optimize_timing(balanced)

        for i, seg in enumerate(timed):
            seg.id = str(i + 1)
        return timed
