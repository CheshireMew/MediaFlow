from pathlib import Path
from typing import List
import re
from loguru import logger
from src.models.schemas import SubtitleSegment

class SubtitleManager:
    @staticmethod
    def process_vtt_file(vtt_path: Path) -> Path:
        """
        Process a VTT file downloaded by yt-dlp:
        1. Clean garbage metadata (X-word-ms)
        2. Convert to SRT
        Returns the path to the generated SRT file.
        """
        try:
            if not vtt_path.exists():
                return None

            logger.info(f"Processing subtitle file: {vtt_path.name}")
            # Use utf-8-sig to handle BOM if present
            content = vtt_path.read_text(encoding='utf-8-sig')
            
            # 1. Clean Metadata Tags (Keep content, remove tags)
            cleaned_content = re.sub(r'</?X-word-ms[^>]*>', '', content)
            
            # 2. Convert to SRT
            srt_lines = []
            counter = 1
            
            # Normalize newlines
            lines = cleaned_content.replace('\r\n', '\n').split('\n')
            
            current_time_line = ""
            current_text = []
            
            # Pattern supports: HH:MM:SS.mmm or MM:SS.mmm
            timestamp_pattern = re.compile(r'(?:(\d{2}):)?(\d{2}):(\d{2})[\.,](\d{3})\s-->\s(?:(\d{2}):)?(\d{2}):(\d{2})[\.,](\d{3})')
            
            for line in lines:
                line = line.strip()
                if not line:
                    # Block finished?
                    if current_time_line and current_text:
                        srt_lines.append(str(counter))
                        srt_lines.append(current_time_line)
                        srt_lines.extend(current_text)
                        srt_lines.append("") # Empty line after block
                        counter += 1
                        current_time_line = ""
                        current_text = []
                    continue
                
                # Check if timestamp line
                match = timestamp_pattern.search(line)
                if match:
                    # Found a cue start
                    if current_time_line and current_text:
                        srt_lines.append(str(counter))
                        srt_lines.append(current_time_line)
                        srt_lines.extend(current_text)
                        srt_lines.append("")
                        counter += 1
                    
                    # Start new block, clear previous text
                    current_text = []
                    # Convert format: replace . with ,
                    current_time_line = line.replace('.', ',')
                else:
                    # Content line
                    if not current_time_line:
                        continue
                        
                    # Skip header/metadata digits
                    if line.isdigit() and not current_time_line:
                            continue
                    # Skip metadata lines or comments
                    if line.startswith('NOTE'):
                        continue
                        
                    current_text.append(line)

            # Flush last block
            if current_time_line and current_text:
                srt_lines.append(str(counter))
                srt_lines.append(current_time_line)
                srt_lines.extend(current_text)
                srt_lines.append("")

            # Write SRT file
            srt_path = vtt_path.with_suffix('.srt')
            srt_path.write_text('\n'.join(srt_lines), encoding='utf-8')
            logger.success(f"Converted to SRT: {srt_path.name}")
            return srt_path
            
        except Exception as e:
            logger.warning(f"Failed to process subtitles {vtt_path}: {e}")
            return None

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = round((seconds - int(seconds)) * 1000)
        # Handle overflow from rounding up 999.5+
        if millis >= 1000:
            millis = 0
            secs += 1
            if secs >= 60:
                secs = 0
                minutes += 1
                if minutes >= 60:
                    minutes = 0
                    hours += 1
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    @staticmethod
    def save_srt(segments: List[SubtitleSegment], audio_path: str) -> str:
        """Generate and save SRT file next to the input audio."""
        srt_content = ""
        for i, seg in enumerate(segments):
            start_str = SubtitleManager.format_timestamp(seg.start)
            end_str = SubtitleManager.format_timestamp(seg.end)
            srt_content += f"{i + 1}\n{start_str} --> {end_str}\n{seg.text}\n\n"
            
        srt_path = Path(audio_path).with_suffix(".srt")
        try:
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(srt_content)
            return str(srt_path)
        except Exception as e:
            logger.error(f"Failed to save SRT file: {e}")
            return ""

    @staticmethod
    def parse_srt(srt_content: str) -> List[SubtitleSegment]:
        """Parse SRT content into SubtitleSegment list."""
        segments = []
        blocks = re.split(r'\n\s*\n', srt_content.strip())
        
        for block in blocks:
            lines = block.strip().split('\n')
            if len(lines) < 3:
                continue
                
            # Skip index line (lines[0])
            
            # Parse timestamp: 00:00:00,000 --> 00:00:02,500
            time_line = lines[1]
            times = re.findall(r'(\d{2}):(\d{2}):(\d{2})[,.](\d{3})', time_line)
            if len(times) != 2:
                continue
                
            def to_seconds(t):
                return int(t[0])*3600 + int(t[1])*60 + int(t[2]) + int(t[3])/1000
                
            start = to_seconds(times[0])
            end = to_seconds(times[1])
            
            # Parse text
            text = '\n'.join(lines[2:])
            # Remove HTML tags if any (like <i>)
            text = re.sub(r'<[^>]+>', '', text)
            
            segments.append(SubtitleSegment(
                id=str(len(segments)),
                start=start,
                end=end,
                text=text.strip()
            ))
            
        return segments

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
        if SubtitleManager._is_mainly_cjk(text):
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
            is_cjk = SubtitleManager._is_mainly_cjk(text)
            max_words = SubtitleManager.MAX_WORD_COUNT_CJK if is_cjk else SubtitleManager.MAX_WORD_COUNT_ENGLISH
            word_count = SubtitleManager._count_words(text)
            
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
                current_word_count = SubtitleManager._count_words(current_text)
                
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
                
                prev_words = SubtitleManager._count_words(prev.text)
                curr_words = SubtitleManager._count_words(curr.text)
                combined_words = prev_words + curr_words
                
                is_cjk = SubtitleManager._is_mainly_cjk(prev.text)
                max_words = SubtitleManager.MAX_WORD_COUNT_CJK if is_cjk else SubtitleManager.MAX_WORD_COUNT_ENGLISH
                
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
        Fixes issues where V2 splits sentences into tiny fragments (e.g. 'three times.').
        """
        if not segments:
            return []

        logger.info(f"DEBUG MERGE: Type={type(segments)}, Len={len(segments)}")
        if len(segments) > 0:
             logger.info(f"DEBUG MERGE: First item={type(segments[0])}, content={segments[0]}")
            
        if not segments:
            return []

        try:
            merged = [segments[0]]
            
            for i in range(1, len(segments)):
                prev = merged[-1]
                curr = segments[i]
                
                # --- Merge Condition Checks ---
                
                # 1. Time Gap: Must be close enough
                # Relaxed from 0.5 to 1.0s because V2 sometimes leaves larger gaps between fragments
                time_gap = curr.start - prev.end
                is_close = time_gap < gap_threshold
                
                # 2. Length: Combined shouldn't be too long
                # Simple space concatenation for checking length
                temp_text = prev.text + " " + curr.text
                can_fit = len(temp_text) <= max_chars
                
                # 3. Fragment Detection
                # A fragment is very short (< 15 chars or < 3 words)
                curr_is_fragment = len(curr.text) < 15 or len(curr.text.split()) < 3
                
                # 4. Punctuation Check
                # If prev ends with strong punctuation, we are reluctant to merge unless curr is a tiny fragment
                prev_ends_sentence = prev.text.strip()[-1] in {'.', '!', '?', '。', '！', '？'} if prev.text else False
                
                # --- Decision Logic ---
                should_merge = False
                
                if is_close and can_fit:
                    if curr_is_fragment:
                        # Always merge fragments if they fit and are close
                        should_merge = True
                    elif not prev_ends_sentence:
                        # Merge normal segments if they flow (no period)
                        should_merge = True
                
                if should_merge:
                    # Execute Merge
                    # Handle CJK spacing
                    is_prev_cjk = SubtitleManager._is_mainly_cjk(prev.text)
                    separator = "" if is_prev_cjk else " "
                    
                    prev.text = prev.text + separator + curr.text
                    prev.end = curr.end
                else:
                    merged.append(curr)
                    
            # Re-index IDs
            for i, seg in enumerate(merged):
                seg.id = str(i + 1)
            
            return merged

        except Exception as e:
            import traceback
            import time
            from pathlib import Path
            
            # Log to console
            logger.error(f"Smart merge failed: {e}. generating crash dump...")
            
            # Create crash dump for root cause analysis
            try:
                dump_file = Path("crash_dump_subtitle_merge.txt")
                with open(dump_file, "w", encoding="utf-8") as f:
                    f.write(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write(f"Error: {e}\n")
                    f.write(f"Segments Type: {type(segments)}\n")
                    if isinstance(segments, list):
                        f.write(f"Segments Len: {len(segments)}\n")
                        for idx, s in enumerate(segments):
                            f.write(f"Item {idx}: {s}\n")
                    f.write("\nTraceback:\n")
                    f.write(traceback.format_exc())
                logger.info(f"Crash dump saved to {dump_file.absolute()}")
            except Exception as dump_err:
                logger.error(f"Failed to write crash dump: {dump_err}")

            return segments
            

    @staticmethod
    def convert_srt_to_ass(srt_path: str, ass_path: str, style_options: dict = None) -> bool:
        """
        Convert SRT to ASS format with custom styles.
        This provides much better control over positioning than FFmpeg's force_style.
        """
        try:
            style_options = style_options or {}
            # Defaults
            font_size = style_options.get('font_size', 24)
            font_color = style_options.get('font_color', '&H00FFFFFF')
            margin_v = style_options.get('margin_v', 20)
            
            # ASS Colors are &HAABBGGRR.
            # Convert incoming format if needed?
            # Assuming font_color is already &HAABBGGRR format from SynthesisDialog.
            
            # Header with PlayRes which defines the coordinate system for MarginV
            # Using 1920x1080 as base resolution for consistent margins
            header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,{font_size},{font_color},&H00000000,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
            # Note on Style: 
            # Alignment=2 (Bottom Center)
            # Outline=2 (Standard outline)
            # Shadow=0 (No shadow for now to keep it clean, or 1?)
            
            # Read SRT content
            with open(srt_path, 'r', encoding='utf-8') as f:
                srt_content = f.read()
                
            segments = SubtitleManager.parse_srt(srt_content)
            
            events = []
            
            for seg in segments:
                # Convert timestamp (seconds) to ASS format (H:MM:SS.cc)
                def format_time(s):
                    h = int(s // 3600)
                    m = int((s % 3600) // 60)
                    sec = int(s % 60)
                    cs = int(round((s - int(s)) * 100))
                    if cs == 100: cs = 99 # Clamp
                    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"
                    
                start_ts = format_time(seg.start)
                end_ts = format_time(seg.end)
                
                # Sanitize text
                text = seg.text.replace('\n', r'\N')
                
                # Dialogue event
                events.append(f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text}")
                
            with open(ass_path, 'w', encoding='utf-8-sig') as f:
                f.write(header + "\n".join(events))
                
            logger.info(f"Generated ASS file: {ass_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to convert SRT to ASS: {e}")
            return False


