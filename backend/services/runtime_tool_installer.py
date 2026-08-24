import hashlib
import json
import os
import shutil
import subprocess
import threading
import uuid
import zipfile
from importlib import import_module
from pathlib import Path, PurePosixPath
from urllib.error import URLError
from urllib.request import Request, urlopen

from backend.config import settings
from backend.models.settings_contracts import UserPreferencesPatch
from backend.services.storage_policy import managed_storage_run, record_storage_reuse

FASTER_WHISPER_CLI_VERSION = "r245.4"
FASTER_WHISPER_CLI_ARCHIVE = "Faster-Whisper-XXL_r245.4_windows.7z"
FASTER_WHISPER_CLI_URL = (
    "https://github.com/Purfview/whisper-standalone-win/releases/download/"
    f"Faster-Whisper-XXL/{FASTER_WHISPER_CLI_ARCHIVE}"
)
FASTER_WHISPER_CLI_SIZE = 1_424_256_246
PYPI_YT_DLP_JSON_URL = "https://pypi.org/pypi/yt-dlp/json"

_faster_whisper_cli_install_lock = threading.Lock()
_yt_dlp_install_lock = threading.Lock()


class RuntimeToolInstaller:
    """Owns download, verification, and transactional installation of runtime tools."""

    def __init__(self, settings_manager):
        self._settings_manager = settings_manager

    def update_yt_dlp(self) -> dict[str, str | None]:
        previous_version = self.get_yt_dlp_version()
        release = self._fetch_latest_yt_dlp_wheel()
        wheel_path = settings.TOOL_DOWNLOAD_DIR / release["filename"]
        with _yt_dlp_install_lock, managed_storage_run(
            producer_id="runtime-tool",
            root=settings.TOOL_DIR,
            peak_bytes=max(int(release["size"]) * 3, 32 * 1024 * 1024),
            reuse_identity=f"pypi:yt-dlp@{release['version']}#{release['sha256']}",
            artifact_classes=("cache", "truth", "evidence", "temporary"),
        ):
            wheel_path.parent.mkdir(parents=True, exist_ok=True)
            self._download_with_resume(
                str(release["url"]),
                wheel_path,
                expected_size=int(release["size"]),
                expected_sha256=str(release["sha256"]),
            )
            self._install_yt_dlp_wheel(
                wheel_path,
                version=str(release["version"]),
                source_url=str(release["url"]),
                sha256=str(release["sha256"]),
            )

        return {
            "status": "success",
            "message": "yt-dlp update installed into the writable runtime tools directory. Restart the backend if the new version is not picked up immediately.",
            "previous_version": previous_version,
            "current_version": str(release["version"]),
        }

    def install_faster_whisper_cli(self) -> dict[str, str | None]:
        target_dir = settings.TOOL_DIR / "Faster-Whisper-XXL"
        cli_path = target_dir / "faster-whisper-xxl.exe"
        archive_path = settings.TOOL_DOWNLOAD_DIR / FASTER_WHISPER_CLI_ARCHIVE

        with _faster_whisper_cli_install_lock:
            if cli_path.exists() and self._tool_provenance_matches(
                tool_id="faster-whisper-xxl",
                version=FASTER_WHISPER_CLI_VERSION,
                source_url=FASTER_WHISPER_CLI_URL,
            ):
                record_storage_reuse(
                    producer_id="runtime-tool",
                    root=settings.TOOL_DIR,
                    reuse_identity=f"github:faster-whisper-xxl@{FASTER_WHISPER_CLI_VERSION}",
                    artifact_classes=("cache", "truth", "evidence", "temporary"),
                )
                return self._save_faster_whisper_cli_path(
                    cli_path,
                    "Faster-Whisper CLI is already installed.",
                )

            with managed_storage_run(
                producer_id="runtime-tool",
                root=settings.TOOL_DIR,
                peak_bytes=4 * 1024 * 1024 * 1024,
                reuse_identity=f"github:faster-whisper-xxl@{FASTER_WHISPER_CLI_VERSION}",
                artifact_classes=("cache", "truth", "evidence", "temporary"),
            ):
                archive_path.parent.mkdir(parents=True, exist_ok=True)
                self._download_with_resume(
                    FASTER_WHISPER_CLI_URL,
                    archive_path,
                    expected_size=FASTER_WHISPER_CLI_SIZE,
                )
                self._install_faster_whisper_archive(
                    archive_path=archive_path,
                    target_dir=target_dir,
                )

            return self._save_faster_whisper_cli_path(
                cli_path,
                "Faster-Whisper CLI installed.",
            )

    def _save_faster_whisper_cli_path(
        self,
        cli_path: Path,
        message: str,
    ) -> dict[str, str | None]:
        self._settings_manager.patch_preferences(
            UserPreferencesPatch(faster_whisper_cli_path=str(cli_path))
        )
        settings.FASTER_WHISPER_CLI_PATH = str(cli_path)
        return {
            "status": "success",
            "message": message,
            "cli_path": str(cli_path),
            "version": FASTER_WHISPER_CLI_VERSION,
        }

    @staticmethod
    def _fetch_latest_yt_dlp_wheel() -> dict[str, str | int]:
        request = Request(PYPI_YT_DLP_JSON_URL, headers={"User-Agent": "MediaFlow setup"})
        try:
            with urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch yt-dlp release metadata: {exc}") from exc

        version = str(payload.get("info", {}).get("version") or "")
        candidates = payload.get("urls", [])
        for item in candidates:
            filename = str(item.get("filename") or "")
            if filename.endswith(".whl") and item.get("packagetype") == "bdist_wheel":
                sha256 = str(item.get("digests", {}).get("sha256") or "")
                if not sha256:
                    raise RuntimeError("PyPI release metadata did not provide a SHA-256 digest")
                return {
                    "version": version,
                    "filename": filename,
                    "url": str(item["url"]),
                    "size": int(item.get("size") or 0),
                    "sha256": sha256,
                }
        raise RuntimeError("No yt-dlp wheel found in PyPI release metadata")

    @staticmethod
    def _install_yt_dlp_wheel(
        wheel_path: Path,
        *,
        version: str,
        source_url: str,
        sha256: str,
    ) -> None:
        target = settings.PYTHON_TOOL_PACKAGES_DIR
        target.mkdir(parents=True, exist_ok=True)
        transaction_root = settings.TOOL_DIR / ".install-staging" / f"yt-dlp-{uuid.uuid4().hex}"
        staged_root = transaction_root / "new"
        previous_root = transaction_root / "previous"
        staged_root.mkdir(parents=True, exist_ok=False)
        previous_root.mkdir(parents=True, exist_ok=False)

        installed_entries: list[Path] = []
        previous_entries: list[tuple[Path, Path]] = []
        try:
            with zipfile.ZipFile(wheel_path) as wheel:
                for member in wheel.infolist():
                    relative = PurePosixPath(member.filename)
                    if relative.is_absolute() or ".." in relative.parts or not relative.parts:
                        raise RuntimeError(f"Unsafe yt-dlp wheel member: {member.filename}")
                    top_level = relative.parts[0]
                    is_managed_member = top_level == "yt_dlp" or (
                        top_level.startswith("yt_dlp-") and top_level.endswith(".dist-info")
                    )
                    if not is_managed_member:
                        continue
                    destination = staged_root.joinpath(*relative.parts)
                    if member.is_dir():
                        destination.mkdir(parents=True, exist_ok=True)
                        continue
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with wheel.open(member) as source, destination.open("wb") as output:
                        shutil.copyfileobj(source, output)

            package_dir = staged_root / "yt_dlp"
            metadata_dirs = list(staged_root.glob("yt_dlp-*.dist-info"))
            if not (package_dir / "__init__.py").is_file() or len(metadata_dirs) != 1:
                raise RuntimeError("The yt-dlp wheel did not contain one complete package and metadata directory")

            stale_entries = [*target.glob("yt_dlp"), *target.glob("yt_dlp-*.dist-info")]
            for stale in stale_entries:
                backup = previous_root / stale.name
                stale.replace(backup)
                previous_entries.append((stale, backup))

            for staged in [package_dir, *metadata_dirs]:
                destination = target / staged.name
                staged.replace(destination)
                installed_entries.append(destination)

            RuntimeToolInstaller._record_tool_provenance(
                tool_id="yt-dlp",
                version=version,
                source_url=source_url,
                sha256=sha256,
            )
        except Exception:
            for installed in installed_entries:
                if installed.is_dir():
                    shutil.rmtree(installed, ignore_errors=True)
                else:
                    installed.unlink(missing_ok=True)
            for original, backup in reversed(previous_entries):
                if backup.exists():
                    backup.replace(original)
            raise
        finally:
            shutil.rmtree(transaction_root, ignore_errors=True)

    @staticmethod
    def _install_faster_whisper_archive(*, archive_path: Path, target_dir: Path) -> None:
        transaction_root = settings.TOOL_DIR / ".install-staging" / f"faster-whisper-{uuid.uuid4().hex}"
        transaction_root.mkdir(parents=True, exist_ok=False)
        staged_target = transaction_root / target_dir.name
        previous_target = transaction_root / "previous-install"
        moved_previous = False
        moved_new = False
        try:
            result = subprocess.run(
                ["tar", "-xf", str(archive_path), "-C", str(transaction_root)],
                capture_output=True,
                text=True,
                timeout=900,
                check=False,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "tar extraction failed").strip()
                raise RuntimeError(detail)

            staged_cli = staged_target / "faster-whisper-xxl.exe"
            if not staged_cli.is_file():
                raise RuntimeError(
                    f"Faster-Whisper CLI executable was not found in the staged archive: {staged_cli}"
                )

            target_dir.parent.mkdir(parents=True, exist_ok=True)
            if target_dir.exists():
                target_dir.replace(previous_target)
                moved_previous = True
            staged_target.replace(target_dir)
            moved_new = True
            RuntimeToolInstaller._record_tool_provenance(
                tool_id="faster-whisper-xxl",
                version=FASTER_WHISPER_CLI_VERSION,
                source_url=FASTER_WHISPER_CLI_URL,
                sha256=RuntimeToolInstaller._sha256_file(archive_path),
            )
        except Exception:
            if moved_new and target_dir.exists():
                shutil.rmtree(target_dir, ignore_errors=True)
            if moved_previous and previous_target.exists():
                previous_target.replace(target_dir)
            raise
        finally:
            shutil.rmtree(transaction_root, ignore_errors=True)

    @staticmethod
    def _download_with_resume(
        url: str,
        destination: Path,
        expected_size: int,
        expected_sha256: str | None = None,
    ) -> None:
        for attempt in range(1, 8):
            current_size = destination.stat().st_size if destination.exists() else 0
            if expected_size > 0 and current_size == expected_size:
                if not expected_sha256 or RuntimeToolInstaller._sha256_file(destination) == expected_sha256:
                    return
                destination.unlink()
                current_size = 0
            if expected_size > 0 and current_size > expected_size:
                destination.unlink()
                current_size = 0

            headers = {"User-Agent": "MediaFlow setup"}
            if current_size > 0:
                headers["Range"] = f"bytes={current_size}-"

            request = Request(url, headers=headers)
            try:
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
            except (TimeoutError, URLError, OSError) as exc:
                if attempt == 7:
                    raise RuntimeError(f"Failed to download managed runtime tool: {exc}") from exc
                continue

        final_size = destination.stat().st_size if destination.exists() else 0
        if expected_size > 0 and final_size != expected_size:
            raise RuntimeError(
                f"Downloaded managed runtime tool is incomplete: {final_size} / {expected_size}"
            )
        if expected_sha256:
            actual_sha256 = RuntimeToolInstaller._sha256_file(destination)
            if actual_sha256 != expected_sha256:
                raise RuntimeError(
                    f"Downloaded archive checksum mismatch: {actual_sha256} != {expected_sha256}"
                )

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _record_tool_provenance(
        *,
        tool_id: str,
        version: str,
        source_url: str,
        sha256: str,
    ) -> None:
        provenance_dir = settings.USER_DATA_DIR / "tool-provenance"
        provenance_dir.mkdir(parents=True, exist_ok=True)
        target = provenance_dir / f"{tool_id}.json"
        temporary = provenance_dir / f".{tool_id}.{uuid.uuid4().hex}.tmp"
        try:
            temporary.write_text(
                json.dumps(
                    {
                        "tool_id": tool_id,
                        "version": version,
                        "source_url": source_url,
                        "sha256": sha256,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _tool_provenance_matches(*, tool_id: str, version: str, source_url: str) -> bool:
        target = settings.USER_DATA_DIR / "tool-provenance" / f"{tool_id}.json"
        try:
            payload = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return False
        return (
            payload.get("tool_id") == tool_id
            and payload.get("version") == version
            and payload.get("source_url") == source_url
            and isinstance(payload.get("sha256"), str)
            and len(payload["sha256"]) == 64
        )

    @staticmethod
    def get_yt_dlp_version() -> str | None:
        try:
            yt_dlp = import_module("yt_dlp")
            version = getattr(getattr(yt_dlp, "version", None), "__version__", None)
            if version:
                return str(version)
        except Exception:
            return None
        return None
