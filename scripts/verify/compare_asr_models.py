import sys
import shutil
import asyncio
from pathlib import Path
from loguru import logger

# Add src to path
repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.services.asr import ASRService
from backend.config import settings

# Configuration
AUDIO_FILE = r"e:\Work\Code\Mediaflow\temp\Oguz Erkan - Charlie Munger： ＂I've had my Berkshire stock decline by 50% three tim... [2019557451784167424].mp4"
REAL_CLI_PATH = r"D:\Software\Video\Faster-Whisper-XXL\faster-whisper-xxl.exe"

async def run_test(name, model_name, use_cli):
    logger.info(f"--- Starting Test: {name} ---")
    
    # Mock CLI path settings
    if use_cli:
        settings.FASTER_WHISPER_CLI_PATH = REAL_CLI_PATH
    else:
        settings.FASTER_WHISPER_CLI_PATH = "invalid_path_to_force_internal"
        
    asr = ASRService()
    
    # Verify file exists
    if not Path(AUDIO_FILE).exists():
        logger.error(f"Audio file not found: {AUDIO_FILE}")
        return

    try:
        # Run transcription
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, 
            lambda: asr.transcribe(
                audio_path=AUDIO_FILE,
                model_name=model_name,
                device="cuda", 
                progress_callback=lambda p, m: print(f"[{name}] {p}%: {m}")
            )
        )
        
        # Rename output for comparison
        original_srt = Path(result.srt_path)
        new_srt_name = original_srt.with_name(f"COMPARE_{name}.srt")
        shutil.move(original_srt, new_srt_name)
        
        logger.success(f"Generated: {new_srt_name}")
        
    except Exception as e:
        logger.error(f"Test {name} failed: {e}")
        import traceback
        traceback.print_exc()

async def main():
    # 1. CLI + Large-V3
    await run_test("CLI_LargeV3", "large-v3", use_cli=True)
    
    # 2. CLI + Large-V2
    await run_test("CLI_LargeV2", "large-v2", use_cli=True)
    
    # 3. Internal + Large-V3
    await run_test("Internal_LargeV3", "large-v3", use_cli=False)
    
    # 4. Internal + Large-V2
    await run_test("Internal_LargeV2", "large-v2", use_cli=False)

if __name__ == "__main__":
    asyncio.run(main())
