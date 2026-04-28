import subprocess
import sys
import threading
import shutil
from importlib import import_module
from pathlib import Path
from typing import Callable, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from backend.core.runtime_access import RuntimeServices
from backend.config import settings
from backend.services.settings_manager import LLMProvider, UserSettings

OpenAI = None

FASTER_WHISPER_CLI_VERSION = "r245.4"
FASTER_WHISPER_CLI_ARCHIVE = "Faster-Whisper-XXL_r245.4_windows.7z"
FASTER_WHISPER_CLI_URL = (
    "https://github.com/Purfview/whisper-standalone-win/releases/download/"
    f"Faster-Whisper-XXL/{FASTER_WHISPER_CLI_ARCHIVE}"
)
FASTER_WHISPER_CLI_SIZE = 1_424_256_246
_faster_whisper_cli_install_lock = threading.Lock()


class SettingsApplicationService:
    def __init__(self, settings_manager):
        self._settings_manager = settings_manager

    def get_settings(self) -> UserSettings:
        return self._settings_manager.get_settings()

    def update_settings(self, settings: UserSettings) -> UserSettings:
        self._settings_manager.update_settings(settings)
        return self._settings_manager.get_settings()

    def set_active_provider(self, provider_id: str) -> dict[str, str]:
        self._settings_manager.set_active_provider(provider_id)
        return {"status": "success", "active_provider_id": provider_id}

    def test_provider_connection(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        name: str | None = None,
    ) -> dict[str, str]:
        if not base_url.strip():
            raise ValueError("Base URL is required")
        if not api_key.strip():
            raise ValueError("API key is required")
        if not model.strip():
            raise ValueError("Model is required")
        client_factory = OpenAI
        if client_factory is None:
            from openai import OpenAI as imported_openai

            globals()["OpenAI"] = imported_openai
            client_factory = imported_openai

        provider = LLMProvider(
            id="test-provider",
            name=name or "Test Provider",
            base_url=base_url,
            api_key=api_key,
            model=model,
            is_active=False,
        )
        client = client_factory(
            api_key=provider.api_key,
            base_url=provider.base_url,
            timeout=15.0,
        )
        client.chat.completions.create(
            model=provider.model,
            messages=[{"role": "user", "content": "Reply with OK."}],
            max_tokens=3,
        )
        return {"status": "success", "message": "Connection successful"}

    def update_yt_dlp(self) -> dict[str, str | None]:
        previous_version = self.get_yt_dlp_version()
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "Unknown pip error").strip()
            raise RuntimeError(detail)

        return {
            "status": "success",
            "message": "yt-dlp update completed. Restart the backend if the new version is not picked up immediately.",
            "previous_version": previous_version,
            "current_version": self.get_yt_dlp_version(),
        }

    def install_faster_whisper_cli(
        self,
        progress_callback: Callable[[float, str], None] | None = None,
    ) -> dict[str, str | None]:
        target_dir = settings.BIN_DIR / "Faster-Whisper-XXL"
        cli_path = target_dir / "faster-whisper-xxl.exe"
        archive_path = settings.BIN_DIR / "downloads" / FASTER_WHISPER_CLI_ARCHIVE

        with _faster_whisper_cli_install_lock:
            if cli_path.exists():
                if progress_callback:
                    progress_callback(100, "Faster-Whisper CLI is already installed.")
                return self._save_faster_whisper_cli_path(
                    cli_path,
                    "Faster-Whisper CLI is already installed.",
                )

            if progress_callback:
                progress_callback(0, "Preparing Faster-Whisper CLI install...")
            self._ensure_install_space(archive_path.parent)

            archive_path.parent.mkdir(parents=True, exist_ok=True)
            self._download_with_resume(
                FASTER_WHISPER_CLI_URL,
                archive_path,
                expected_size=FASTER_WHISPER_CLI_SIZE,
                progress_callback=progress_callback,
            )

            target_dir.parent.mkdir(parents=True, exist_ok=True)
            if progress_callback:
                progress_callback(92, "Extracting Faster-Whisper CLI...")
            result = subprocess.run(
                ["tar", "-xf", str(archive_path), "-C", str(target_dir.parent)],
                capture_output=True,
                text=True,
                timeout=900,
                check=False,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "tar extraction failed").strip()
                raise RuntimeError(detail)

            if not cli_path.exists():
                raise RuntimeError(f"Faster-Whisper CLI executable was not found after extraction: {cli_path}")

            if progress_callback:
                progress_callback(98, "Saving Faster-Whisper CLI path...")
            result_payload = self._save_faster_whisper_cli_path(
                cli_path,
                "Faster-Whisper CLI installed.",
            )
            if progress_callback:
                progress_callback(100, "Faster-Whisper CLI is ready.")
            return result_payload

    def _save_faster_whisper_cli_path(self, cli_path: Path, message: str) -> dict[str, str | None]:
        current_settings = self._settings_manager.get_settings()
        if hasattr(current_settings, "model_copy"):
            next_settings = current_settings.model_copy(
                update={"faster_whisper_cli_path": str(cli_path)}
            )
        else:
            data = current_settings.dict()
            data["faster_whisper_cli_path"] = str(cli_path)
            next_settings = UserSettings(**data)

        self._settings_manager.update_settings(next_settings)
        settings.FASTER_WHISPER_CLI_PATH = str(cli_path)
        return {
            "status": "success",
            "message": message,
            "cli_path": str(cli_path),
            "version": FASTER_WHISPER_CLI_VERSION,
        }

    @staticmethod
    def _ensure_install_space(path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(path)
        # Archive plus extraction currently needs roughly 3 GiB; keep headroom
        # for partial downloads and filesystem overhead.
        required = 4 * 1024 * 1024 * 1024
        if usage.free < required:
            raise RuntimeError(
                f"Not enough free disk space for Faster-Whisper CLI install. "
                f"Need at least 4 GiB, available {usage.free / (1024 ** 3):.1f} GiB."
            )

    @staticmethod
    def _download_with_resume(
        url: str,
        destination: Path,
        expected_size: int,
        progress_callback: Callable[[float, str], None] | None = None,
    ) -> None:
        for attempt in range(1, 8):
            current_size = destination.stat().st_size if destination.exists() else 0
            if current_size == expected_size:
                if progress_callback:
                    progress_callback(90, "Faster-Whisper CLI archive already downloaded.")
                return
            if current_size > expected_size:
                destination.unlink()
                current_size = 0

            headers = {"User-Agent": "MediaFlow setup"}
            if current_size > 0:
                headers["Range"] = f"bytes={current_size}-"

            request = Request(url, headers=headers)
            try:
                if progress_callback:
                    progress = 5 + min(current_size / expected_size, 1.0) * 85
                    progress_callback(progress, f"Downloading Faster-Whisper CLI... attempt {attempt}")
                with urlopen(request, timeout=60) as response:
                    status = getattr(response, "status", 200)
                    if current_size > 0 and status != 206:
                        current_size = 0
                        destination.unlink(missing_ok=True)
                    mode = "ab" if current_size > 0 and status == 206 else "wb"
                    with destination.open(mode) as output:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            output.write(chunk)
                            current_size += len(chunk)
                            if progress_callback and expected_size > 0:
                                progress = 5 + min(current_size / expected_size, 1.0) * 85
                                progress_callback(
                                    progress,
                                    f"Downloading Faster-Whisper CLI... {current_size / (1024 ** 2):.0f} MiB / {expected_size / (1024 ** 2):.0f} MiB",
                                )
            except (TimeoutError, URLError, OSError) as exc:
                if attempt == 7:
                    raise RuntimeError(f"Failed to download Faster-Whisper CLI: {exc}") from exc
                continue

        final_size = destination.stat().st_size if destination.exists() else 0
        if final_size != expected_size:
            raise RuntimeError(
                f"Downloaded Faster-Whisper CLI archive is incomplete: {final_size} / {expected_size}"
            )

    @staticmethod
    def get_yt_dlp_version() -> Optional[str]:
        try:
            yt_dlp = import_module("yt_dlp")
            version = getattr(getattr(yt_dlp, "version", None), "__version__", None)
            if version:
                return str(version)
        except Exception:
            return None
        return None
