"""
Subtitle Writer — SRT/ASS file generation and timestamp formatting.

Extracted from SubtitleManager to follow Single Responsibility Principle.
"""
from pathlib import Path
from typing import List
from loguru import logger
from src.models.schemas import SubtitleSegment
from src.utils.subtitle_parser import SubtitleParser


class SubtitleWriter:
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
            start_str = SubtitleWriter.format_timestamp(seg.start)
            end_str = SubtitleWriter.format_timestamp(seg.end)
            srt_content += f"{i + 1}\n{start_str} --> {end_str}\n{seg.text}\n\n"
            
        # FIX: path.with_suffix() is dangerous if the stem contains dots (e.g. "Title ... [id]")
        # It mistakes the dot in "..." as an extension separator and truncates the ID.
        # Since we expect audio_path to be the full desired path (without extension, or with),
        # we should ensure it ends with .srt safely.
        
        path_obj = Path(audio_path)
        # Use with_suffix to replace the extension (e.g. .mp4 -> .srt)
        srt_path = path_obj.with_suffix(".srt")

        try:
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(srt_content)
            return str(srt_path)
        except Exception as e:
            logger.error(f"Failed to save SRT file: {e}")
            return ""

    @staticmethod
    def convert_srt_to_ass(srt_path: str, ass_path: str, style_options: dict = None, time_offset: float = 0.0) -> bool:
        """
        Convert SRT to ASS format with custom styles.
        This provides much better control over positioning than FFmpeg's force_style.

        Supported style_options keys:
          - (same as before)
        """
        try:
            style_options = style_options or {}

            # ── Style Parameters ──
            font_name = style_options.get('font_name', 'Arial')
            font_size = style_options.get('font_size', 24)
            font_color = style_options.get('font_color', '&H00FFFFFF')
            bold = -1 if style_options.get('bold', False) else 0        # ASS: -1 = true, 0 = false
            italic = -1 if style_options.get('italic', False) else 0
            outline = int(style_options.get('outline', 2))
            shadow = int(style_options.get('shadow', 0))
            outline_color = style_options.get('outline_color', '&H00000000')
            back_color = style_options.get('back_color', '&H80000000')
            border_style = int(style_options.get('border_style', 1))
            alignment = int(style_options.get('alignment', 2))
            margin_v = style_options.get('margin_v', 20)

            # Dynamic Resolution (True Res)
            play_res_x = style_options.get('video_width', 1920)
            play_res_y = style_options.get('video_height', 1080)

            # Build ASS Style line
            # Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,
            #         OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut,
            #         ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,
            #         Alignment, MarginL, MarginR, MarginV, Encoding
            style_line = (
                f"Style: Default,{font_name},{font_size},{font_color},&H00000000,"
                f"{outline_color},{back_color},{bold},{italic},0,0,"
                f"100,100,0,0,{border_style},{outline},{shadow},"
                f"{alignment},10,10,{margin_v},1"
            )

            header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_line}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
            # Read SRT content
            with open(srt_path, 'r', encoding='utf-8') as f:
                srt_content = f.read()
                
            segments = SubtitleParser.parse_srt(srt_content)
            
            events = []
            
            for seg in segments:
                # Apply time offset
                seg_start = seg.start + time_offset
                seg_end = seg.end + time_offset
                
                # Filter out segments that are completely cut off (start < 0 and end < 0)
                # But allow partial overlap (start < 0 but end > 0) -> Clamp to 0
                if seg_end <= 0:
                    continue
                    
                seg_start = max(0.0, seg_start)
                
                # Convert timestamp (seconds) to ASS format (H:MM:SS.cc)
                def format_time(s):
                    h = int(s // 3600)
                    m = int((s % 3600) // 60)
                    sec = int(s % 60)
                    cs = int(round((s - int(s)) * 100))
                    if cs == 100: cs = 99 # Clamp
                    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"
                    
                start_ts = format_time(seg_start)
                end_ts = format_time(seg_end)
                
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
