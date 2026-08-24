import shutil
import sys
import threading
import time
import types
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import MagicMock

from backend.config import settings
from backend.services.asr.model_download_progress import _ModelDownloadProgressReporter
from backend.services.asr.model_download_service import ModelDownloadService
from backend.services.asr.model_manager import ModelManager


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

    emitted: list[tuple[float, str, dict]] = []
    reporter = _ModelDownloadProgressReporter(
        model_name="large-v2",
        source_label="ModelScope",
        progress_callback=lambda progress, code, params: emitted.append(
            (progress, code, params)
        ),
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

    progresses = [progress for progress, _code, _params in emitted]
    assert progresses == sorted(progresses)
    assert any(0 < progress < 8 for progress in progresses)
    assert progresses[-1] == 8.0
    assert emitted[-1][1] == "asr_model_downloading"
    assert emitted[-1][2]["model"] == "large-v2"


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
        (target_dir / "config.json").write_text("{}", encoding="utf-8")
        (target_dir / "model.bin").write_bytes(b"ok")
        return str(target_dir)

    _install_fake_modelscope(monkeypatch, snapshot_download_impl=fake_snapshot_download)
    temp_root = Path.cwd() / ".temp" / "pytest-model-manager" / str(uuid.uuid4())
    temp_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "RUNTIME_DIR", temp_root)
    monkeypatch.setattr(settings, "USER_DATA_DIR", temp_root / "user_data")
    monkeypatch.setattr(settings, "ASR_MODEL_DIR", temp_root / "faster-whisper")
    monkeypatch.setattr(settings, "TOOL_DIR", temp_root / "tools")
    monkeypatch.setattr(settings, "RUNTIME_MAX_MANAGED_BYTES", 1024 * 1024)
    monkeypatch.setattr(settings, "RUNTIME_MIN_FREE_BYTES", 0)

    try:
        manager = ModelDownloadService()
        monkeypatch.setattr(
            manager,
            "_resolve_modelscope_download_spec",
            lambda _repo_id: (100, "revision-1"),
        )

        emitted: list[tuple[float, str, dict]] = []
        local_path = manager.ensure_model_downloaded(
            "large-v2",
            lambda progress, code, params: emitted.append((progress, code, params)),
        )

        expected_dir = temp_root / "faster-whisper" / "faster-whisper-large-v2"
        assert local_path == str(expected_dir)
        assert (expected_dir / "model.bin").exists()
        assert emitted[0] == (0, "asr_model_preparing", {"model": "large-v2"})
        assert any(
            progress > 0
            and code == "asr_model_downloading"
            and params["source"] == "ModelScope"
            for progress, code, params in emitted
        )
        assert emitted[-1][0:2] == (8.0, "asr_model_downloading")
        assert emitted[-1][2]["model"] == "large-v2"
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def test_ensure_model_downloaded_reports_huggingface_fallback_progress(monkeypatch):
    temp_root = Path.cwd() / ".temp" / "pytest-model-manager" / str(uuid.uuid4())
    temp_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "RUNTIME_DIR", temp_root)
    monkeypatch.setattr(settings, "USER_DATA_DIR", temp_root / "user_data")
    monkeypatch.setattr(settings, "ASR_MODEL_DIR", temp_root / "faster-whisper")
    monkeypatch.setattr(settings, "TOOL_DIR", temp_root / "tools")
    monkeypatch.setattr(settings, "RUNTIME_MAX_MANAGED_BYTES", 1024 * 1024)
    monkeypatch.setattr(settings, "RUNTIME_MIN_FREE_BYTES", 0)

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
        (target_dir / "config.json").write_text("{}", encoding="utf-8")
        (target_dir / "model.bin").write_bytes(b"ok")
        return str(target_dir)

    try:
        manager = ModelDownloadService()
        monkeypatch.setattr(
            manager,
            "_download_from_modelscope",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(ImportError("no modelscope")),
        )
        monkeypatch.setattr(
            manager,
            "_resolve_huggingface_download_spec",
            lambda _repo_id: (100, "revision-2"),
        )

        import huggingface_hub

        monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_hf_snapshot_download)

        emitted: list[tuple[float, str, dict]] = []
        local_path = manager.ensure_model_downloaded(
            "large-v2",
            lambda progress, code, params: emitted.append((progress, code, params)),
        )

        expected_dir = temp_root / "faster-whisper" / "faster-whisper-large-v2"
        assert local_path == str(expected_dir)
        assert (expected_dir / "model.bin").exists()
        assert ("Systran/faster-whisper-large-v2", False) in calls
        assert emitted[0] == (2, "asr_model_source_fallback", {})
        assert any(
            progress > 2
            and code == "asr_model_downloading"
            and params["source"] == "Hugging Face"
            for progress, code, params in emitted
        )
        assert emitted[-1][0:2] == (8.0, "asr_model_downloading")
        assert emitted[-1][2]["model"] == "large-v2"
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def test_huggingface_preflight_counts_cached_files_and_pins_the_resolved_revision(
    monkeypatch,
):
    huggingface_module = types.ModuleType("huggingface_hub")
    calls = {}

    class FakeHfApi:
        def model_info(self, repo_id):
            calls["repo_id"] = repo_id
            return types.SimpleNamespace(sha="immutable-revision")

    def fake_snapshot_download(repo_id, **kwargs):
        calls["download_repo_id"] = repo_id
        calls["download_kwargs"] = kwargs
        return [
            types.SimpleNamespace(file_size=40, will_download=True),
            types.SimpleNamespace(file_size=60, will_download=False),
        ]

    huggingface_module.HfApi = FakeHfApi
    huggingface_module.snapshot_download = fake_snapshot_download
    monkeypatch.setitem(sys.modules, "huggingface_hub", huggingface_module)

    total_bytes, revision = ModelDownloadService()._resolve_huggingface_download_spec(
        "Systran/faster-whisper-base"
    )

    assert total_bytes == 100
    assert revision == "immutable-revision"
    assert calls["download_kwargs"]["revision"] == "immutable-revision"
    assert calls["download_kwargs"]["dry_run"] is True


def test_incomplete_model_cache_is_not_reported_as_reusable(tmp_path, monkeypatch):
    runtime = tmp_path / "runtime"
    model_root = runtime / "models" / "faster-whisper"
    target = model_root / "faster-whisper-base"
    target.mkdir(parents=True)
    (target / "model.bin").write_bytes(b"partial")
    monkeypatch.setattr(settings, "RUNTIME_DIR", runtime)
    monkeypatch.setattr(settings, "USER_DATA_DIR", runtime / "user_data")
    monkeypatch.setattr(settings, "ASR_MODEL_DIR", model_root)
    monkeypatch.setattr(settings, "TOOL_DIR", runtime / "tools")

    calls = []
    manager = ModelDownloadService()
    monkeypatch.setattr(
        manager,
        "_download_from_modelscope",
        lambda model_name, target_dir, progress_callback=None: calls.append(
            (model_name, target_dir, progress_callback)
        )
        or "downloaded-model",
    )

    assert manager.ensure_model_downloaded("base") == "downloaded-model"
    assert calls == [("base", target, None)]


def test_model_cache_is_scoped_by_device(monkeypatch):
    created: list[tuple[str, str]] = []

    class FakeWhisperModel:
        def __init__(self, model_path, *, device, compute_type, download_root):
            created.append((device, compute_type))

    faster_whisper_module = types.ModuleType("faster_whisper")
    faster_whisper_module.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", faster_whisper_module)

    manager = ModelManager()
    monkeypatch.setattr(manager, "ensure_model_downloaded", MagicMock(return_value="local-model"))

    cuda_model = manager.load_model("base", "cuda")
    assert manager.load_model("base", "cuda") is cuda_model
    cpu_model = manager.load_model("base", "cpu")

    assert cpu_model is not cuda_model
    assert created == [("cuda", "float16"), ("cpu", "int8")]


def test_concurrent_model_loads_construct_one_shared_instance(monkeypatch):
    created = 0
    created_lock = threading.Lock()

    class FakeWhisperModel:
        def __init__(self, model_path, *, device, compute_type, download_root):
            nonlocal created
            time.sleep(0.02)
            with created_lock:
                created += 1

    faster_whisper_module = types.ModuleType("faster_whisper")
    faster_whisper_module.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", faster_whisper_module)

    manager = ModelManager()
    monkeypatch.setattr(manager, "ensure_model_downloaded", MagicMock(return_value="local-model"))

    with ThreadPoolExecutor(max_workers=8) as executor:
        models = list(executor.map(lambda _: manager.load_model("base", "cpu"), range(8)))

    assert created == 1
    assert all(model is models[0] for model in models)
