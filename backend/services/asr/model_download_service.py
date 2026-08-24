import json
import os
import threading
import uuid
from pathlib import Path

from loguru import logger

from backend.config import settings
from backend.services.asr.model_download_progress import (
    ModelProgressCallback,
    _ModelDownloadProgressReporter,
    _SilentTqdm,
)
from backend.services.storage_policy import (
    StorageBudgetError,
    managed_storage_run,
    record_storage_reuse,
)


class ModelDownloadService:
    def __init__(self):
        self._model_lock = threading.RLock()

    @property
    def model_map(self):
        return settings.ASR_MODELS

    def _resolve_modelscope_download_spec(
        self,
        model_repo_id: str,
    ) -> tuple[int | None, str]:
        try:
            from modelscope.hub.api import HubApi

            api = HubApi()
            revision_detail = api.get_valid_revision_detail(model_repo_id)
            revision = revision_detail["Revision"]
            repo_files = api.get_model_files(
                model_id=model_repo_id,
                revision=revision,
                recursive=True,
            )
            total_size = 0
            for repo_file in repo_files:
                if repo_file.get("Type") == "tree":
                    continue
                size = repo_file.get("Size")
                if isinstance(size, (int, float)):
                    total_size += int(size)

            return total_size if total_size > 0 else None, str(revision)
        except Exception as exc:
            logger.debug(f"Failed to resolve ModelScope repo size for {model_repo_id}: {exc}")
            return None, "unknown"

    @staticmethod
    def _resolve_huggingface_repo_id(model_name: str) -> str:
        if "/" in model_name:
            return model_name

        from faster_whisper.utils import _MODELS

        repo_id = _MODELS.get(model_name)
        if repo_id is None:
            raise ValueError(f"Unsupported Hugging Face fallback model: {model_name}")
        return repo_id

    @staticmethod
    def _resolve_huggingface_allow_patterns() -> list[str]:
        return [
            "config.json",
            "preprocessor_config.json",
            "model.bin",
            "tokenizer.json",
            "vocabulary.*",
        ]

    def _resolve_huggingface_download_spec(
        self,
        repo_id: str,
    ) -> tuple[int | None, str]:
        try:
            from huggingface_hub import HfApi, snapshot_download

            revision = str(HfApi().model_info(repo_id).sha or "unknown")

            dry_run_files = snapshot_download(
                repo_id,
                revision=revision,
                allow_patterns=self._resolve_huggingface_allow_patterns(),
                cache_dir=str(settings.ASR_MODEL_DIR),
                dry_run=True,
                tqdm_class=_SilentTqdm,
            )
            total_bytes = sum(
                int(getattr(file_info, "file_size", 0) or 0)
                for file_info in dry_run_files
            )
            return total_bytes if total_bytes > 0 else None, revision
        except Exception as exc:
            logger.debug(f"Failed to resolve Hugging Face repo size for {repo_id}: {exc}")
            return None, "unknown"

    @staticmethod
    def _write_model_provenance(
        target_dir: Path,
        *,
        source: str,
        repository: str,
        revision: str,
    ) -> None:
        target_dir.mkdir(parents=True, exist_ok=True)
        provenance_path = target_dir / ".mediaflow-provenance.json"
        temporary_path = target_dir / f".mediaflow-provenance.{uuid.uuid4().hex}.tmp"
        try:
            with temporary_path.open("w", encoding="utf-8") as output:
                json.dump(
                    {
                        "source": source,
                        "repository": repository,
                        "revision": revision,
                    },
                    output,
                    ensure_ascii=False,
                    indent=2,
                )
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary_path, provenance_path)
        finally:
            temporary_path.unlink(missing_ok=True)

    @staticmethod
    def _assert_complete_model_files(target_dir: Path) -> None:
        missing = [
            filename
            for filename in ("config.json", "model.bin")
            if not (target_dir / filename).is_file()
        ]
        if missing:
            raise RuntimeError(
                f"Downloaded ASR model is incomplete; missing: {', '.join(missing)}"
            )

    @staticmethod
    def _read_complete_model_provenance(target_dir: Path) -> dict[str, str] | None:
        try:
            ModelDownloadService._assert_complete_model_files(target_dir)
            payload = json.loads(
                (target_dir / ".mediaflow-provenance.json").read_text(encoding="utf-8")
            )
        except (OSError, RuntimeError, ValueError, TypeError, json.JSONDecodeError):
            return None
        if (
            payload.get("source") not in {"modelscope", "huggingface"}
            or not isinstance(payload.get("repository"), str)
            or not payload["repository"]
            or not isinstance(payload.get("revision"), str)
            or not payload["revision"]
            or payload["revision"] == "unknown"
        ):
            return None
        return payload

    def _download_from_modelscope(
        self,
        model_name: str,
        target_dir: Path,
        progress_callback: ModelProgressCallback = None,
    ) -> str:
        from modelscope.hub.snapshot_download import snapshot_download

        model_repo_id = self.model_map.get(model_name, model_name)
        logger.info(f"Attempting download from ModelScope: {model_repo_id}")
        total_bytes, revision = self._resolve_modelscope_download_spec(model_repo_id)
        reporter = _ModelDownloadProgressReporter(
            model_name=model_name,
            source_label="ModelScope",
            progress_callback=progress_callback,
            progress_start=0.0,
            progress_end=8.0,
            total_bytes=total_bytes,
        )
        if progress_callback:
            progress_callback(0, "asr_model_preparing", {"model": model_name})

        with managed_storage_run(
            producer_id="asr-model",
            root=settings.ASR_MODEL_DIR,
            peak_bytes=total_bytes * 2 if total_bytes is not None else None,
            reuse_identity=f"modelscope:{model_repo_id}@{revision}",
            artifact_classes=("cache", "evidence"),
        ):
            local_model_path = snapshot_download(
                model_repo_id,
                revision=revision,
                local_dir=str(target_dir),
                progress_callbacks=[reporter.build_callback_type()],
            )
            self._assert_complete_model_files(target_dir)
            self._write_model_provenance(
                target_dir,
                source="modelscope",
                repository=model_repo_id,
                revision=revision,
            )
        logger.success(f"Model downloaded to: {local_model_path}")
        reporter.complete()
        return local_model_path

    def _download_from_huggingface(
        self,
        model_name: str,
        target_dir: Path,
        progress_callback: ModelProgressCallback = None,
    ) -> str:
        from huggingface_hub import snapshot_download

        repo_id = self._resolve_huggingface_repo_id(model_name)
        allow_patterns = self._resolve_huggingface_allow_patterns()
        total_bytes, revision = self._resolve_huggingface_download_spec(repo_id)
        reporter = _ModelDownloadProgressReporter(
            model_name=model_name,
            source_label="Hugging Face",
            progress_callback=progress_callback,
            progress_start=2.0,
            progress_end=8.0,
            total_bytes=total_bytes,
        )

        class _HuggingFaceProgressTqdm(_SilentTqdm):
            def __init__(self, *args, **kwargs):
                self._is_bytes_bar = kwargs.get("unit") == "B"
                super().__init__(*args, **kwargs)
                if self._is_bytes_bar:
                    reporter.set_total_bytes(getattr(self, "total", None))

            def refresh(self, *args, **kwargs):
                result = super().refresh(*args, **kwargs)
                if self._is_bytes_bar:
                    reporter.set_total_bytes(getattr(self, "total", None))
                return result

            def update(self, n=1):
                result = super().update(n)
                if self._is_bytes_bar:
                    reporter.advance(n)
                return result

        if progress_callback:
            progress_callback(
                2,
                "asr_model_preparing",
                {"model": model_name},
            )

        with managed_storage_run(
            producer_id="asr-model",
            root=settings.ASR_MODEL_DIR,
            peak_bytes=total_bytes * 2 if total_bytes is not None else None,
            reuse_identity=f"huggingface:{repo_id}@{revision}",
            artifact_classes=("cache", "evidence"),
        ):
            local_model_path = snapshot_download(
                repo_id,
                revision=revision,
                cache_dir=str(settings.ASR_MODEL_DIR),
                local_dir=str(target_dir),
                allow_patterns=allow_patterns,
                max_workers=4,
                tqdm_class=_HuggingFaceProgressTqdm,
            )
            self._assert_complete_model_files(target_dir)
            self._write_model_provenance(
                target_dir,
                source="huggingface",
                repository=repo_id,
                revision=revision,
            )
        logger.success(f"Model downloaded from Hugging Face to: {local_model_path}")
        reporter.complete()
        return local_model_path

    def ensure_model_downloaded(self, model_name: str, progress_callback=None) -> str:
        """
        Ensure the model is downloaded to local storage, supporting ModelScope.
        Returns the local path to the model.
        """
        with self._model_lock:
            settings.ASR_MODEL_DIR.mkdir(parents=True, exist_ok=True)
            target_dir = self.get_cached_model_path(model_name)

            provenance = self._read_complete_model_provenance(target_dir)
            if provenance is not None:
                reuse_identity = (
                    f"{provenance['source']}:{provenance['repository']}@{provenance['revision']}"
                )
                record_storage_reuse(
                    producer_id="asr-model",
                    root=settings.ASR_MODEL_DIR,
                    reuse_identity=reuse_identity,
                    artifact_classes=("cache", "evidence"),
                )
                return str(target_dir)

            try:
                return self._download_from_modelscope(
                    model_name,
                    target_dir,
                    progress_callback=progress_callback,
                )
            except StorageBudgetError:
                raise
            except ImportError:
                logger.warning("ModelScope not installed, falling back to Hugging Face...")
                if progress_callback:
                    progress_callback(2, "asr_model_source_fallback", {})
                return self._download_from_huggingface(
                    model_name,
                    target_dir,
                    progress_callback=progress_callback,
                )
            except Exception as e:
                logger.error(f"ModelScope download failed: {e}. Falling back to Hugging Face...")
                if progress_callback:
                    progress_callback(
                        2,
                        "asr_model_source_fallback",
                        {},
                    )
                return self._download_from_huggingface(
                    model_name,
                    target_dir,
                    progress_callback=progress_callback,
                )

    def get_cached_model_path(self, model_name: str) -> Path:
        return settings.ASR_MODEL_DIR / f"faster-whisper-{model_name}"
