"""
Subtitle Parser — VTT→SRT conversion and SRT parsing.

Extracted from SubtitleManager to follow Single Responsibility Principle.
"""
from pathlib import Path
from typing import List
import re
from loguru import logger
from src.models.schemas import SubtitleSegment


class SubtitleParser:
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
    def parse_srt(srt_content: str) -> List[SubtitleSegment]:
        """Parse SRT content into SubtitleSegment list."""
        segments = []
        blocks = re.split(r'\n\s*\n', srt_content.strip())
        
        for block in blocks:
            lines = block.strip().split('\n')
            if len(lines) < 3:
                continue
                
            # Skip index line (lines[0])
            
            # Parse timestamp: HH:MM:SS,mmm or MM:SS,mmm --> ...
            time_line = lines[1]
            times = re.findall(r'(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})', time_line)
            if len(times) != 2:
                continue
                
            def to_seconds(t):
                h = int(t[0]) if t[0] else 0
                return h*3600 + int(t[1])*60 + int(t[2]) + int(t[3])/1000
                
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
