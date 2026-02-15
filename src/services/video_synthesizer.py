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
        Orchestrates the process by calling helper methods.
        """
        options = options or {}
        
        try:
            # 1. Probe & Validation
            self._validate_paths(video_path, srt_path)
            duration = self._calculate_duration(video_path, options)
            input_video, audio = self._create_input_streams(video_path, options)
            
            # 2. Build Filter Graph
            video_stream = self._apply_filters(
                input_video, 
                video_path, 
                srt_path, 
                watermark_path, 
                options
            )
            
            # 3. Configure Encoder
            output_kwargs = self._configure_encoder(options)
            
            # 4. Execute
            self._run_ffmpeg(
                 video_stream,
                 audio,
                 output_path,
                 output_kwargs,
                 duration,
                 progress_callback
            )
                
            return output_path

        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            raise
        finally:
             # Restore cleanup logic
             temp_ass = options.get('_temp_ass_path')
             if temp_ass and os.path.exists(temp_ass):
                 try:
                     os.remove(temp_ass)
                     logger.debug(f"Deleted temp subtitle: {temp_ass}")
                 except Exception as e:
                     logger.warning(f"Failed to delete temp subtitle: {e}")

    # --- Private Helpers ---

    def _validate_paths(self, video_path: str, srt_path: str):
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")
        if not os.path.exists(srt_path):
            raise FileNotFoundError(f"Subtitles not found: {srt_path}")

    def _calculate_duration(self, video_path: str, options: dict) -> float:
        trim_start = float(options.get('trim_start', 0))
        trim_end = float(options.get('trim_end', 0))
        
        duration = self._get_video_duration(video_path)
        if trim_end > 0 and trim_start >= 0:
            duration = trim_end - trim_start
        elif trim_start > 0 and duration > 0:
            duration = duration - trim_start
        return duration

    def _create_input_streams(self, video_path: str, options: dict):
        trim_start = float(options.get('trim_start', 0))
        trim_end = float(options.get('trim_end', 0))
        
        input_kwargs = {}
        if trim_start > 0:
            input_kwargs['ss'] = trim_start
        if trim_end > 0:
            input_kwargs['to'] = trim_end
            
        input_video = ffmpeg.input(video_path, **input_kwargs)
        return input_video.video, input_video.audio

    def _apply_filters(self, video_stream, video_path, srt_path, watermark_path, options):
        # 1. Crop
        crop_w = options.get('crop_w')
        if crop_w is not None:
            video_stream = video_stream.filter(
                'crop', 
                w=crop_w, 
                h=options.get('crop_h'), 
                x=options.get('crop_x'), 
                y=options.get('crop_y')
            )

        # 2. Watermark
        if watermark_path and os.path.exists(watermark_path):
            wm_input = ffmpeg.input(watermark_path)
            scale = float(options.get('wm_scale', 1.0))
            opacity = float(options.get('wm_opacity', 1.0))
            
            wm_processed = wm_input.filter('scale', w=f'iw*{scale}', h=f'ih*{scale}')
            if opacity < 1.0:
                wm_processed = wm_processed.filter('format', 'rgba').filter('colorchannelmixer', aa=opacity)
            
            video_stream = video_stream.overlay(
                wm_processed, 
                x=options.get('wm_x', '10'), 
                y=options.get('wm_y', '10')
            )

        # 3. Subtitles
        # Check resolution for font scaling
        width = options.get('video_width')
        height = options.get('video_height')

        if not width or not height:
            width, height = self._probe_resolution(video_path)
            logger.info(f"Probed video resolution for subtitles: {width}x{height}")
        else:
            logger.info(f"Using provided video resolution: {width}x{height}")

        # Override resolution if cropped
        crop_w = options.get('crop_w')
        crop_h = options.get('crop_h')
        if crop_w is not None and crop_h is not None:
             width = int(crop_w)
             height = int(crop_h)
             logger.info(f"Resolution updated to cropped size: {width}x{height}")

        options['video_width'] = width
        options['video_height'] = height

        # Convert SRT to ASS
        import uuid
        temp_ass = os.path.abspath(f"temp_sub_{uuid.uuid4().hex[:8]}.ass")
        try:
             # Calculate offset
            trim_start = float(options.get('trim_start', 0))
            sub_offset = -trim_start if trim_start > 0 else 0.0
            
            from src.utils.subtitle_manager import SubtitleManager
            SubtitleManager.convert_srt_to_ass(srt_path, temp_ass, options, time_offset=sub_offset)
            
            # Use relative path for filter to avoid escaping hell
            video_stream = video_stream.filter('subtitles', os.path.basename(temp_ass))
            
            # Store temp path in options for cleanup later (hacky but functional for now)
            options['_temp_ass_path'] = temp_ass
            
        except Exception as e:
            logger.error(f"Subtitle prep failed: {e}")
            raise
            
        return video_stream

    def _probe_resolution(self, video_path):
        try:
            from src.config import settings
            probe = ffmpeg.probe(video_path, cmd=settings.FFPROBE_PATH)
            video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            w = int(video_info['width'])
            h = int(video_info['height'])
            tags = video_info.get('tags', {})
            if int(tags.get('rotate', 0)) in [90, 270, -90, -270]:
                w, h = h, w
            return w, h
        except:
            return 1920, 1080

    def _configure_encoder(self, options):
        crf = options.get('crf', 23)
        preset = options.get('preset', 'medium')
        use_gpu = options.get('use_gpu', True)
        
        nvenc_ok = use_gpu and self._detect_nvenc()
        
        if nvenc_ok:
            nvenc_preset_map = {
                'slow': 'p6', 'medium': 'p4', 'fast': 'p2',
                'veryslow': 'p7', 'ultrafast': 'p1',
            }
            return {
                'vcodec': 'h264_nvenc',
                'acodec': 'aac',
                'rc': 'vbr',
                'cq': crf,
                'b:v': '0',
                'preset': nvenc_preset_map.get(preset, 'p4'),
                'tune': 'hq',
                'movflags': 'faststart',
            }
        else:
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
                output_kwargs['x264-params'] = ":".join(x264_params)
                logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}, x264-params={output_kwargs['x264-params']}")
            else:
                logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}")
            
            return output_kwargs

    def _run_ffmpeg(self, video_stream, audio_stream, output_path, output_kwargs, duration, progress_callback):
        from src.config import settings
        import shutil
        
        out = ffmpeg.output(video_stream, audio_stream, output_path, **output_kwargs)
        out = out.global_args('-hide_banner', '-progress', 'pipe:1').overwrite_output()
        cmd_args = out.compile(cmd=settings.FFMPEG_PATH)
        
        logger.info(f"FFmpeg CMD: {' '.join(cmd_args)}")
        
        try:
            process = subprocess.Popen(
                cmd_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                encoding='utf-8',
                errors='replace'
            )
            
            # Progress loop
            last_report = 0.0
            current_pct = 0
            current_speed = ""
            
            for line in process.stdout:
                line = line.strip()
                if line.startswith("out_time_us=") and duration > 0:
                    try:
                         us = int(line.split("=", 1)[1])
                         current_pct = min(int((us / 1_000_000 / duration) * 100), 99)
                    except: pass
                
                elif line.startswith("speed="):
                    try:
                        raw = line.split("=", 1)[1].strip()
                        if raw and raw != "N/A":
                            current_speed = f" ({raw})"
                    except: pass

                elif line == "progress=continue":
                    # Report throttle
                    now = time.monotonic()
                    if progress_callback and (now - last_report >= 3.0) and current_pct > 0:
                        progress_callback(current_pct, f"Encoding{current_speed}... {current_pct}%")
                        last_report = now
                
                elif line == "progress=end":
                    break
            
            process.wait()
            if process.returncode != 0:
                raise RuntimeError(f"FFmpeg failed with code {process.returncode}")

        except Exception as e:
            logger.error(f"FFmpeg execution failed: {e}")
            if 'process' in locals() and process.poll() is None:
                process.kill()
            raise
        finally:
             pass

