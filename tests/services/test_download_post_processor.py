from pathlib import Path

from backend.services.downloader.artifacts import DownloadArtifactResolver


def test_artifact_name_normalization_renames_media_and_matching_subtitle_without_redecoding(tmp_path):
    media_path = tmp_path / "Patient Investor - 鈥淲on鈥檛 Replace.mp4"
    subtitle_path = tmp_path / "Patient Investor - 鈥淲on鈥檛 Replace.srt"
    media_path.write_bytes(b"video")
    subtitle_path.write_text("1\n00:00:00,000 --> 00:00:01,000\nhello\n", encoding="utf-8")

    normalized_media_path, normalized_subtitle_path = DownloadArtifactResolver()._normalize_names(
        media_path,
        subtitle_path,
        preferred_stem="Patient Investor - 鈥淲on鈥檛 Replace",
    )

    assert normalized_media_path == media_path
    assert normalized_subtitle_path == subtitle_path
    assert normalized_media_path.exists()
    assert normalized_subtitle_path.exists()


def test_artifact_name_normalization_only_sanitizes_invalid_filename_characters(tmp_path):
    media_path = tmp_path / "download.mp4"
    media_path.write_bytes(b"video")

    normalized_media_path, normalized_subtitle_path = DownloadArtifactResolver()._normalize_names(
        media_path,
        None,
        preferred_stem='Patient Investor - 鈥淎I Won鈥檛 Replace Software!鈥: Jensen Huang? <CSU>',
    )

    assert normalized_subtitle_path is None
    assert (
        normalized_media_path.name
        == "Patient Investor - 鈥淎I Won鈥檛 Replace Software!鈥_ Jensen Huang_ _CSU_.mp4"
    )
    assert normalized_media_path.exists()
    assert not media_path.exists()
