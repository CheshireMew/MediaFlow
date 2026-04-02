"""
Subtitle Writer — SRT/ASS file generation and timestamp formatting.

Extracted from SubtitleManager to follow Single Responsibility Principle.
"""
from pathlib import Path
from typing import List
from loguru import logger
from backend.models.schemas import SubtitleSegment
from backend.utils.subtitle_parser import SubtitleParser
from backend.utils.text_shaper import shape


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
            
        path_obj = Path(audio_path)
        # Check if the path allows us to safely replace suffix
        # logic: if suffix is a known media type, replace it. 
        # If it's something else (like .2023_CN from a dot-containing filename), append .srt.
        
        suffix = path_obj.suffix.lower()
        if suffix in ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.mp3', '.wav', '.flac', '.m4a']:
            srt_path = path_obj.with_suffix(".srt")
        else:
            # It's likely a stem or a file with dots in the name (e.g. "Movie.2023_CN")
            if suffix == '.srt':
                srt_path = path_obj
            else:
                srt_path = Path(f"{audio_path}.srt")

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
            
            # Smart Scaling Logic
            scale_factor = style_options.get('_smart_scale_factor', 1.0)
            
            base_font_size = style_options.get('font_size', 24)
            font_size = int(base_font_size * scale_factor)
            
            font_color = style_options.get('font_color', '&H00FFFFFF')
            bold = -1 if style_options.get('bold', False) else 0        # ASS: -1 = true, 0 = false
            italic = -1 if style_options.get('italic', False) else 0
            
            base_outline = int(style_options.get('outline', 2))
            outline = max(1, int(base_outline * scale_factor)) if base_outline > 0 else 0
            
            base_shadow = int(style_options.get('shadow', 0))
            shadow = max(1, int(base_shadow * scale_factor)) if base_shadow > 0 else 0
            
            outline_color = style_options.get('outline_color', '&H00000000')
            back_color = style_options.get('back_color', '&H80000000')
            border_style = int(style_options.get('border_style', 1))
            alignment = int(style_options.get('alignment', 2))

            # Dynamic Resolution (True Res)
            # These are already updated in VideoSynthesizer based on target_resolution
            play_res_x = style_options.get('video_width', 1920)
            play_res_y = style_options.get('video_height', 1080)

            base_margin_v = style_options.get('margin_v')
            if base_margin_v is None:
                subtitle_position_y = style_options.get('subtitle_position_y')
                if isinstance(subtitle_position_y, (int, float)):
                    clamped_y = max(0.0, min(1.0, float(subtitle_position_y)))
                    base_margin_v = max(0, round((1 - clamped_y) * play_res_y))
                else:
                    base_margin_v = 20
            margin_v = int(base_margin_v * scale_factor)
            
            logger.debug(f"Subtitle Smart Scaling: Factor={scale_factor:.2f}, Size={base_font_size}->{font_size}, MarginV={base_margin_v}->{margin_v}")

            # Dynamic Margins (2% of width, min 10px scaled)
            # Keep margins small to maximize usable subtitle width
            dynamic_margin = max(int(10 * scale_factor), int(play_res_x * 0.02))
            
            margin_l = style_options.get('margin_l', dynamic_margin)
            margin_r = style_options.get('margin_r', dynamic_margin)
            
            # WrapStyle: 2 = Only break at \N (we control all line breaks via TextShaper)
            # libass cannot auto-wrap CJK without libunibreak, so we must handle it ourselves.
            wrap_style = 2

            # Build ASS Style line
            # Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,
            #         OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut,
            #         ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,
            #         Alignment, MarginL, MarginR, MarginV, Encoding
            style_line = (
                f"Style: Default,{font_name},{font_size},{font_color},&H00000000,"
                f"{outline_color},{back_color},{bold},{italic},0,0,"
                f"100,100,0,0,{border_style},{outline},{shadow},"
                f"{alignment},{margin_l},{margin_r},{margin_v},1"
            )

            header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: {wrap_style}
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
            
            # Multi-line vertical alignment mode
            # 'bottom' = bottom line fixed at margin_v (default ASS behavior)
            # 'center' = visual center of text block stays fixed
            # 'top'    = top line fixed, expand downward (same as bottom for \an2)
            multiline_align = style_options.get('multiline_align', 'center')

            events = []
            
            # Effective width for line breaking (PlayRes minus both side margins)
            effective_width = play_res_x - margin_l - margin_r

            # Line height for multi-line splitting
            # = text bounding box (font_size) + box padding top+bottom (2*outline)
            line_step = font_size + outline * 2

            # Convert timestamp (seconds) to ASS format (H:MM:SS.cc)
            def format_time(s):
                h = int(s // 3600)
                m = int((s % 3600) // 60)
                sec = int(s % 60)
                cs = int(round((s - int(s)) * 100))
                if cs == 100: cs = 99 # Clamp
                return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

            for seg in segments:
                # Apply time offset
                seg_start = seg.start + time_offset
                seg_end = seg.end + time_offset
                
                # Filter out segments that are completely cut off (start < 0 and end < 0)
                # But allow partial overlap (start < 0 but end > 0) -> Clamp to 0
                if seg_end <= 0:
                    continue
                    
                seg_start = max(0.0, seg_start)
                
                start_ts = format_time(seg_start)
                end_ts = format_time(seg_end)
                
                # Sanitize text (SRT newlines -> ASS line breaks)
                text = seg.text.replace('\n', r'\N')

                # Smart line breaking: fit text within effective width
                text = shape(text, effective_width, font_size, font_name=font_name)
                
                # Split multi-line text into separate Dialogue events
                # to prevent background box overlap (ASS has no line-spacing control)
                sub_lines = text.split(r'\N')
                
                if len(sub_lines) <= 1:
                    # Single line — always use margin_v directly (WYSIWYG)
                    events.append(
                        f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,{margin_v},,{text}"
                    )
                else:
                    # Multi-line — emit one Dialogue per line with stacked MarginV
                    num_lines = len(sub_lines)
                    
                    for line_idx, line_text in enumerate(sub_lines):
                        # line_idx 0 = topmost line, num_lines-1 = bottommost
                        offset_from_bottom = num_lines - 1 - line_idx
                        
                        if multiline_align == 'center':
                            # Center: visual center of block stays at margin_v
                            # Offset each line symmetrically around margin_v
                            block_height = (num_lines - 1) * line_step
                            # bottommost line offset: 0, topmost: block_height
                            # shift down by half block_height to center
                            line_margin_v = margin_v + offset_from_bottom * line_step - block_height // 2
                        elif multiline_align == 'top':
                            # Top: topmost line at a fixed high position
                            top_anchor = margin_v + (num_lines - 1) * line_step
                            line_margin_v = top_anchor - line_idx * line_step
                        else:
                            # Bottom (default): bottom line at margin_v, stack upward
                            line_margin_v = margin_v + offset_from_bottom * line_step
                        
                        # Ensure non-negative
                        line_margin_v = max(0, line_margin_v)
                        events.append(
                            f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,{line_margin_v},,{line_text}"
                        )
                
            with open(ass_path, 'w', encoding='utf-8-sig') as f:
                f.write(header + "\n".join(events))
            logger.info(f"Generated ASS file: {ass_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to convert SRT to ASS: {e}")
            return False
