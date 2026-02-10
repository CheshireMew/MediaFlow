from pathlib import Path
from typing import Optional, Tuple
from loguru import logger
import shutil
from src.utils.subtitle_manager import SubtitleManager

class DownloadPostProcessor:
    def process_subtitles(self, video_path: Path, download_subs: bool) -> Optional[str]:
        if not download_subs:
            return None
            
        subtitle_path = None
        
        # 1. Search for VTT files to convert
        # We prioritize language-specific VTTs
        vtt_processed = False
        for ext in ['.en.vtt', '.zh.vtt', '.vtt']:
            vtt_candidate = video_path.with_suffix(ext)
            if vtt_candidate.exists():
                logger.info(f"Found VTT file: {vtt_candidate}")
                # Convert to SRT
                srt_out = SubtitleManager.process_vtt_file(vtt_candidate)
                if srt_out and srt_out.exists():
                    # RENAME to standard .srt (Video.srt)
                    standard_srt_path = video_path.with_suffix('.srt')
                    
                    if srt_out != standard_srt_path:
                        try:
                            if standard_srt_path.exists():
                                standard_srt_path.unlink() # Overwrite existing
                            srt_out.rename(standard_srt_path)
                            subtitle_path = str(standard_srt_path)
                            logger.info(f"Renamed subtitle to standard format: {subtitle_path}")
                        except Exception as e:
                            logger.warning(f"Failed to rename subtitle: {e}")
                            subtitle_path = str(srt_out) # Fallback
                    else:
                        subtitle_path = str(srt_out)
                        
                    vtt_processed = True
                    logger.info(f"Converted and selected SRT: {subtitle_path}")
                break
        
        # 2. If no VTT converted, check for existing SRT
        if not subtitle_path:
            if video_path.with_suffix('.srt').exists():
                subtitle_path = str(video_path.with_suffix('.srt'))
                logger.info(f"Detected existing standard SRT: {subtitle_path}")
            else:
                for ext in ['.en.srt', '.zh.srt', '.srt']:
                    srt_candidate = video_path.with_suffix(ext)
                    if srt_candidate.exists():
                        subtitle_path = str(srt_candidate)
                        logger.info(f"Detected existing SRT: {subtitle_path}")
                        break
                        
        return subtitle_path

    def process_local_file(self, local_source: Path, dest_dir: Path, filename: str) -> Path:
        """Move a local file to the destination directory with the correct name."""
        safe_name = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in ' -_[]().']).rstrip()
        dest_path = dest_dir / f"{safe_name}.mp4"
        
        logger.info(f"Moving local file {local_source} to {dest_path}")
        shutil.move(str(local_source), str(dest_path))
        return dest_path
