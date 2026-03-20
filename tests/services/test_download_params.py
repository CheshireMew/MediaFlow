from backend.models.schemas import DownloadParams


def test_download_params_accepts_codec_and_filename():
    params = DownloadParams(
        url="https://example.com/video",
        filename="custom-name",
        codec="avc",
    )

    assert params.filename == "custom-name"
    assert params.codec == "avc"


def test_download_params_maps_legacy_output_filename():
    params = DownloadParams(
        url="https://example.com/video",
        output_filename="legacy-name",
    )

    assert params.filename == "legacy-name"
    assert params.output_filename == "legacy-name"
