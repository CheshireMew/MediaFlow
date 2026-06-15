from __future__ import annotations

import json
from pathlib import Path

from loguru import logger
from pydantic import BaseModel, Field

from backend.core.container import Services
from backend.core.runtime_access import runtime_service
from backend.models.schemas import (
    ClipCandidate,
    SubtitleSegment,
)
from backend.services.llm_io_logger import log_llm_messages, log_llm_response
from backend.services.translator.translation_client import TranslationClientFactory
from backend.services.video.media_prober import MediaProber


MAX_ANALYSIS_WINDOWS = 180
WINDOW_TEXT_LIMIT = 720
CUE_TEXT_LIMIT = 240


class HighlightSubtitleCue(BaseModel):
    id: str
    start: float
    end: float
    text: str


class HighlightAnalysisWindow(BaseModel):
    id: str
    start: float
    end: float
    cues: list[HighlightSubtitleCue]


class LlmHighlightCandidate(BaseModel):
    start_cue_id: str = Field(..., description="ID of the first subtitle cue in the clip.")
    end_cue_id: str = Field(..., description="ID of the last subtitle cue in the clip.")
    title: str = Field(..., description="Short title for the highlight clip.")
    reason: str = Field(..., description="Why this is a compelling highlight.")
    score: float = Field(..., ge=0, le=100, description="Highlight confidence score.")
    transcript: str = Field("", description="Relevant subtitle excerpt for the clip.")


class LlmHighlightResponse(BaseModel):
    candidates: list[LlmHighlightCandidate] = Field(default_factory=list)


def detect_highlights(
    *,
    video_path: str,
    subtitle_segments: list[SubtitleSegment],
    max_candidates: int,
    min_duration: float,
    max_duration: float,
) -> tuple[list[ClipCandidate], str, float]:
    valid_subtitles = [
        segment
        for segment in sorted(subtitle_segments, key=lambda item: item.start)
        if segment.end > segment.start and segment.text.strip()
    ]
    if not valid_subtitles:
        raise ValueError("Highlight detection requires subtitles.")

    duration = MediaProber.get_duration(video_path)
    cues = _build_subtitle_cues(valid_subtitles)
    windows = _build_analysis_windows(cues)
    response = _request_llm_highlights(
        video_path=video_path,
        media_duration=duration,
        windows=windows,
        max_candidates=max_candidates,
        min_duration=min_duration,
        max_duration=max_duration,
    )
    candidates = _normalize_llm_candidates(
        response.candidates,
        cues=cues,
        media_duration=duration,
        max_candidates=max_candidates,
    )
    return candidates, "llm", duration


def _build_subtitle_cues(segments: list[SubtitleSegment]) -> list[HighlightSubtitleCue]:
    return [
        HighlightSubtitleCue(
            id=f"cue-{index}",
            start=round(segment.start, 3),
            end=round(segment.end, 3),
            text=segment.text.strip()[:CUE_TEXT_LIMIT],
        )
        for index, segment in enumerate(segments, start=1)
    ]


def _build_analysis_windows(cues: list[HighlightSubtitleCue]) -> list[HighlightAnalysisWindow]:
    media_start = cues[0].start
    media_end = cues[-1].end
    total_duration = max(media_end - media_start, 1.0)
    target_window_seconds = max(30.0, total_duration / MAX_ANALYSIS_WINDOWS)

    windows: list[HighlightAnalysisWindow] = []
    current: list[HighlightSubtitleCue] = []
    current_start = cues[0].start

    for cue in cues:
        current_text_len = sum(len(item.text) for item in current)
        would_exceed_time = current and cue.end - current_start > target_window_seconds
        would_exceed_text = current and current_text_len + len(cue.text) > WINDOW_TEXT_LIMIT
        if would_exceed_time or would_exceed_text:
            windows.append(_window_from_cues(len(windows) + 1, current))
            current = []
            current_start = cue.start
        current.append(cue)

    if current:
        windows.append(_window_from_cues(len(windows) + 1, current))

    return windows


def _window_from_cues(index: int, cues: list[HighlightSubtitleCue]) -> HighlightAnalysisWindow:
    return HighlightAnalysisWindow(
        id=f"w{index}",
        start=cues[0].start,
        end=cues[-1].end,
        cues=cues,
    )


def _request_llm_highlights(
    *,
    video_path: str,
    media_duration: float,
    windows: list[HighlightAnalysisWindow],
    max_candidates: int,
    min_duration: float,
    max_duration: float,
) -> LlmHighlightResponse:
    client, model_name = TranslationClientFactory(
        runtime_service(Services.SETTINGS_MANAGER)
    ).get_client()
    if not client or not model_name:
        raise ValueError("LLM provider is not configured.")

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert short-video editor. "
                "Select genuinely compelling highlight clips from subtitle cues. "
                "Prefer clips with a complete idea, strong tension, useful insight, surprise, emotion, "
                "or a clear shareable takeaway. Do not choose filler, greetings, transitions, or setup-only parts. "
                "Return only candidate cue IDs from the provided input. Do not invent timestamps or cue IDs."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "video_name": Path(video_path).name,
                    "duration_seconds": media_duration,
                    "max_candidates": max_candidates,
                    "min_clip_duration_seconds": min_duration,
                    "max_clip_duration_seconds": max_duration,
                    "instructions": [
                        "Choose one or more highlight clips only if the subtitles justify them.",
                        "Return start_cue_id and end_cue_id from the provided cue ids; do not return timestamps.",
                        "Choose cue boundaries at complete sentence or idea boundaries.",
                        "Each clip should be understandable when watched alone.",
                        "Use the duration limits as selection guidance; the backend will derive exact seconds from the selected cues.",
                        "Use concise Chinese titles and reasons when the subtitles are Chinese; otherwise match the subtitle language.",
                    ],
                    "subtitle_windows": [window.model_dump() for window in windows],
                },
                ensure_ascii=False,
            ),
        },
    ]
    logger.info(
        "Requesting LLM highlight detection: model={} windows={} max_candidates={}",
        model_name,
        len(windows),
        max_candidates,
    )
    log_llm_messages("Highlight detection", messages)
    response = client.chat.completions.create(
        model=model_name,
        response_model=LlmHighlightResponse,
        messages=messages,
        temperature=0.4,
    )
    log_llm_response("Highlight detection", response)
    logger.info("LLM highlight detection returned {} candidates", len(response.candidates))
    return response


def _normalize_llm_candidates(
    llm_candidates: list[LlmHighlightCandidate],
    *,
    cues: list[HighlightSubtitleCue],
    media_duration: float,
    max_candidates: int,
) -> list[ClipCandidate]:
    result: list[ClipCandidate] = []
    cue_positions = {cue.id: position for position, cue in enumerate(cues)}
    for index, candidate in enumerate(llm_candidates, start=1):
        start_position = cue_positions.get(candidate.start_cue_id)
        end_position = cue_positions.get(candidate.end_cue_id)
        if start_position is None or end_position is None:
            logger.warning(
                "Skipping LLM highlight candidate with unknown cue ids: start_cue_id={} end_cue_id={}",
                candidate.start_cue_id,
                candidate.end_cue_id,
            )
            continue
        if end_position < start_position:
            logger.warning(
                "Skipping LLM highlight candidate with reversed cue ids: start_cue_id={} end_cue_id={}",
                candidate.start_cue_id,
                candidate.end_cue_id,
            )
            continue

        selected_cues = cues[start_position : end_position + 1]
        start = max(0.0, selected_cues[0].start)
        end = selected_cues[-1].end
        if media_duration > 0:
            start = min(start, media_duration)
            end = min(max(0.0, end), media_duration)
        if end <= start:
            continue

        transcript = candidate.transcript.strip() or " ".join(cue.text for cue in selected_cues)

        result.append(
            ClipCandidate(
                id=f"clip-{len(result) + 1}",
                start=round(start, 3),
                end=round(end, 3),
                title=candidate.title.strip()[:48] or f"Clip {index}",
                reason=candidate.reason.strip()[:240],
                score=round(float(candidate.score), 3),
                transcript=transcript[:900] or None,
                selected=True,
            )
        )
        if len(result) >= max_candidates:
            break

    return result
