from pathlib import Path
from typing import Optional, Tuple
from loguru import logger
import shutil
from backend.utils.subtitle_manager import SubtitleManager
from backend.utils.text_normalizer import normalize_filename_component

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

    def normalize_artifact_names(
        self,
        media_path: Path,
        subtitle_path: Optional[str] = None,
        preferred_stem: Optional[str] = None,
    ) -> tuple[Path, Optional[str]]:
        repaired_stem = normalize_filename_component(preferred_stem or media_path.stem)
        if repaired_stem == media_path.stem:
            return media_path, subtitle_path

        repaired_media_path = media_path.with_name(f"{repaired_stem}{media_path.suffix}")
        if repaired_media_path.exists():
            logger.warning(
                f"Normalized media filename already exists, keeping original path: {repaired_media_path}"
            )
            return media_path, subtitle_path

        logger.info(f"Renaming downloaded media to normalized filename: {repaired_media_path}")
        media_path.rename(repaired_media_path)

        normalized_subtitle_path = subtitle_path
        if subtitle_path:
            subtitle_file = Path(subtitle_path)
            if subtitle_file.exists() and subtitle_file.stem == media_path.stem:
                repaired_subtitle_path = subtitle_file.with_name(
                    f"{repaired_stem}{subtitle_file.suffix}"
                )
                if not repaired_subtitle_path.exists():
                    subtitle_file.rename(repaired_subtitle_path)
                    normalized_subtitle_path = str(repaired_subtitle_path)

        return repaired_media_path, normalized_subtitle_path

    def process_local_file(self, local_source: Path, dest_dir: Path, filename: str) -> Path:
        """Move a local file to the destination directory with the correct name."""
        safe_name = normalize_filename_component(filename)
        dest_path = dest_dir / f"{safe_name}.mp4"
        
        logger.info(f"Moving local file {local_source} to {dest_path}")
        shutil.move(str(local_source), str(dest_path))
        return dest_path
