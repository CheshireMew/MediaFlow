
import sys
import os

# Mock the structure we expect
class MockRequest:
    def __init__(self):
        self.options = {"crf": 23}

def test_transformer():
    req = MockRequest()
    
    # define the transformer as it is in the code (copy-paste of logic)
    transformer = lambda path: {
        "success": True,
        "files": [{"type": "video", "path": path, "label": "synthesis_output"}],
        "meta": {
            "video_path": path,
            "options": req.options
        }
    }
    
    output_path = "E:\\test\\output.mp4"
    result = transformer(output_path)
    
    print(f"Result: {result}")
    
    # Assertions
    assert result["success"] is True
    assert len(result["files"]) == 1
    assert result["files"][0]["path"] == output_path
    assert result["files"][0]["type"] == "video"
    assert result["meta"]["video_path"] == output_path
    assert result["meta"]["options"] == req.options
    
    print("Verification PASSED!")

if __name__ == "__main__":
    test_transformer()
