from __future__ import annotations

import ctypes
import json
import os
import shutil
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from loguru import logger

from backend.config import settings


StorageTerminalStatus = Literal["active", "succeeded", "failed", "interrupted", "reused"]
_reservation_lock = threading.Lock()
_reserved_bytes_by_volume: dict[str, int] = {}


class StorageBudgetError(RuntimeError):
    pass


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _volume_key(path: Path) -> str:
    resolved = path.resolve()
    return resolved.drive.lower() or resolved.anchor.lower()


def _existing_parent(path: Path) -> Path:
    candidate = path.resolve()
    while not candidate.exists() and candidate != candidate.parent:
        candidate = candidate.parent
    return candidate


def registered_roots_inventory() -> tuple[tuple[str, Path], ...]:
    """Return every runtime root owned by storage-intensive producers."""
    runtime_root = settings.RUNTIME_DIR.resolve()
    candidates = (
        ("asr-models", settings.ASR_MODEL_DIR.resolve()),
        ("runtime-tools", settings.TOOL_DIR.resolve()),
        ("tool-provenance", (settings.USER_DATA_DIR / "tool-provenance").resolve()),
        ("storage-manifests", _manifest_dir().resolve()),
    )
    seen: list[tuple[str, Path]] = []
    for root_id, root in candidates:
        if not _is_within(root, runtime_root):
            raise StorageBudgetError(
                f"Registered managed root {root_id} is outside the configured runtime root: {root}"
            )
        for existing_id, existing_root in seen:
            if _is_within(root, existing_root) or _is_within(existing_root, root):
                raise StorageBudgetError(
                    "Registered managed roots overlap and cannot be inventoried exactly: "
                    f"{existing_id}={existing_root}, {root_id}={root}"
                )
        seen.append((root_id, root))
    return tuple(seen)


def managed_object_identity(path: Path, stat_result: os.stat_result | None = None) -> str:
    """Return the filesystem identity used to deduplicate links to one object."""
    info = stat_result or path.stat()
    device = int(info.st_dev)
    inode = int(info.st_ino)
    if inode <= 0:
        raise OSError(f"Filesystem object identity is unavailable for {path}")
    return f"{device:x}:{inode:x}"


def filesystem_allocated_bytes(
    path: Path,
    stat_result: os.stat_result | None = None,
) -> int:
    """Measure bytes allocated to a file using the current platform's filesystem API."""
    info = stat_result or path.stat()
    if os.name == "nt":
        from ctypes import wintypes

        get_compressed_file_size = ctypes.WinDLL(
            "kernel32", use_last_error=True
        ).GetCompressedFileSizeW
        get_compressed_file_size.argtypes = [
            wintypes.LPCWSTR,
            ctypes.POINTER(wintypes.DWORD),
        ]
        get_compressed_file_size.restype = wintypes.DWORD
        high = wintypes.DWORD()
        ctypes.set_last_error(0)
        low = get_compressed_file_size(str(path), ctypes.byref(high))
        error_code = ctypes.get_last_error()
        if low == 0xFFFFFFFF and error_code:
            raise OSError(error_code, ctypes.FormatError(error_code), str(path))
        return (int(high.value) << 32) | int(low)

    blocks = getattr(info, "st_blocks", None)
    if not isinstance(blocks, int) or blocks < 0:
        raise OSError(f"Filesystem allocation evidence is unavailable for {path}")
    return blocks * 512


def _scan_registered_roots(
    roots: tuple[tuple[str, Path], ...],
    *,
    exclude_paths: tuple[Path, ...] = (),
) -> dict[str, Any]:
    excluded = {path.resolve() for path in exclude_paths}
    files: list[dict[str, object]] = []
    unique_objects: dict[str, dict[str, object]] = {}
    logical_path_bytes = 0
    allocated_by_volume: dict[str, int] = {}

    for root_id, root in roots:
        if not root.exists():
            continue
        if not root.is_dir():
            raise OSError(f"Registered managed root is not a directory: {root}")
        for candidate in sorted(root.rglob("*")):
            if not candidate.is_file():
                continue
            resolved = candidate.resolve()
            if resolved in excluded:
                continue
            if not _is_within(resolved, root):
                raise OSError(
                    f"Managed root {root_id} contains a file link outside its boundary: {candidate}"
                )
            info = candidate.stat()
            logical_bytes = int(info.st_size)
            allocated_bytes = filesystem_allocated_bytes(candidate, info)
            identity = managed_object_identity(candidate, info)
            volume = _volume_key(candidate)
            entry = {
                "root_id": root_id,
                "path": candidate.relative_to(root).as_posix(),
                "logical_bytes": logical_bytes,
                "allocated_bytes": allocated_bytes,
                "object_identity": identity,
                "volume": volume,
            }
            files.append(entry)
            logical_path_bytes += logical_bytes
            if identity not in unique_objects:
                unique_objects[identity] = entry
                allocated_by_volume[volume] = (
                    allocated_by_volume.get(volume, 0) + allocated_bytes
                )

    return {
        "registered_roots": [
            {"id": root_id, "path": str(root)} for root_id, root in roots
        ],
        "logical_path_bytes": logical_path_bytes,
        "filesystem_allocated_bytes": sum(allocated_by_volume.values()),
        "managed_unique_bytes": sum(
            int(entry["logical_bytes"]) for entry in unique_objects.values()
        ),
        "allocated_bytes_by_volume": allocated_by_volume,
        "allocation_evidence": (
            "GetCompressedFileSizeW" if os.name == "nt" else "st_blocks*512"
        ),
        "object_identity_evidence": "st_dev+st_ino",
        "files": files,
    }


def _write_manifest_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.{os.getpid()}.tmp")
    try:
        with temp_path.open("w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def _manifest_dir() -> Path:
    return settings.USER_DATA_DIR / "storage-manifests"


@dataclass
class ManagedStorageRun:
    producer_id: str
    root: Path
    peak_bytes: int | None
    reuse_identity: str
    artifact_classes: tuple[str, ...]

    def __post_init__(self) -> None:
        self.root = self.root.resolve()
        self.run_id = uuid.uuid4().hex
        self.manifest_path = _manifest_dir() / f"{self.run_id}.json"
        self._reserved_bytes = 0
        self._volume = _volume_key(self.root)
        self._registered_roots: tuple[tuple[str, Path], ...] = ()
        self._target_root_id = ""
        self._preflight_snapshot: dict[str, Any] | None = None

    def _release_reservation(self) -> None:
        if not self._reserved_bytes:
            return
        with _reservation_lock:
            remaining = max(
                0,
                _reserved_bytes_by_volume.get(self._volume, 0)
                - self._reserved_bytes,
            )
            if remaining:
                _reserved_bytes_by_volume[self._volume] = remaining
            else:
                _reserved_bytes_by_volume.pop(self._volume, None)
            self._reserved_bytes = 0

    def _classify_added_object(self, entry: dict[str, object]) -> str:
        root_id = str(entry["root_id"])
        relative_path = str(entry["path"])
        if root_id in {"tool-provenance", "storage-manifests"}:
            return "evidence"
        if self.producer_id == "asr-model":
            return "evidence" if relative_path.endswith(".mediaflow-provenance.json") else "cache"
        if relative_path.startswith("downloads/"):
            return "cache"
        if relative_path.startswith(".install-staging/"):
            return "temporary"
        return "truth"

    def _payload(
        self,
        status: StorageTerminalStatus,
        *,
        error: str | None = None,
    ) -> dict:
        snapshot = _scan_registered_roots(
            self._registered_roots,
            exclude_paths=(self.manifest_path,),
        )
        preflight = self._preflight_snapshot or snapshot
        previous = {
            str(entry["object_identity"]): entry for entry in preflight["files"]
        }
        target_inventory = [
            entry
            for entry in snapshot["files"]
            if entry["root_id"] == self._target_root_id
        ]
        added_objects = [
            {**entry, "artifact_class": self._classify_added_object(entry)}
            for entry in target_inventory
            if (
                str(entry["object_identity"]) not in previous
                or int(entry["logical_bytes"])
                != int(previous[str(entry["object_identity"])]["logical_bytes"])
                or int(entry["allocated_bytes"])
                != int(previous[str(entry["object_identity"])]["allocated_bytes"])
            )
        ]
        bytes_by_class: dict[str, int] = {}
        seen_added: set[str] = set()
        for entry in added_objects:
            identity = str(entry["object_identity"])
            if identity in seen_added:
                continue
            seen_added.add(identity)
            artifact_class = str(entry["artifact_class"])
            bytes_by_class[artifact_class] = bytes_by_class.get(
                artifact_class, 0
            ) + int(entry["allocated_bytes"])
        return {
            "protocol": "mediaflow-managed-storage-run",
            "version": 2,
            "run_id": self.run_id,
            "producer_id": self.producer_id,
            "status": status,
            "root": str(self.root),
            "registered_roots": snapshot["registered_roots"],
            "peak_estimate_bytes": self.peak_bytes,
            "peak_observed_allocated_bytes": max(
                0,
                int(snapshot["filesystem_allocated_bytes"])
                - int(preflight["filesystem_allocated_bytes"]),
            ),
            "reuse_identity": self.reuse_identity,
            "artifact_classes": list(self.artifact_classes),
            "capacity_at_preflight": {
                key: value for key, value in preflight.items() if key != "files"
            },
            "capacity_at_finalization": {
                key: value for key, value in snapshot.items() if key != "files"
            },
            "inventory": target_inventory,
            "added_objects": added_objects,
            "reused_objects": target_inventory if status == "reused" else [],
            "bytes_by_class": bytes_by_class,
            "retained_logical_bytes": sum(
                int(item["logical_bytes"]) for item in target_inventory
            ),
            "retained_allocated_bytes": sum(
                int(item["allocated_bytes"])
                for index, item in enumerate(target_inventory)
                if str(item["object_identity"])
                not in {
                    str(previous_item["object_identity"])
                    for previous_item in target_inventory[:index]
                }
            ),
            "cleanup_candidates": [],
            "error": error,
        }

    def __enter__(self) -> "ManagedStorageRun":
        self._registered_roots = registered_roots_inventory()
        matching_roots = [
            root_id
            for root_id, registered_root in self._registered_roots
            if _is_within(self.root, registered_root)
        ]
        if len(matching_roots) != 1:
            raise StorageBudgetError(
                f"Managed producer {self.producer_id} targets an unregistered storage root."
            )
        self._target_root_id = matching_roots[0]
        if not isinstance(self.peak_bytes, int) or self.peak_bytes <= 0:
            raise StorageBudgetError(
                f"Managed producer {self.producer_id} has an unknown peak storage estimate."
            )

        with _reservation_lock:
            try:
                current = _scan_registered_roots(
                    self._registered_roots,
                    exclude_paths=(self.manifest_path,),
                )
            except OSError as exc:
                raise StorageBudgetError(
                    f"Managed producer {self.producer_id} cannot prove current filesystem allocation: {exc}"
                ) from exc
            concurrent_reserved = _reserved_bytes_by_volume.get(self._volume, 0)
            total_reserved = sum(_reserved_bytes_by_volume.values())
            current_bytes = int(current["filesystem_allocated_bytes"])
            projected_bytes = current_bytes + total_reserved + self.peak_bytes
            if projected_bytes > settings.RUNTIME_MAX_MANAGED_BYTES:
                raise StorageBudgetError(
                    f"Managed producer {self.producer_id} exceeds the configured runtime budget: "
                    f"{projected_bytes} > {settings.RUNTIME_MAX_MANAGED_BYTES} bytes."
                )
            free_bytes = shutil.disk_usage(_existing_parent(self.root)).free
            required_free = (
                self.peak_bytes
                + concurrent_reserved
                + settings.RUNTIME_MIN_FREE_BYTES
            )
            if free_bytes < required_free:
                raise StorageBudgetError(
                    f"Managed producer {self.producer_id} requires {required_free} free bytes "
                    f"including headroom; {free_bytes} bytes are available."
                )
            _reserved_bytes_by_volume[self._volume] = concurrent_reserved + self.peak_bytes
            self._reserved_bytes = self.peak_bytes
            self._preflight_snapshot = current

        try:
            self.root.mkdir(parents=True, exist_ok=True)
            _write_manifest_atomic(self.manifest_path, self._payload("active"))
        except Exception:
            self._release_reservation()
            raise
        return self

    def __exit__(self, exc_type, exc, _traceback) -> bool:
        try:
            _write_manifest_atomic(
                self.manifest_path,
                self._payload("failed" if exc is not None else "succeeded", error=str(exc) if exc else None),
            )
        finally:
            self._release_reservation()
        return False


def managed_storage_run(
    *,
    producer_id: str,
    root: Path,
    peak_bytes: int | None,
    reuse_identity: str,
    artifact_classes: tuple[str, ...],
) -> ManagedStorageRun:
    return ManagedStorageRun(
        producer_id=producer_id,
        root=root,
        peak_bytes=peak_bytes,
        reuse_identity=reuse_identity,
        artifact_classes=artifact_classes,
    )


def record_storage_reuse(
    *,
    producer_id: str,
    root: Path,
    reuse_identity: str,
    artifact_classes: tuple[str, ...],
) -> None:
    registered_roots = registered_roots_inventory()
    matching_roots = [
        root_id
        for root_id, registered_root in registered_roots
        if _is_within(root, registered_root)
    ]
    if len(matching_roots) != 1:
        raise StorageBudgetError(
            f"Managed producer {producer_id} targets an unregistered storage root."
        )
    run = ManagedStorageRun(
        producer_id=producer_id,
        root=root,
        peak_bytes=0,
        reuse_identity=reuse_identity,
        artifact_classes=artifact_classes,
    )
    run._registered_roots = registered_roots
    run._target_root_id = matching_roots[0]
    try:
        run._preflight_snapshot = _scan_registered_roots(
            registered_roots,
            exclude_paths=(run.manifest_path,),
        )
    except OSError as exc:
        raise StorageBudgetError(
            f"Managed producer {producer_id} cannot prove current filesystem allocation: {exc}"
        ) from exc
    _write_manifest_atomic(run.manifest_path, run._payload("reused"))


def recover_interrupted_storage_runs() -> int:
    manifest_dir = _manifest_dir()
    if not manifest_dir.exists():
        return 0
    recovered = 0
    for manifest_path in manifest_dir.glob("*.json"):
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            if payload.get("status") != "active":
                continue
            payload["status"] = "interrupted"
            payload["cleanup_candidates"] = []
            payload["error"] = "The producing process ended before finalization."
            _write_manifest_atomic(manifest_path, payload)
            recovered += 1
        except Exception as exc:
            logger.warning("Failed to recover storage manifest {}: {}", manifest_path, exc)
    if recovered:
        logger.warning("Marked {} managed storage runs as interrupted.", recovered)
    return recovered
