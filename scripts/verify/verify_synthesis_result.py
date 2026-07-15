import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.application.synthesis_service import build_synthesis_worker_kwargs
from backend.models.media_contracts import MediaReference
from backend.models.synthesis_contracts import SynthesisRequest

def test_transformer():
    options = {"crf": 23}
    output_path = "E:\\test\\output.mp4"
    request = SynthesisRequest(
        video_ref=MediaReference(path="E:\\test\\input.mp4", name="input.mp4"),
        output_ref=MediaReference(path=output_path, name="output.mp4"),
        options=options,
    )
    worker_kwargs = build_synthesis_worker_kwargs(request)

    print(f"Worker kwargs: {worker_kwargs}")

    assert worker_kwargs["video_path"] == "E:\\test\\input.mp4"
    assert worker_kwargs["output_path"] == output_path
    assert worker_kwargs["srt_path"] is None
    assert worker_kwargs["options"] == options

    print("Verification PASSED!")

if __name__ == "__main__":
    test_transformer()
