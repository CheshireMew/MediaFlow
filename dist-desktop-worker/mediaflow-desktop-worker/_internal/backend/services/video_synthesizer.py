import os
import subprocess
import tempfile
import uuid
import shutil
import time
from pathlib import Path
from loguru import logger
import ffmpeg
from backend.config import settings
from backend.services.video.media_prober import MediaProber
from backend.services.video.watermark_processor import WatermarkProcessor
from backend.utils.font_assets import stage_font_files
from backend.utils.subtitle_manager import SubtitleManager



class VideoSynthesizer:
    def __init__(self, enhancer_service=None):
        self._enhancer_service = enhancer_service




    def process_watermark(self, input_path: str, output_path: str = None) -> str:
        return WatermarkProcessor.process_watermark(input_path, output_path)


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

        # ── SR Pre-processing ──────────────────────────────────
        # If target_resolution starts with 'sr_', upscale raw video FIRST,
        # then burn subtitles at the higher resolution (so text stays sharp).
        temp_sr_path = None
        target_res = options.get('target_resolution', 'original')

        if target_res.startswith('sr_') and settings.ENABLE_EXPERIMENTAL_PREPROCESSING:
            # Format: 'sr_4x' OR 'sr_basicvsr_4x' OR 'sr_realesrgan_4x'
            parts = target_res.split('_')
            
            sr_scale = 4
            method = "realesrgan"
            
            # Simple parsing logic
            if len(parts) == 2:
                # sr_4x
                try:
                    sr_scale = int(parts[1].replace('x', ''))
                except (ValueError, TypeError): pass
            elif len(parts) >= 3:
                # sr_basicvsr_4x
                if parts[1] in ['realesrgan', 'basicvsr']:
                    method = parts[1]
                    try:
                         sr_scale = int(parts[2].replace('x', ''))
                    except (ValueError, TypeError): pass
                else:
                    try:
                        sr_scale = int(parts[1].replace('x', ''))
                    except (ValueError, TypeError): pass

            enhancer = self._enhancer_service

            if enhancer is None:
                logger.warning("Enhancer service is unavailable, falling back to original resolution")
                options['target_resolution'] = 'original'
            elif not enhancer.is_available(method):
                logger.warning(f"{method} enhancer not available, falling back to original resolution")
                options['target_resolution'] = 'original'
            else:
                temp_dir = tempfile.gettempdir()
                temp_sr_path = os.path.join(temp_dir, f"sr_{method}_{sr_scale}x_{os.path.basename(video_path)}")

                logger.info(f"SR Pre-processing: Upscaling {video_path} by {sr_scale}x using {method}")

                def sr_progress(percent, msg):
                    if progress_callback:
                        # SR phase = 0-50% of total
                        progress_callback(percent * 0.5, f"[SR] {msg}")

                enhancer.upscale(
                    input_path=video_path,
                    output_path=temp_sr_path,
                    scale=sr_scale,
                    method=method,
                    progress_callback=sr_progress,
                )

                # Switch to upscaled video for subsequent processing
                video_path = temp_sr_path
                options['target_resolution'] = 'original'  # Already upscaled, no FFmpeg scale needed

                # Wrap original progress_callback to offset 50-100%
                original_callback = progress_callback
                if original_callback:
                    progress_callback = lambda p, m: original_callback(50 + p * 0.5, m)
        elif target_res.startswith('sr_'):
            logger.warning(
                "Experimental SR preprocessing is disabled in this build; falling back to original resolution"
            )
            options['target_resolution'] = 'original'

        # ── End SR Pre-processing ──────────────────────────────
        
        temp_ass = None
        temp_fonts_dir = None
        try:
            # 1. Probe & Validation
            self._validate_paths(video_path, srt_path)
            duration = self._calculate_duration(video_path, options)
            input_video, audio = self._create_input_streams(video_path, options)
            
            # 2. Build Filter Graph
            video_stream, temp_ass, temp_fonts_dir = self._apply_filters(
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
             # Cleanup temp subtitle file
             if temp_ass and os.path.exists(temp_ass):
                 try:
                     os.remove(temp_ass)
                     logger.debug(f"Deleted temp subtitle: {temp_ass}")
                 except Exception as e:
                     logger.warning(f"Failed to delete temp subtitle: {e}")
             if temp_fonts_dir and os.path.exists(temp_fonts_dir):
                 try:
                     shutil.rmtree(temp_fonts_dir)
                     logger.debug(f"Deleted temp fonts dir: {temp_fonts_dir}")
                 except Exception as e:
                     logger.warning(f"Failed to delete temp fonts dir: {e}")
             # Clean up temp SR file
             if temp_sr_path and os.path.exists(temp_sr_path):
                 try:
                     os.remove(temp_sr_path) 
                     logger.debug(f"Deleted temp SR file: {temp_sr_path}")
                 except Exception as e:
                     logger.warning(f"Failed to delete temp SR file: {e}")

    # --- Private Helpers ---

    def _validate_paths(self, video_path: str, srt_path: str):
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")
        if not os.path.exists(srt_path):
            raise FileNotFoundError(f"Subtitles not found: {srt_path}")

    def _calculate_duration(self, video_path: str, options: dict) -> float:
        trim_start = float(options.get('trim_start', 0))
        trim_end = float(options.get('trim_end', 0))
        
        duration = MediaProber.get_duration(video_path)
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
        audio_stream = input_video.audio if MediaProber.has_audio(video_path) else None
        return input_video.video, audio_stream

    def _resolve_render_dimensions(self, video_path: str, options: dict):
        try:
            probed_w, probed_h = MediaProber.probe_resolution(video_path)
        except Exception as e:
            logger.warning(f"Failed to probe video resolution: {e}")
            probed_w, probed_h = (
                int(options.get('video_width', 1920)),
                int(options.get('video_height', 1080)),
            )

        crop_w = options.get('crop_w')
        crop_h = options.get('crop_h')
        base_w = int(crop_w) if crop_w is not None else int(probed_w)
        base_h = int(crop_h) if crop_h is not None else int(probed_h)

        if base_w <= 0:
            base_w = int(options.get('video_width', 1920))
        if base_h <= 0:
            base_h = int(options.get('video_height', 1080))

        target_res = options.get('target_resolution', 'original')
        force_hd = options.get('force_hd')
        if target_res in ['720p', '1080p'] or force_hd:
            target_h = 720 if (target_res == '720p' or force_hd) else 1080
            scale_factor = target_h / base_h if base_h > 0 else 1.0
            render_w = int(base_w * scale_factor) if base_h > 0 else int(1280 * (target_h / 720))
            if render_w % 2 != 0:
                render_w -= 1
            return render_w, target_h, scale_factor

        return base_w, base_h, 1.0

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

        # 2. Resolution Scaling & Smart Scaling
        # Must be applied before subtitles so text is rendered at high res
        target_res = options.get('target_resolution', 'original')
        render_width, render_height, scale_factor = self._resolve_render_dimensions(
            video_path,
            options,
        )
        
        if target_res in ['720p', '1080p']:
            target_h = 720 if target_res == '720p' else 1080
            logger.info(f"Target resolution enabled: Scaling video to Height={target_h} (Width=Auto)")
            video_stream = video_stream.filter('scale', w=-2, h=target_h)
            logger.info(
                f"Resolved render size for synthesis: {render_width}x{render_height} "
                f"(scale={scale_factor:.2f})"
            )

        elif options.get('force_hd'): # Backward compatibility
             logger.info("Legacy Force HD enabled: Scaling to 720p")
             video_stream = video_stream.filter('scale', w=-2, h=720)
             logger.info(
                 f"Resolved render size for synthesis: {render_width}x{render_height} "
                 f"(scale={scale_factor:.2f})"
             )


        # 3. Watermark
        if watermark_path and os.path.exists(watermark_path):
            wm_input = ffmpeg.input(watermark_path)
            
            # Apply Smart Scaling to Watermark
            # Base scale * Smart Scale Factor
            user_scale = float(options.get('wm_scale', 1.0))
            final_scale = user_scale * scale_factor
            relative_width = options.get('wm_relative_width')
            if relative_width is not None:
                try:
                    from PIL import Image

                    with Image.open(watermark_path) as watermark_image:
                        watermark_width, _ = watermark_image.size

                    if watermark_width > 0:
                        user_scale = (render_width * float(relative_width)) / watermark_width
                        final_scale = user_scale
                except Exception as e:
                    logger.warning(f"Failed to resolve relative watermark width: {e}")
            
            opacity = float(options.get('wm_opacity', 1.0))
            
            logger.info(f"Watermark Scale: {user_scale} -> {final_scale:.2f} (Smart Scaling)")
            
            wm_processed = wm_input.filter('scale', w=f'iw*{final_scale}', h=f'ih*{final_scale}')
            if opacity < 1.0:
                wm_processed = wm_processed.filter('format', 'rgba').filter('colorchannelmixer', aa=opacity)

            x_expr = options.get('wm_x')
            y_expr = options.get('wm_y')
            if x_expr is None and options.get('wm_pos_x') is not None:
                x_expr = f"main_w*{float(options.get('wm_pos_x'))}-w/2"
            if y_expr is None and options.get('wm_pos_y') is not None:
                y_expr = f"main_h*{float(options.get('wm_pos_y'))}-h/2"
            
            video_stream = video_stream.overlay(
                wm_processed, 
                x=x_expr or '10', 
                y=y_expr or '10'
            )

        # 4. Subtitles (conditionally skip if user toggled off)
        temp_ass = None
        temp_fonts_dir = None
        if options.get('skip_subtitles'):
            logger.info("Subtitles disabled by user, skipping subtitle burn-in")
        else:
            options['video_width'] = render_width
            options['video_height'] = render_height
            
            # Inject Smart Scale Factor into options for SubtitleWriter
            if scale_factor != 1.0:
                options['_smart_scale_factor'] = scale_factor
                logger.info(f"Injected _smart_scale_factor: {scale_factor}")

            # Convert SRT to ASS
            temp_ass = os.path.abspath(f"temp_sub_{uuid.uuid4().hex[:8]}.ass")
            try:
                 # Calculate offset
                trim_start = float(options.get('trim_start', 0))
                sub_offset = -trim_start if trim_start > 0 else 0.0
                
                SubtitleManager.convert_srt_to_ass(srt_path, temp_ass, options, time_offset=sub_offset)

                temp_fonts_dir_path = stage_font_files(
                    str(options.get('font_name', '')).strip(),
                    Path(os.path.abspath(f"temp_fonts_{uuid.uuid4().hex[:8]}")),
                )
                temp_fonts_dir = str(temp_fonts_dir_path) if temp_fonts_dir_path else None

                subtitle_filter_kwargs = {}
                if temp_fonts_dir:
                    subtitle_filter_kwargs['fontsdir'] = os.path.basename(temp_fonts_dir)

                # Use relative paths for filter to avoid escaping hell on Windows
                video_stream = video_stream.filter(
                    'subtitles',
                    os.path.basename(temp_ass),
                    **subtitle_filter_kwargs,
                )
                
            except Exception as e:
                logger.error(f"Subtitle prep failed: {e}")
                raise
            
        return video_stream, temp_ass, temp_fonts_dir



    def _configure_encoder(self, options):
        crf = options.get('crf', 23)
        preset = options.get('preset', 'medium')
        use_gpu = options.get('use_gpu', True)
        
        # Universal compatibility flags for all encoders
        universal_flags = {
            'pix_fmt': 'yuv420p',
            'profile:v': 'high',
            'color_primaries': 'bt709',
            'color_trc': 'bt709',
            'colorspace': 'bt709',
            'r': '30',              # Force 30fps to avoid bizarre framerate rounding
            'brand': 'mp42',        # Or 'isom' for compatibility
            'movflags': 'faststart+write_colr' # write_colr helps Safari/iOS
        }
        
        nvenc_ok = use_gpu and MediaProber.detect_nvenc()
        
        if nvenc_ok:
            nvenc_preset_map = {
                'slow': 'p6', 'medium': 'p4', 'fast': 'p2',
                'veryslow': 'p7', 'ultrafast': 'p1',
            }
            kwargs = {
                'vcodec': 'h264_nvenc',
                'acodec': 'aac',
                'rc': 'vbr',
                'cq': crf,
                'b:v': '0',
                'preset': nvenc_preset_map.get(preset, 'p4'),
                'tune': 'hq',
                **universal_flags
            }
            logger.info(f"Using GPU (h264_nvenc): crf={crf}, preset={preset}")
            return kwargs
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
                **universal_flags
            }
            if x264_params:
                output_kwargs['x264-params'] = ":".join(x264_params)
                logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}, x264-params={output_kwargs['x264-params']}")
            else:
                logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}")
            
            return output_kwargs

    def _run_ffmpeg(self, video_stream, audio_stream, output_path, output_kwargs, duration, progress_callback):
        output_streams = [video_stream]
        if audio_stream is not None:
            output_streams.append(audio_stream)
        else:
            logger.info("No audio stream detected; exporting synthesized video without audio")

        out = ffmpeg.output(*output_streams, output_path, **output_kwargs)
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
            error_log = []
            
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                
                if line.startswith("out_time_us=") and duration > 0:
                    try:
                         us = int(line.split("=", 1)[1])
                         current_pct = min(int((us / 1_000_000 / duration) * 100), 99)
                    except (ValueError, TypeError): pass
                
                elif line.startswith("speed="):
                    try:
                        raw = line.split("=", 1)[1].strip()
                        if raw and raw != "N/A":
                            current_speed = f" ({raw})"
                    except (ValueError, IndexError): pass

                elif line == "progress=continue":
                    # Report throttle
                    now = time.monotonic()
                    if progress_callback and (now - last_report >= 3.0) and current_pct > 0:
                        progress_callback(current_pct, f"Encoding{current_speed}... {current_pct}%")
                        last_report = now
                
                elif line == "progress=end":
                    break
                elif not line.startswith(("frame=", "fps=", "stream_0", "bitrate=", "total_size=", "out_time=", "dup_frames=", "drop_frames=")):
                    # Keep last 20 lines of actual logs
                    error_log.append(line)
                    if len(error_log) > 20:
                        error_log.pop(0)
            
            process.wait()
            if process.returncode != 0:
                err_msg = "\n".join(error_log)
                raise RuntimeError(f"FFmpeg failed with code {process.returncode}:\n{err_msg}")

        except Exception as e:
            logger.error(f"FFmpeg execution failed: {e}")
            if 'process' in locals() and process.poll() is None:
                process.kill()
            raise
