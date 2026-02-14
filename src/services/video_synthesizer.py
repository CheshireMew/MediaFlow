import os
import subprocess
import time
from loguru import logger
import ffmpeg
from PIL import Image
from psd_tools import PSDImage


class VideoSynthesizer:
    _nvenc_available: bool | None = None  # Cached detection result

    def __init__(self):
        pass

    @staticmethod
    def _detect_nvenc() -> bool:
        """Detect if h264_nvenc encoder is available in ffmpeg."""
        if VideoSynthesizer._nvenc_available is not None:
            return VideoSynthesizer._nvenc_available
        try:
            from src.config import settings
            result = subprocess.run(
                [settings.FFMPEG_PATH, "-hide_banner", "-encoders"],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10
            )
            VideoSynthesizer._nvenc_available = "h264_nvenc" in result.stdout
            logger.info(f"NVENC detection: {'available' if VideoSynthesizer._nvenc_available else 'not available'}")
        except Exception as e:
            logger.warning(f"NVENC detection failed: {e}")
            VideoSynthesizer._nvenc_available = False
        return VideoSynthesizer._nvenc_available

    @staticmethod
    def _get_video_duration(video_path: str) -> float:
        """Get video duration in seconds using ffprobe."""
        try:
            from src.config import settings
            probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
            return float(probe['format']['duration'])
        except Exception:
            return 0.0

    def process_watermark(self, input_path: str, output_path: str = None) -> str:
        """
        Process watermark (PSD or Image):
        1. Convert to PNG if needed.
        2. Trim transparent areas (Smart Crop).
        3. Save to output_path.
        """
        logger.info(f"Processing watermark: {input_path}")
        try:
            if not os.path.exists(input_path):
                raise FileNotFoundError(f"File not found: {input_path}")

            if not output_path:
                base, _ = os.path.splitext(input_path)
                output_path = f"{base}_trimmed.png"

            img = None
            
            # 1. Load Image
            if input_path.lower().endswith('.psd'):
                logger.debug("Opening PSD...")
                psd = PSDImage.open(input_path)
                img = psd.composite()
            else:
                logger.debug("Opening Image...")
                with Image.open(input_path) as source_img:
                    img = source_img.convert("RGBA")

            # 2. Smart Trim
            logger.debug("Calculating bounding box for trim...")
            bbox = img.getbbox()
            if bbox:
                logger.debug(f"Trimming transparent areas: {bbox}")
                img = img.crop(bbox)
            else:
                logger.warning("Image appears fully transparent.")

            # 3. Save
            logger.debug(f"Saving trimmed watermark to {output_path}...")
            img.save(output_path, format="PNG")
            
            logger.info(f"Watermark processed: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Failed to process watermark: {e}")
            raise

    def burn_in_subtitles(self, 
                          video_path: str, 
                          srt_path: str, 
                          output_path: str, 
                          watermark_path: str = None, 
                          options: dict = None,
                          progress_callback=None):
        """
        Burn subtitles and optional watermark into video using FFmpeg.
        
        options:
          - crf (int): Quality (0-51, lower is better). Default 23.
          - preset (str): Speed/Compression balance (ultrafast to veryslow). Default medium.
          - font_size (int): Subtitle font size.
          - font_color (str): Subtitle font color (e.g., &H00FFFFFF).
          - margin_v (int): Subtitle vertical margin.
          - wm_x (str/int): Watermark X position.
          - wm_y (str/int): Watermark Y position.
          - wm_scale (float): Watermark scale (0.1 to 1.0).
          - wm_opacity (float): Watermark opacity (0.0 to 1.0).
        """
        options = options or {}
        crf = options.get('crf', 23)
        preset = options.get('preset', 'medium')
        
        # Subtitle Style
        font_size = options.get('font_size', 24)
        margin_v = options.get('margin_v', 20)
        
        # Note: Subtitle styling is now handled via ASS file (convert_srt_to_ass)
        # The old force_style approach has been removed.
            
        try:
            # 1. Input Streams (with Trimming)
            trim_start = float(options.get('trim_start', 0))
            trim_end = float(options.get('trim_end', 0))
            
            input_kwargs = {}
            if trim_start > 0:
                input_kwargs['ss'] = trim_start
            if trim_end > 0:
                input_kwargs['to'] = trim_end
                
            logger.info(f"Input Args: {input_kwargs}")
            
            input_video = ffmpeg.input(video_path, **input_kwargs)
            audio = input_video.audio
            video_stream = input_video.video
            
            # 1.5 Crop Filter (Apply BEFORE Scaling/Watermarks/Subtitles)
            crop_x = options.get('crop_x')
            crop_y = options.get('crop_y')
            crop_w = options.get('crop_w')
            crop_h = options.get('crop_h')
            
            if all(v is not None for v in [crop_w, crop_h]):
                logger.info(f"Applying Crop: {crop_w}x{crop_h} at ({crop_x},{crop_y})")
                video_stream = video_stream.filter('crop', w=crop_w, h=crop_h, x=crop_x, y=crop_y)

            
            # ... (Watermark logic remains the same) ...

            # 2. Watermark Filter (if exists) - Apply FIRST so subtitles are on top
            if watermark_path and os.path.exists(watermark_path):
                wm_input = ffmpeg.input(watermark_path)
                
                # Combine Scale & Opacity
                scale = float(options.get('wm_scale', 1.0))
                opacity = float(options.get('wm_opacity', 1.0))
                
                # Watermark processing chain
                # Scale relative to input width/height (iw/ih)
                wm_processed = wm_input.filter('scale', w=f'iw*{scale}', h=f'ih*{scale}')
                
                # Apply opacity if needed
                if opacity < 1.0:
                    wm_processed = wm_processed.filter('format', 'rgba').filter('colorchannelmixer', aa=opacity)
                
                # Overlay Position
                x = options.get('wm_x', '10')
                y = options.get('wm_y', '10')
                
                # Overlay onto the video
                video_stream = video_stream.overlay(wm_processed, x=x, y=y)
            
            # 3. Subtitle Filter - Apply LAST
            # Escape path for FFmpeg filter graph
            # 1. Replace backslashes with forward slashes (Windows compatibility)
            # 2. Escape drive letter colon (:) -> \:
            # 3. Escape special filter characters: [ ] ' , ;
            
            # 3. Subtitle Filter - Apply LAST
            # Get video dimensions for dynamic PlayRes (True Resolution)
            # This ensures font size is proportionally correct regardless of resolution (720p vs 4K)
            
            width = options.get('video_width')
            height = options.get('video_height')
            
            if not width or not height:
                try:
                    # Use configured ffprobe path
                    from src.config import settings
                    probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
                    video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
                    width = int(video_info['width'])
                    height = int(video_info['height'])
                    
                    # Handle rotation tag (iPhone videos)
                    tags = video_info.get('tags', {})
                    rotate = int(tags.get('rotate', 0))
                    if rotate in [90, 270, -90, -270]:
                        width, height = height, width
                        
                    logger.info(f"Probed video resolution for subtitles: {width}x{height}")
                except Exception as e:
                    logger.warning(f"Failed to probe video resolution: {e}. Defaulting to 1920x1080 for subtitles.")
                    width = 1920
                    height = 1080
            else:
                logger.info(f"Using provided video resolution: {width}x{height}")

            # Override resolution if cropped
            if all(v is not None for v in [crop_w, crop_h]):
                 width = int(crop_w)
                 height = int(crop_h)
                 logger.info(f"Resolution updated to cropped size: {width}x{height}")

            options['video_width'] = width
            options['video_height'] = height

            import shutil
            import uuid
            
            # Use a unique name in CWD
            temp_ass_filename = f"temp_sub_{uuid.uuid4().hex[:8]}.ass"
            temp_ass_path = os.path.abspath(temp_ass_filename)
            
            from src.utils.subtitle_manager import SubtitleManager
            
            logger.info(f"Converting SRT to ASS with styles: {temp_ass_path}")
            
            # Calculate subtitle offset (negative of trim_start)
            # If we trim start by 10s, subtitles must be shifted back by 10s.
            sub_offset = -trim_start if trim_start > 0 else 0.0
            
            # Convert and bake styles with time offset
            SubtitleManager.convert_srt_to_ass(srt_path, temp_ass_path, options, time_offset=sub_offset)
            
            # Pass RELATIVE path to FFmpeg filter
            # Why relative? Because FFmpeg filter escaping for absolute paths on Windows is hell.
            # We assume temp_ass_filename is in CWD.
            video_stream = video_stream.filter('subtitles', temp_ass_filename)
            
            # 4. Output
            from src.config import settings
            
            use_gpu = options.get('use_gpu', True)
            nvenc_ok = use_gpu and self._detect_nvenc()
            
            if nvenc_ok:
                # --- GPU Path: NVENC ---
                # Map quality tiers to NVENC presets (p1=fastest, p7=best)
                nvenc_preset_map = {
                    'slow': 'p6', 'medium': 'p4', 'fast': 'p2',
                    'veryslow': 'p7', 'ultrafast': 'p1',
                }
                output_kwargs = {
                    'vcodec': 'h264_nvenc',
                    'acodec': 'aac',
                    'rc': 'vbr',
                    'cq': crf,
                    'b:v': '0',
                    'preset': nvenc_preset_map.get(preset, 'p4'),
                    'tune': 'hq',
                    'movflags': 'faststart',
                }
                logger.info(f"Using GPU (NVENC): cq={crf}, preset={output_kwargs['preset']}")
            else:
                # --- CPU Path: libx264 ---
                x264_params = []
                if crf <= 28:
                    x264_params.extend([
                        "aq-mode=2", "deblock=1:1", "psy-rd=0.3:0.0",
                        "qcomp=0.5", "aq-strength=0.8", "scenecut=60"
                    ])
                if crf <= 20 or preset in ['slow', 'veryslow']:
                    x264_params.extend(["bframes=6", "ref=6", "rc-lookahead=60", "min-keyint=1"])
                elif crf <= 24:
                    x264_params.extend(["bframes=4", "ref=4", "rc-lookahead=40", "min-keyint=1"])
                else:
                    x264_params.append("bframes=3")
                
                output_kwargs = {
                    'vcodec': 'libx264',
                    'acodec': 'aac',
                    'crf': crf,
                    'preset': preset,
                    'movflags': 'faststart',
                }
                if x264_params:
                    x264_params_str = ":".join(x264_params)
                    output_kwargs['x264-params'] = x264_params_str
                    logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}, x264-params={x264_params_str}")
                else:
                    logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}")
            
            # Build ffmpeg command via ffmpeg-python, then run with subprocess for progress
            out = ffmpeg.output(
                video_stream, 
                audio, 
                output_path, 
                **output_kwargs
            ).global_args('-hide_banner', '-progress', 'pipe:1').overwrite_output()
            
            cmd_args = out.compile(cmd=settings.FFMPEG_PATH)
            
            # Get total duration for progress calculation
            duration = self._get_video_duration(video_path)
            if trim_end > 0 and trim_start >= 0:
                duration = trim_end - trim_start
            elif trim_start > 0 and duration > 0:
                duration = duration - trim_start
            
            logger.info(f"Starting FFmpeg synthesis: {output_path} (duration={duration:.1f}s, encoder={'nvenc' if nvenc_ok else 'x264'})")
            
            try:
                process = subprocess.Popen(
                    cmd_args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, # Merge stderr into stdout to avoid pipe deadlock
                    universal_newlines=True,
                    encoding='utf-8',
                    errors='replace'
                )
                
                last_report_time = 0.0
                current_pct = 0
                current_speed = ""
                
                # Parse progress from stdout (-progress pipe:1)
                # Format: key=value pairs, one per line, blocks separated by "progress=continue"
                for line in process.stdout:
                    line = line.strip()
                    
                    if line.startswith("out_time_us=") and duration > 0:
                        try:
                            current_us = int(line.split("=", 1)[1])
                            current_sec = current_us / 1_000_000
                            current_pct = min(int((current_sec / duration) * 100), 99)
                        except ValueError:
                            pass
                    
                    elif line.startswith("speed="):
                        raw = line.split("=", 1)[1].strip()
                        if raw and raw != "N/A":
                            current_speed = f" ({raw})"
                    
                    elif line == "progress=end":
                        break
                    
                    elif line == "progress=continue" and progress_callback and current_pct > 0:
                        # End of a progress block — report if throttle allows
                        now = time.monotonic()
                        if now - last_report_time >= 3.0:
                            progress_callback(current_pct, f"Encoding{current_speed}... {current_pct}%")
                            last_report_time = now
                
                process.wait()
                
                if process.returncode != 0:
                    # stderr is already merged into stdout, so we can't read it separately.
                    # We rely on the log file or the fact that we processed the output.
                    # But since we consumed stdout in the loop, we might not have the error message handy 
                    # unless we saved the last few lines.
                    raise RuntimeError(f"FFmpeg failed (code {process.returncode})")
                
                logger.info("FFmpeg synthesis completed.")
                return output_path
                
            finally:
                # Cleanup temp subtitle file
                if os.path.exists(temp_ass_path):
                    try:
                        os.remove(temp_ass_path)
                        logger.debug(f"Deleted temp subtitle file: {temp_ass_path}")
                    except Exception as e:
                        logger.warning(f"Failed to delete temp subtitle: {e}")

        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            raise


