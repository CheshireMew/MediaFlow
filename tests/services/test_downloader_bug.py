from backend.services.downloader.service import DownloaderService
from pathlib import Path
import os

def test_clean_subtitles_skips_digits(tmp_path):
    """
    Test BUG: Subtitle text that is just a digit gets skipped.
    """
    vtt_content = """WEBVTT

1
00:00:01.000 --> 00:00:02.000
123

2
00:00:03.000 --> 00:00:04.000
Normal Text
"""
    vtt_path = tmp_path / "test.vtt"
    vtt_path.write_text(vtt_content, encoding='utf-8')
    
    DownloaderService()._clean_subtitles(str(vtt_path))
    
    srt_path = tmp_path / "test.srt"
    assert srt_path.exists()
    srt_content = srt_path.read_text(encoding='utf-8')
    
    # Check if '123' is in the SRT. 
    # Current BUG: it will be skipped because of line.isdigit() check.
    assert "123" in srt_content, "Subtitle text '123' was incorrectly skipped"

def test_clean_subtitles_missing_hours(tmp_path):
    """
    Test BUG: Timestamps without hours (MM:SS.mmm) are skipped.
    """
    vtt_content = """WEBVTT

00:01.000 --> 00:02.000
Short Video Text
"""
    vtt_path = tmp_path / "short.vtt"
    vtt_path.write_text(vtt_content, encoding='utf-8')
    
    DownloaderService()._clean_subtitles(str(vtt_path))
    
    srt_path = tmp_path / "short.srt"
    assert srt_path.exists()
    srt_content = srt_path.read_text(encoding='utf-8')
    
    assert "00:00:01,000" in srt_content or "00:01,000" in srt_content
    assert "Short Video Text" in srt_content
