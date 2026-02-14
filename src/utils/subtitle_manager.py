"""
SubtitleManager — Backward-compatible facade.

This module was split into 3 focused modules:
  - subtitle_parser.py  → VTT/SRT parsing (SubtitleParser)
  - subtitle_writer.py  → SRT/ASS output  (SubtitleWriter)
  - segment_refiner.py  → Whisper segment optimization (SegmentRefiner)

This facade re-exports all methods under the original `SubtitleManager` name
so that existing callers (`from src.utils.subtitle_manager import SubtitleManager`)
continue to work without any changes.
"""
from src.utils.subtitle_parser import SubtitleParser
from src.utils.subtitle_writer import SubtitleWriter
from src.utils.segment_refiner import SegmentRefiner


class SubtitleManager:
    """Facade that delegates to SubtitleParser, SubtitleWriter, and SegmentRefiner."""

    # --- Parser ---
    process_vtt_file = SubtitleParser.process_vtt_file
    parse_srt = SubtitleParser.parse_srt

    # --- Writer ---
    format_timestamp = SubtitleWriter.format_timestamp
    save_srt = SubtitleWriter.save_srt
    convert_srt_to_ass = SubtitleWriter.convert_srt_to_ass

    # --- Refiner ---
    refine_segments = SegmentRefiner.refine_segments
    merge_segments = SegmentRefiner.merge_segments

    # --- Constants (re-exported for any direct access) ---
    MAX_WORD_COUNT_CJK = SegmentRefiner.MAX_WORD_COUNT_CJK
    MAX_WORD_COUNT_ENGLISH = SegmentRefiner.MAX_WORD_COUNT_ENGLISH
    MIN_WORD_COUNT = SegmentRefiner.MIN_WORD_COUNT
    TIME_GAP_THRESHOLD = SegmentRefiner.TIME_GAP_THRESHOLD
    PREFIX_SPLIT_WORDS = SegmentRefiner.PREFIX_SPLIT_WORDS
    SUFFIX_SPLIT_WORDS = SegmentRefiner.SUFFIX_SPLIT_WORDS
