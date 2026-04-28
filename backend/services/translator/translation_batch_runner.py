import threading
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Any, Callable, List, Optional

from backend.config import settings
from backend.models.schemas import SubtitleSegment
from backend.services.translator.translation_models import TranslationBatch


CONTEXT_OVERLAP = 3
DEFAULT_TRANSLATION_MAX_CONCURRENCY = 3


def normalize_batch_size(batch_size: int) -> int:
    return max(1, int(batch_size))


def resolve_max_concurrency(total_batches: int, requested: Optional[int]) -> int:
    if total_batches <= 1:
        return 1

    limit = requested
    if limit is None:
        limit = getattr(
            settings,
            "LLM_TRANSLATION_MAX_CONCURRENCY",
            DEFAULT_TRANSLATION_MAX_CONCURRENCY,
        )

    try:
        normalized = int(limit)
    except (TypeError, ValueError):
        normalized = 1

    return max(1, min(total_batches, normalized))


def build_translation_batches(
    segments: List[SubtitleSegment],
    batch_size: int,
    mode: str,
) -> List[TranslationBatch]:
    normalized_batch_size = normalize_batch_size(batch_size)
    batches: List[TranslationBatch] = []

    for index, start in enumerate(range(0, len(segments), normalized_batch_size), start=1):
        batch_segments = segments[start:start + normalized_batch_size]
        context_before: Optional[List[SubtitleSegment]] = None
        if mode != "intelligent" and start > 0:
            context_start = max(0, start - CONTEXT_OVERLAP)
            context_before = segments[context_start:start]
        batches.append(
            TranslationBatch(
                index=index,
                segments=batch_segments,
                context_before=context_before,
            )
        )

    return batches


def checkpoint(cancel_check: Optional[Callable[[], None]]) -> None:
    if cancel_check is not None:
        cancel_check()


def run_translation_batches(
    *,
    batches: List[TranslationBatch],
    target_language: str,
    mode: str,
    max_concurrency: int,
    translate_batch: Callable[[TranslationBatch, str, str, Optional[Callable[[], None]]], List[SubtitleSegment]],
    progress_callback: Optional[Callable[[int, str], None]] = None,
    cancel_check: Optional[Callable[[], None]] = None,
) -> List[SubtitleSegment]:
    total_batches = len(batches)
    translated_batches: List[Optional[List[SubtitleSegment]]] = [None] * total_batches
    completed_batches = 0
    progress_lock = threading.Lock()

    def notify_progress(message: str) -> None:
        if not progress_callback:
            return
        with progress_lock:
            checkpoint(cancel_check)
            progress_callback(
                int((completed_batches / total_batches) * 100),
                message,
            )

    notify_progress(
        f"Translating 0/{total_batches} batches ({mode}, concurrency={max_concurrency})..."
    )

    def store_batch_result(batch: TranslationBatch, result: List[SubtitleSegment]) -> None:
        nonlocal completed_batches
        translated_batches[batch.index - 1] = result
        with progress_lock:
            checkpoint(cancel_check)
            completed_batches += 1
            if progress_callback:
                progress_callback(
                    int((completed_batches / total_batches) * 100),
                    f"Translated {completed_batches}/{total_batches} batches ({mode})...",
                )

    if max_concurrency == 1:
        for batch in batches:
            checkpoint(cancel_check)
            try:
                result = translate_batch(batch, target_language, mode, cancel_check)
            except Exception as exc:
                raise RuntimeError(
                    "Translation failed before single-line fallback could complete. "
                    f"Batch {batch.index}/{total_batches}. Last error: {exc}"
                ) from exc
            store_batch_result(batch, result)
    else:
        executor = ThreadPoolExecutor(max_workers=max_concurrency)
        batch_iter = iter(batches)
        pending: dict[Any, TranslationBatch] = {}
        fast_abort = False

        def submit_next_batch() -> bool:
            checkpoint(cancel_check)
            try:
                next_batch = next(batch_iter)
            except StopIteration:
                return False

            future = executor.submit(
                translate_batch,
                next_batch,
                target_language,
                mode,
                cancel_check,
            )
            pending[future] = next_batch
            return True

        try:
            while len(pending) < max_concurrency and submit_next_batch():
                pass

            while pending:
                checkpoint(cancel_check)
                done, _ = wait(
                    tuple(pending.keys()),
                    timeout=0.05,
                    return_when=FIRST_COMPLETED,
                )
                if not done:
                    continue

                for future in done:
                    batch = pending.pop(future)
                    try:
                        result = future.result()
                    except Exception as exc:
                        fast_abort = True
                        for pending_future in pending:
                            pending_future.cancel()
                        raise RuntimeError(
                            "Translation failed before single-line fallback could complete. "
                            f"Batch {batch.index}/{total_batches}. Last error: {exc}"
                        ) from exc

                    store_batch_result(batch, result)

                    while len(pending) < max_concurrency and submit_next_batch():
                        pass
        except Exception:
            fast_abort = True
            raise
        finally:
            executor.shutdown(wait=not fast_abort, cancel_futures=True)

    return [
        segment
        for batch_result in translated_batches
        if batch_result is not None
        for segment in batch_result
    ]
