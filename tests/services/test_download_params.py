from backend.models.pipeline_contracts import DownloadParams


def test_download_params_accepts_codec_and_filename():
    params = DownloadParams(
        url="https://example.com/video",
        filename="custom-name",
        codec="avc",
    )

    assert params.filename == "custom-name"
    assert params.codec == "avc"

