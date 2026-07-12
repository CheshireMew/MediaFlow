import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.application.synthesis_service import build_synthesis_task_result
from backend.models.schemas import TaskResult

def test_transformer():
    options = {"crf": 23}
    output_path = "E:\\test\\output.mp4"
    result = TaskResult.model_validate(
        build_synthesis_task_result(output_path, options)
    )

    print(f"Result: {result}")

    assert result.success is True
    assert len(result.artifacts) == 1
    assert result.artifacts[0].kind == "video"
    assert result.artifacts[0].role == "output"
    assert result.artifacts[0].ref.path == output_path
    assert result.meta == {"options": options}

    print("Verification PASSED!")

if __name__ == "__main__":
    test_transformer()
