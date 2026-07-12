
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from backend.services.video_synthesizer import VideoSynthesizer
from backend.services.video.media_prober import MediaProber
from backend.services.video.watermark_processor import WatermarkProcessor
from loguru import logger

def verify_refactor():
    logger.info("Verifying VideoSynthesizer refactor...")
    
    # 1. Instantiate VideoSynthesizer
    try:
        synth = VideoSynthesizer()
        logger.info("✅ VideoSynthesizer instantiated successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to instantiate VideoSynthesizer: {e}")
        return

    # 2. Check imports/usage of new classes
    # We can't easily check internal method calls without mocking, 
    # but we can check if the Static methods are accessible via the classes
    
    try:
        # Mock detection
        nvenc = MediaProber.detect_nvenc()
        logger.info(f"✅ MediaProber.detect_nvenc() called. Result: {nvenc}")
    except Exception as e:
        logger.error(f"❌ MediaProber.detect_nvenc() failed: {e}")

    try:
        # Check WatermarkProcessor existence
        # We won't actually process a file to avoid side effects/need for assets
        assert hasattr(WatermarkProcessor, 'process_watermark')
        logger.info("✅ WatermarkProcessor.process_watermark method exists.")
    except Exception as e:
        logger.error(f"❌ WatermarkProcessor check failed: {e}")

    # 3. Check if old methods are gone (optional, but good for verification)
    if hasattr(synth, '_detect_nvenc'):
        logger.warning("⚠️ VideoSynthesizer still has _detect_nvenc method.")
    else:
        logger.info("✅ VideoSynthesizer._detect_nvenc correctly removed.")

    if hasattr(synth, 'process_watermark'):
        # It still has process_watermark but it should call the delegate.
        # We just check if it exists (it should, as the public API).
        logger.info("✅ VideoSynthesizer.process_watermark public API exists.")

if __name__ == "__main__":
    verify_refactor()
