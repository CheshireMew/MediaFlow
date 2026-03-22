from pathlib import Path

from backend.services.downloader.post_processor import DownloadPostProcessor


def test_normalize_artifact_names_renames_media_and_matching_subtitle(tmp_path):
    media_path = tmp_path / "Patient Investor - 鈥淲on鈥檛 Replace.mp4"
    subtitle_path = tmp_path / "Patient Investor - 鈥淲on鈥檛 Replace.srt"
    media_path.write_bytes(b"video")
    subtitle_path.write_text("1\n00:00:00,000 --> 00:00:01,000\nhello\n", encoding="utf-8")

    normalized_media_path, normalized_subtitle_path = DownloadPostProcessor().normalize_artifact_names(
        media_path,
        str(subtitle_path),
    )

    assert normalized_media_path.name == "Patient Investor - “Won’t Replace.mp4"
    assert Path(normalized_subtitle_path).name == "Patient Investor - “Won’t Replace.srt"
    assert normalized_media_path.exists()
    assert Path(normalized_subtitle_path).exists()
    assert not media_path.exists()
    assert not subtitle_path.exists()


def test_normalize_artifact_names_prefers_clean_requested_stem(tmp_path):
    media_path = tmp_path / "Patient Investor - 鈥淎I Won鈥檛 Replace Software!鈥\udc9d.mp4"
    media_path.write_bytes(b"video")

    normalized_media_path, normalized_subtitle_path = DownloadPostProcessor().normalize_artifact_names(
        media_path,
        None,
        preferred_stem="Patient Investor - “AI Won’t Replace Software!” — Jensen Huang: $CSU?",
    )

    assert normalized_subtitle_path is None
    assert normalized_media_path.name == "Patient Investor - “AI Won’t Replace Software!” — Jensen Huang $CSU.mp4"
    assert normalized_media_path.exists()
    assert not media_path.exists()
