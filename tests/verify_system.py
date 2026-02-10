import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from src.core.container import container, Services
from src.services.downloader import DownloaderService
from src.services.asr import ASRService
from src.services.task_manager import TaskManager
from src.config import settings

async def verify_system():
    print("🚀 Starting System Verification...")
    
    # Manual Registration
    container.register(Services.TASK_MANAGER, TaskManager)
    container.register(Services.ASR, ASRService)
    container.register(Services.DOWNLOADER, DownloaderService)

    # 1. Download
    print("\n[1/2] Testing Downloader...")
    downloader = container.get(Services.DOWNLOADER)
    # Use a small, reliable test video (e.g., from generic test collection if available, or a known short url)
    # For this test, we'll try to download audio only to be fast
    test_url = "https://www.bilibili.com/video/BV1uT4y1P7CX" # A short video
    
    try:
        asset = await downloader.download(
            url=test_url,
            resolution="audio", # Download audio only for speed
            download_subs=False,
            filename="system_test_video"
        )
        print(f"✅ Download successful: {asset.path}")
        
        # 2. ASR
        print("\n[2/2] Testing ASR...")
        asr = container.get(Services.ASR)
        # Use 'tiny' model for speed
        model_name = "tiny" 
        
        print(f"Transcribing with model: {model_name}")
        result = asr.transcribe(
            audio_path=asset.path,
            model_name=model_name,
            device="cpu" # Force CPU for compatibility
        )
        
        print(f"✅ Transcription successful. Generated {len(result.segments)} segments.")
        print(f"Sample: {result.segments[0].text if result.segments else 'No speech detected'}")
        
    except Exception as e:
        print(f"❌ Verification Failed: {e}")
        import os
        print(f"Contents of {settings.TEMP_DIR}:")
        try:
            print(os.listdir(settings.TEMP_DIR))
        except Exception:
            print("Could not list temp dir")
            
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(verify_system())
