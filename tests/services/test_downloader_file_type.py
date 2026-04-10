from backend.services.downloader.artifacts import infer_media_file_type


def test_infer_media_file_type_returns_audio_for_audio_extensions():
    assert infer_media_file_type("sample.m4a") == "audio"
    assert infer_media_file_type("sample.mp3") == "audio"


def test_infer_media_file_type_returns_video_for_video_extensions():
    assert infer_media_file_type("sample.mp4") == "video"
    assert infer_media_file_type("sample.webm") == "video"
