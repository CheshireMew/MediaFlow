import json
from types import SimpleNamespace

import pytest

from backend.services import storage_policy


def configure_storage_policy(tmp_path, monkeypatch, *, maximum=10_000, minimum_free=100):
    runtime = tmp_path / "runtime"
    monkeypatch.setattr(storage_policy.settings, "RUNTIME_DIR", runtime)
    monkeypatch.setattr(storage_policy.settings, "USER_DATA_DIR", runtime / "user_data")
    monkeypatch.setattr(storage_policy.settings, "ASR_MODEL_DIR", runtime / "models" / "faster-whisper")
    monkeypatch.setattr(storage_policy.settings, "TOOL_DIR", runtime / "tools")
    monkeypatch.setattr(storage_policy.settings, "TOOL_DOWNLOAD_DIR", runtime / "tools" / "downloads")
    monkeypatch.setattr(
        storage_policy.settings,
        "PYTHON_TOOL_PACKAGES_DIR",
        runtime / "tools" / "python-packages",
    )
    monkeypatch.setattr(storage_policy.settings, "RUNTIME_MAX_MANAGED_BYTES", maximum)
    monkeypatch.setattr(storage_policy.settings, "RUNTIME_MIN_FREE_BYTES", minimum_free)
    monkeypatch.setattr(
        storage_policy.shutil,
        "disk_usage",
        lambda _path: SimpleNamespace(total=20_000, used=1_000, free=19_000),
    )
    return runtime


def test_unknown_peak_blocks_before_creating_the_producer_root(tmp_path, monkeypatch):
    runtime = configure_storage_policy(tmp_path, monkeypatch)
    target = runtime / "models" / "faster-whisper" / "unknown"

    with pytest.raises(storage_policy.StorageBudgetError, match="unknown peak"):
        with storage_policy.managed_storage_run(
            producer_id="asr-model",
            root=target,
            peak_bytes=None,
            reuse_identity="model@revision",
            artifact_classes=("cache",),
        ):
            raise AssertionError("producer must not start")

    assert not target.exists()


def test_over_budget_run_blocks_before_creating_a_large_artifact(tmp_path, monkeypatch):
    runtime = configure_storage_policy(tmp_path, monkeypatch, maximum=500)
    target = runtime / "tools" / "large"

    with pytest.raises(storage_policy.StorageBudgetError, match="runtime budget"):
        with storage_policy.managed_storage_run(
            producer_id="tool-install",
            root=target,
            peak_bytes=501,
            reuse_identity="tool@1",
            artifact_classes=("cache",),
        ):
            raise AssertionError("producer must not start")

    assert not target.exists()


def test_paths_outside_the_owned_runtime_are_rejected_for_writes_and_reuse(
    tmp_path,
    monkeypatch,
):
    configure_storage_policy(tmp_path, monkeypatch)
    target = tmp_path / "outside-runtime"

    with pytest.raises(storage_policy.StorageBudgetError, match="unregistered storage root"):
        with storage_policy.managed_storage_run(
            producer_id="runtime-tool",
            root=target,
            peak_bytes=100,
            reuse_identity="tool@1",
            artifact_classes=("cache",),
        ):
            raise AssertionError("producer must not start")

    with pytest.raises(storage_policy.StorageBudgetError, match="unregistered storage root"):
        storage_policy.record_storage_reuse(
            producer_id="runtime-tool",
            root=target,
            reuse_identity="tool@1",
            artifact_classes=("cache",),
        )

    assert not target.exists()


def test_successful_run_publishes_owned_inventory_and_recovery_marks_interruption(tmp_path, monkeypatch):
    runtime = configure_storage_policy(tmp_path, monkeypatch)
    target = runtime / "models" / "faster-whisper" / "known"
    with storage_policy.managed_storage_run(
        producer_id="asr-model",
        root=target,
        peak_bytes=1000,
        reuse_identity="model@revision",
        artifact_classes=("cache",),
    ):
        (target / "model.bin").write_bytes(b"model")

    manifests = list((runtime / "user_data" / "storage-manifests").glob("*.json"))
    assert len(manifests) == 1
    completed = json.loads(manifests[0].read_text(encoding="utf-8"))
    assert completed["status"] == "succeeded"
    assert completed["version"] == 2
    assert len(completed["inventory"]) == 1
    assert completed["inventory"][0]["path"] == "known/model.bin"
    assert completed["inventory"][0]["logical_bytes"] == 5
    assert completed["capacity_at_finalization"]["allocation_evidence"] == "GetCompressedFileSizeW"
    assert completed["capacity_at_finalization"]["object_identity_evidence"] == "st_dev+st_ino"
    assert completed["added_objects"][0]["artifact_class"] == "cache"
    completed["status"] = "active"
    manifests[0].write_text(json.dumps(completed), encoding="utf-8")

    assert storage_policy.recover_interrupted_storage_runs() == 1
    recovered = json.loads(manifests[0].read_text(encoding="utf-8"))
    assert recovered["status"] == "interrupted"
    assert recovered["cleanup_candidates"] == []


def test_registered_roots_count_hard_links_once_for_capacity(tmp_path, monkeypatch):
    runtime = configure_storage_policy(tmp_path, monkeypatch, maximum=100_000)
    model_file = runtime / "models" / "faster-whisper" / "shared.bin"
    tool_link = runtime / "tools" / "shared.bin"
    model_file.parent.mkdir(parents=True)
    tool_link.parent.mkdir(parents=True)
    model_file.write_bytes(b"shared-object")
    tool_link.hardlink_to(model_file)

    snapshot = storage_policy._scan_registered_roots(
        storage_policy.registered_roots_inventory()
    )

    assert snapshot["logical_path_bytes"] == len(b"shared-object") * 2
    assert snapshot["managed_unique_bytes"] == len(b"shared-object")
    assert len({entry["object_identity"] for entry in snapshot["files"]}) == 1
    assert snapshot["filesystem_allocated_bytes"] == snapshot["files"][0]["allocated_bytes"]


def test_unknown_allocation_evidence_blocks_before_root_creation(tmp_path, monkeypatch):
    runtime = configure_storage_policy(tmp_path, monkeypatch)
    existing = runtime / "models" / "faster-whisper" / "existing.bin"
    existing.parent.mkdir(parents=True)
    existing.write_bytes(b"existing")
    target = runtime / "tools" / "new-tool"
    monkeypatch.setattr(
        storage_policy,
        "filesystem_allocated_bytes",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("allocation unavailable")),
    )

    with pytest.raises(storage_policy.StorageBudgetError, match="cannot prove current filesystem allocation"):
        with storage_policy.managed_storage_run(
            producer_id="runtime-tool",
            root=target,
            peak_bytes=100,
            reuse_identity="tool@2",
            artifact_classes=("truth",),
        ):
            raise AssertionError("producer must not start")

    assert not target.exists()


def test_reuse_manifest_does_not_duplicate_the_managed_object(tmp_path, monkeypatch):
    runtime = configure_storage_policy(tmp_path, monkeypatch)
    target = runtime / "models" / "faster-whisper" / "known"
    target.mkdir(parents=True)
    model = target / "model.bin"
    model.write_bytes(b"model")
    identity_before = storage_policy.managed_object_identity(model)

    storage_policy.record_storage_reuse(
        producer_id="asr-model",
        root=runtime / "models" / "faster-whisper",
        reuse_identity="model@revision",
        artifact_classes=("cache", "evidence"),
    )

    assert storage_policy.managed_object_identity(model) == identity_before
    assert list(target.iterdir()) == [model]
    manifest = next((runtime / "user_data" / "storage-manifests").glob("*.json"))
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    assert payload["status"] == "reused"
    assert payload["reused_objects"][0]["path"] == "known/model.bin"
