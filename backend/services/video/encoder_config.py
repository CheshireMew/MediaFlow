from loguru import logger

from backend.services.video.media_prober import MediaProber


class EncoderConfigResolver:
    def resolve(self, options: dict):
        crf = options.get("crf", 23)
        preset = options.get("preset", "medium")
        use_gpu = options.get("use_gpu", True)
        universal_flags = {
            "pix_fmt": "yuv420p",
            "profile:v": "high",
            "color_primaries": "bt709",
            "color_trc": "bt709",
            "colorspace": "bt709",
            "r": "30",
            "brand": "mp42",
            "movflags": "faststart+write_colr",
        }

        if use_gpu and MediaProber.detect_nvenc():
            nvenc_preset_map = {
                "slow": "p6",
                "medium": "p4",
                "fast": "p2",
                "veryslow": "p7",
                "ultrafast": "p1",
            }
            logger.info(f"Using GPU (h264_nvenc): crf={crf}, preset={preset}")
            return {
                "vcodec": "h264_nvenc",
                "acodec": "aac",
                "rc": "vbr",
                "cq": crf,
                "b:v": "0",
                "preset": nvenc_preset_map.get(preset, "p4"),
                "tune": "hq",
                **universal_flags,
            }

        x264_params = []
        if crf <= 28:
            x264_params.extend([
                "aq-mode=2",
                "deblock=1:1",
                "psy-rd=0.3:0.0",
                "qcomp=0.5",
                "aq-strength=0.8",
                "scenecut=60",
            ])
        if crf <= 20 or preset in ["slow", "veryslow"]:
            x264_params.extend(["bframes=6", "ref=6", "rc-lookahead=60", "min-keyint=1"])
        elif crf <= 24:
            x264_params.extend(["bframes=4", "ref=4", "rc-lookahead=40", "min-keyint=1"])
        else:
            x264_params.append("bframes=3")

        output_kwargs = {
            "vcodec": "libx264",
            "acodec": "aac",
            "crf": crf,
            "preset": preset,
            **universal_flags,
        }
        if x264_params:
            output_kwargs["x264-params"] = ":".join(x264_params)
            logger.info(
                f"Using CPU (libx264): crf={crf}, preset={preset}, "
                f"x264-params={output_kwargs['x264-params']}"
            )
        else:
            logger.info(f"Using CPU (libx264): crf={crf}, preset={preset}")
        return output_kwargs
