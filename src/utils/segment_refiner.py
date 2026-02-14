"""
Segment Refiner — Whisper output optimization and fragment merging.

Extracted from SubtitleManager to follow Single Responsibility Principle.
"""
from typing import List
from loguru import logger
from src.models.schemas import SubtitleSegment


class SegmentRefiner:
    # ==================== 分割配置常量 (参考 VideoCaptioner) ====================
    MAX_WORD_COUNT_CJK = 25      # CJK文本单行最大字数
    MAX_WORD_COUNT_ENGLISH = 18  # 英文文本单行最大单词数
    MIN_WORD_COUNT = 5           # 最小字数阈值（才考虑分割）
    TIME_GAP_THRESHOLD = 0.5     # 时间间隔阈值（秒）
    
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
            
            # 使用 word 时间戳精确拆分超长 segment
            current_words = []
            current_start = seg.words[0].start
            
            for i, word in enumerate(seg.words):
                current_words.append(word)
                current_text = "".join(w.word for w in current_words)
                current_word_count = SegmentRefiner._count_words(current_text)
                
                # 达到上限时分割
                if current_word_count >= max_words:
                    refined.append(SubtitleSegment(
                        id="0",
                        start=current_start,
                        end=word.end,
                        text=current_text.strip()
                    ))
                    current_words = []
                    # 下一个词的开始时间
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
                combined_text = prev.text + " " + curr.text
                combined_len = len(combined_text)
                
                # --- Classification ---
                # A "Fragment" is a very short standalone utterance (e.g. "mistake.", "I do.")
                is_fragment = len(curr.text) < 15 or len(curr.text.split()) < 3
                
                # A "Tiny Tail" is an extremely short suffix (e.g. 1-2 words), often just a trailing word
                is_tiny_tail = len(curr.text) < 8 
                
                prev_ends_sentence = prev.text.strip()[-1] in {'.', '!', '?', '。', '！', '？'} if prev.text else False
                
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
                         
                # Logic 3: Force Merge Fragments if very close
                # If it's a fragment and there is almost NO silence (<0.3s), merge it even if prev had punctuation
                elif is_fragment and time_gap < 0.3 and combined_len <= max_chars:
                    should_merge = True

                if should_merge:
                    # Execute Merge with smart separator
                    is_prev_cjk = SegmentRefiner._is_mainly_cjk(prev.text)
                    separator = "" if is_prev_cjk else " "
                    
                    # If prev ends with punctuation and we are merging, we might want to strip it?
                    # Usually no, Whisper puts punctuation at the end of the *utterance*. 
                    # If we merge "Hello." + "World.", it becomes "Hello. World." -> Fine.
                    # If we merge "making a grave" + "mistake.", it becomes "making a grave mistake." -> Fine.
                    
                    prev.text = prev.text + separator + curr.text
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
