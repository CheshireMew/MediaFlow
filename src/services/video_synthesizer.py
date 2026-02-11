import os
import logging
import ffmpeg
from psd_tools import PSDImage

# Configure logging
logger = logging.getLogger(__name__)

class VideoSynthesizer:
    def __init__(self):
        self.logger = logger  # Use module logger

    from PIL import Image

    def process_watermark(self, input_path: str, output_path: str = None) -> str:
        """
        Process watermark (PSD or Image):
        1. Convert to PNG if needed.
        2. Trim transparent areas (Smart Crop).
        3. Save to output_path.
        """
        self.logger.info(f"Processing watermark: {input_path}")
        try:
            if not os.path.exists(input_path):
                raise FileNotFoundError(f"File not found: {input_path}")

            if not output_path:
                base, _ = os.path.splitext(input_path)
                output_path = f"{base}_trimmed.png"

            img = None
            
            # 1. Load Image
            if input_path.lower().endswith('.psd'):
                self.logger.debug("Opening PSD...")
                psd = PSDImage.open(input_path)
                img = psd.composite()
            else:
                self.logger.debug("Opening Image...")
                with Image.open(input_path) as source_img:
                    img = source_img.convert("RGBA")

            # 2. Smart Trim
            self.logger.debug("Calculating bounding box for trim...")
            bbox = img.getbbox()
            if bbox:
                self.logger.debug(f"Trimming transparent areas: {bbox}")
                img = img.crop(bbox)
            else:
                self.logger.warning("Image appears fully transparent.")

            # 3. Save
            self.logger.debug(f"Saving trimmed watermark to {output_path}...")
            img.save(output_path, format="PNG")
            
            self.logger.info(f"Watermark processed: {output_path}")
            return output_path

        except Exception as e:
            self.logger.error(f"Failed to process watermark: {e}")
            raise

    def burn_in_subtitles(self, 
                          video_path: str, 
                          srt_path: str, 
                          output_path: str, 
                          watermark_path: str = None, 
                          options: dict = None):
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
        
        # Force style string for libass
        # Note: Colors in ASS are &HAABBGGRR. White is &H00FFFFFF.
        # DEBUG: Force Top Alignment and Huge Font to verify control
        # force_style = (
        #     f"Fontname=Arial,FontSize={font_size},"
        #     f"PrimaryColour={options.get('font_color', '&H00FFFFFF')},"
        #     f"BorderStyle=1,Outline=1,Shadow=1,"
        #     f"Alignment=2,MarginL=10,MarginR=10,MarginV={margin_v}"
        # )
        
        # TEMPORARY DEBUG STYLE
        logger.warning("USING DEBUG SUBTITLE STYLE: TOP ALIGNMENT, SIZE 100")
        force_style = (
            f"Fontname=Arial,FontSize=100,"
            f"PrimaryColour={options.get('font_color', '&H00FFFFFF')},"
            f"BorderStyle=1,Outline=1,Shadow=1,"
            f"Alignment=6,MarginL=10,MarginR=10,MarginV={margin_v}"
        )
            
        try:
            # 1. Input Streams
            input_video = ffmpeg.input(video_path)
            audio = input_video.audio
            
            # 2. Watermark Filter (if exists) - Apply FIRST so subtitles are on top
            video_stream = input_video.video
            
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
                    probe = ffmpeg.probe(video_path)
                    video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
                    width = int(video_info['width'])
                    height = int(video_info['height'])
                    
                    # Handle rotation tag (iPhone videos)
                    tags = video_info.get('tags', {})
                    rotate = int(tags.get('rotate', 0))
                    if rotate in [90, 270, -90, -270]:
                        width, height = height, width
                        
                    self.logger.info(f"Probed video resolution for subtitles: {width}x{height}")
                except Exception as e:
                    self.logger.warning(f"Failed to probe video resolution: {e}. Defaulting to 1920x1080 for subtitles.")
                    width = 1920
                    height = 1080
            else:
                self.logger.info(f"Using provided video resolution: {width}x{height}")

            options['video_width'] = width
            options['video_height'] = height

            import shutil
            import uuid
            
            # Use a unique name in CWD
            temp_ass_filename = f"temp_sub_{uuid.uuid4().hex[:8]}.ass"
            temp_ass_path = os.path.abspath(temp_ass_filename)
            
            from src.utils.subtitle_manager import SubtitleManager
            
            self.logger.info(f"Converting SRT to ASS with styles: {temp_ass_path}")
            # Convert and bake styles
            SubtitleManager.convert_srt_to_ass(srt_path, temp_ass_path, options)
            
            # Pass RELATIVE path to FFmpeg filter
            # No force_style needed as ASS has it embedded
            video_stream = video_stream.filter('subtitles', temp_ass_filename)
            
            # 4. Output
            from src.config import settings
            
            # Determine x264 advanced parameters
            # Based on user feedback (Maru Tool / Dark Shikari recommendations)
            x264_params = []
            
            # --- Global Style Optimization (Applied to High & Balanced & Small if reasonable) ---
            # These affect visual "style" and don't massively cost performance compared to Ref/Analysis.
            
            # 1. AQ Mode 2 (Auto-Variance AQ) - Critical for anime/flat areas
            if crf <= 28:
                x264_params.append("aq-mode=2")
                x264_params.append("deblock=1:1")       # User recomm: 1:1 (Deblocking)
                x264_params.append("psy-rd=0.3:0.0")    # User recomm: 0.3:0 (Psy-RD)
                x264_params.append("qcomp=0.5")         # User recomm: 0.5 (MB-Tree)
                x264_params.append("aq-strength=0.8")   # User recomm: 0.8
                x264_params.append("scenecut=60")

            # --- Performance/Efficiency Tiering ---
            
            # Tier A: High Quality (CRF <= 20 or Slow Preset)
            if crf <= 20 or preset in ['slow', 'veryslow']:
                x264_params.append("bframes=6")         # Max efficiency
                x264_params.append("ref=6")             # Max reference
                x264_params.append("rc-lookahead=60")
                x264_params.append("min-keyint=1") 

            # Tier B: Balanced (CRF <= 24)
            elif crf <= 24:
                 x264_params.append("bframes=4")        # Good efficiency
                 x264_params.append("ref=4")            # Balanced ref
                 x264_params.append("rc-lookahead=40")
                 x264_params.append("min-keyint=1")

            # Tier C: Fast/Small (Standard Defaults)
            else:
                 x264_params.append("bframes=3")
            
            x264_params_str = ":".join(x264_params)
            
            output_kwargs = {
                'vcodec': 'libx264',
                'acodec': 'aac',
                'crf': crf,
                'preset': preset,
                'movflags': 'faststart'
            }
            
            if x264_params_str:
                self.logger.info(f"Using advanced x264 params: {x264_params_str}")
                output_kwargs['x264-params'] = x264_params_str

            out = ffmpeg.output(
                video_stream, 
                audio, 
                output_path, 
                **output_kwargs
            ).global_args('-hide_banner', '-loglevel', 'error')
            
            self.logger.info(f"Starting FFmpeg synthesis: {output_path}")
            # Ensure overwrite
            # Use 'cmd' to specify the executable path
            try:
                out.run(cmd=settings.FFMPEG_PATH, overwrite_output=True, capture_stdout=True, capture_stderr=True)
                self.logger.info("FFmpeg synthesis completed.")
                return output_path
            finally:
                # Cleanup temp subtitle file (temp_ass_path is absolute)
                if os.path.exists(temp_ass_path):
                    try:
                        os.remove(temp_ass_path)
                        self.logger.debug(f"Deleted temp subtitle file: {temp_ass_path}")
                    except Exception as e:
                        self.logger.warning(f"Failed to delete temp subtitle: {e}")

        except ffmpeg.Error as e:
            # Capture stderr for debugging
            error_msg = e.stderr.decode('utf8') if e.stderr else str(e)
            self.logger.error(f"FFmpeg error: {error_msg}")
            raise RuntimeError(f"FFmpeg encoding failed: {error_msg}")
        except Exception as e:
            self.logger.error(f"Synthesis failed: {e}")
            raise

video_synthesizer = VideoSynthesizer()
