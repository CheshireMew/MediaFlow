import sys
import types
import uuid
from pathlib import Path
import shutil

from backend.config import settings
from backend.services.asr.model_manager import (
    ModelManager,
    _ModelDownloadProgressReporter,
)


def _install_fake_modelscope(monkeypatch, snapshot_download_impl):
    modelscope_module = types.ModuleType("modelscope")
    hub_module = types.ModuleType("modelscope.hub")
    callback_module = types.ModuleType("modelscope.hub.callback")
    snapshot_module = types.ModuleType("modelscope.hub.snapshot_download")

    class ProgressCallback:
        def __init__(self, filename: str, file_size: int):
            self.filename = filename
            self.file_size = file_size

        def update(self, size: int):
            return None

        def end(self):
            return None

    callback_module.ProgressCallback = ProgressCallback
    snapshot_module.snapshot_download = snapshot_download_impl

    modelscope_module.hub = hub_module
    hub_module.callback = callback_module
    hub_module.snapshot_download = snapshot_module

    monkeypatch.setitem(sys.modules, "modelscope", modelscope_module)
    monkeypatch.setitem(sys.modules, "modelscope.hub", hub_module)
    monkeypatch.setitem(sys.modules, "modelscope.hub.callback", callback_module)
    monkeypatch.setitem(sys.modules, "modelscope.hub.snapshot_download", snapshot_module)


def test_modelscope_progress_reporter_aggregates_bytes(monkeypatch):
    _install_fake_modelscope(monkeypatch, snapshot_download_impl=lambda **_: None)

    emitted: list[tuple[float, str]] = []
    reporter = _ModelDownloadProgressReporter(
        model_name="large-v2",
        source_label="ModelScope",
        progress_callback=lambda progress, message: emitted.append((progress, message)),
        progress_start=0.0,
        progress_end=8.0,
        total_bytes=100,
    )

    callback_type = reporter.build_callback_type()
    weights = callback_type("weights.bin", 80)
    config = callback_type("config.json", 20)

    weights.update(20)
    config.update(10)
    weights.update(60)
    weights.end()
    config.update(10)
    config.end()
    reporter.complete()

    progresses = [progress for progress, _ in emitted]
    assert progresses == sorted(progresses)
    assert any(0 < progress < 8 for progress in progresses)
    assert progresses[-1] == 8.0
    assert emitted[-1][1] == "Downloaded model large-v2."


def test_ensure_model_downloaded_reports_modelscope_progress(monkeypatch):
    def fake_snapshot_download(model_id, local_dir, progress_callbacks=None, **_kwargs):
        assert model_id == "pengzhendong/faster-whisper-large-v2"
        assert progress_callbacks

        callback = progress_callbacks[0]("model.bin", 100)
        callback.update(25)
        callback.update(75)
        callback.end()

        target_dir = Path(local_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "model.bin").write_bytes(b"ok")
        return str(target_dir)

    _install_fake_modelscope(monkeypatch, snapshot_download_impl=fake_snapshot_download)
    temp_root = Path.cwd() / ".temp" / "pytest-model-manager" / str(uuid.uuid4())
    temp_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "ASR_MODEL_DIR", temp_root / "faster-whisper")

    try:
        manager = ModelManager()
        monkeypatch.setattr(
            manager,
            "_resolve_modelscope_total_bytes",
            lambda _repo_id: 100,
        )

        emitted: list[tuple[float, str]] = []
        local_path = manager.ensure_model_downloaded(
            "large-v2",
            lambda progress, message: emitted.append((progress, message)),
        )

        expected_dir = temp_root / "faster-whisper" / "faster-whisper-large-v2"
        assert local_path == str(expected_dir)
        assert (expected_dir / "model.bin").exists()
        assert emitted[0] == (0, "Preparing model download large-v2...")
        assert any(
            progress > 0 and "Downloading model large-v2 from ModelScope" in message
            for progress, message in emitted
        )
        assert emitted[-1] == (8.0, "Downloaded model large-v2.")
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def test_ensure_model_downloaded_reports_huggingface_fallback_progress(monkeypatch):
    temp_root = Path.cwd() / ".temp" / "pytest-model-manager" / str(uuid.uuid4())
    temp_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "ASR_MODEL_DIR", temp_root / "faster-whisper")

    calls: list[tuple[str, object]] = []

    def fake_hf_snapshot_download(
        repo_id,
        *,
        allow_patterns=None,
        cache_dir=None,
        dry_run=False,
        tqdm_class=None,
        local_dir=None,
        max_workers=None,
        **_kwargs,
    ):
        calls.append((repo_id, dry_run))
        assert allow_patterns is not None
        assert cache_dir == str(settings.ASR_MODEL_DIR)

        if dry_run:
            return [
                types.SimpleNamespace(file_size=40, will_download=True),
                types.SimpleNamespace(file_size=60, will_download=True),
            ]

        assert tqdm_class is not None
        progress = tqdm_class(total=100, unit="B", desc="Downloading")
        progress.update(30)
        progress.update(70)
        progress.close()

        target_dir = Path(local_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "model.bin").write_bytes(b"ok")
        return str(target_dir)

    try:
        manager = ModelManager()
        monkeypatch.setattr(
            manager,
            "_download_from_modelscope",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(ImportError("no modelscope")),
        )

        import huggingface_hub

        monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_hf_snapshot_download)

        emitted: list[tuple[float, str]] = []
        local_path = manager.ensure_model_downloaded(
            "large-v2",
            lambda progress, message: emitted.append((progress, message)),
        )

        expected_dir = temp_root / "faster-whisper" / "faster-whisper-large-v2"
        assert local_path == str(expected_dir)
        assert (expected_dir / "model.bin").exists()
        assert ("Systran/faster-whisper-large-v2", True) in calls
        assert ("Systran/faster-whisper-large-v2", False) in calls
        assert emitted[0] == (2, "ModelScope missing. Falling back to Hugging Face...")
        assert any(
            progress > 2 and "Downloading model large-v2 from Hugging Face" in message
            for progress, message in emitted
        )
        assert emitted[-1] == (8.0, "Downloaded model large-v2.")
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
