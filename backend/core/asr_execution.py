"""Shared limits and admission control for local speech recognition."""
import threading
from contextlib import contextmanager
from functools import wraps

LONG_AUDIO_SECONDS = 900
GPU_BATCH_SIZE = 4
CPU_BATCH_SIZE = 2

# One model owner at a time. Parallelism belongs inside its inference batches;
# two independent large models can exhaust an 8 GB GPU before either can run.
INFERENCE_LOCK = threading.Lock()


def check_control(progress_callback, state):
    if progress_callback:
        checkpoint = getattr(progress_callback, "checkpoint", None)
        if callable(checkpoint):
            checkpoint()
        else:
            progress_callback(*state)


def batch_size_for(duration: float, device: str, vad_filter: bool) -> int:
    if duration <= LONG_AUDIO_SECONDS or not vad_filter:
        return 1
    return GPU_BATCH_SIZE if device.startswith("cuda") else CPU_BATCH_SIZE


def is_out_of_memory(error: Exception) -> bool:
    message = str(error).lower()
    return any(marker in message for marker in (
        "out of memory", "out_of_memory", "cublas_status_alloc_failed",
        "cudnn_status_alloc_failed", "failed to allocate",
    ))


@contextmanager
def inference_slot(model_name: str, progress_callback=None):
    waiting = False
    while not INFERENCE_LOCK.acquire(timeout=0.5):
        if progress_callback and not waiting:
            progress_callback(0, "queued", {})
            waiting = True
        else:
            check_control(progress_callback, (0, "queued", {}))
    try:
        if progress_callback:
            progress_callback(0, "transcription_starting", {})
        yield
    finally:
        INFERENCE_LOCK.release()


def serialized_inference(function):
    @wraps(function)
    def run(self, **kwargs):
        callback = kwargs.get("progress_callback")
        if callback:
            highest = 0.0

            def monotonic_progress(progress, code, params=None):
                nonlocal highest
                highest = max(highest, min(100.0, float(progress)))
                callback(highest, code, params or {})

            if callable(getattr(callback, "checkpoint", None)):
                monotonic_progress.checkpoint = callback.checkpoint
            kwargs["progress_callback"] = monotonic_progress
        with inference_slot(kwargs.get("model_name", "base"), kwargs.get("progress_callback")):
            return function(self, **kwargs)
    return run
