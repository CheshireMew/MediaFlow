import pytest
from pydantic import ValidationError

from backend.models.schemas import CleanRequest
from backend.services.cleaner import CleanerService


def test_cleanup_contract_rejects_unimplemented_methods():
    with pytest.raises(ValidationError):
        CleanRequest.model_validate(
            {
                "video_ref": {"path": "D:/media/input.mp4", "name": "input.mp4"},
                "roi": [0, 0, 100, 100],
                "method": "propainter",
            }
        )

    with pytest.raises(ValueError, match="Unknown cleaning method: propainter"):
        CleanerService().clean_video(
            "D:/media/input.mp4",
            "D:/media/output.mp4",
            [0, 0, 100, 100],
            method="propainter",
        )
