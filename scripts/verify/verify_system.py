import argparse
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.config import settings
from backend.core.app_runtime import ApplicationRuntime
from backend.core.container import ServiceContainer, Services


async def verify_system(url: str, model_name: str, device: str) -> None:
    print("🚀 Starting System Verification...")

    service_container = ServiceContainer()
    runtime = ApplicationRuntime(service_container)
    runtime.register_services()

    print("\n[1/2] Testing Downloader...")
    downloader = service_container.get(Services.DOWNLOADER)

    try:
        download_result = await downloader.download(
            url=url,
            resolution="audio",
            download_subs=False,
            filename="system_test_audio",
        )
        if not download_result.success or not download_result.artifacts:
            raise RuntimeError(download_result.error or "Download produced no artifacts")
        media_ref = download_result.artifacts[0].ref
        print(f"✅ Download successful: {media_ref.path}")

        print("\n[2/2] Testing ASR...")
        asr = service_container.get(Services.ASR)
        print(f"Transcribing with model: {model_name}")
        result = await asyncio.to_thread(
            asr.transcribe,
            audio_path=media_ref.path,
            model_name=model_name,
            device=device,
        )
        if not result.success:
            raise RuntimeError(result.error or "Transcription failed")
        segments = result.meta.get("segments", [])
        print(f"✅ Transcription successful. Generated {len(segments)} segments.")
        sample = segments[0].get("text", "") if segments else "No speech detected"
        print(f"Sample: {sample}")

    except Exception:
        import os

        print(f"Contents of {settings.TEMP_DIR}:")
        try:
            print(os.listdir(settings.TEMP_DIR))
        except Exception:
            print("Could not list temp dir")

        raise
    finally:
        if service_container.is_instantiated(Services.BROWSER):
            await service_container.get(Services.BROWSER).stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download audio and run a real ASR end-to-end verification."
    )
    parser.add_argument("url")
    parser.add_argument("--model", default="tiny")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    args = parser.parse_args()
    asyncio.run(verify_system(args.url, args.model, args.device))
