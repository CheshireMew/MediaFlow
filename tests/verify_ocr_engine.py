import sys
import os
import cv2
import numpy as np

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.services.ocr.ocr_engine import RapidOCREngine

def test_ocr():
    print("Initializing RapidOCREngine...")
    try:
        engine = RapidOCREngine()
    except ImportError:
        print("Skipping test: rapidocr_onnxruntime not installed.")
        return

    # Create an image with text
    print("Creating synthetic image...")
    img = np.zeros((200, 600, 3), dtype=np.uint8)
    # White text on black background
    cv2.putText(img, "Hello World", (50, 120), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
    
    # Save for debugging
    # cv2.imwrite("test_ocr.png", img)
    
    print("Running OCR extraction...")
    results = engine.extract_text(img)
    
    print(f"Found {len(results)} text blocks.")
    for res in results:
        print(f"Text: '{res.text}', Score: {res.score}, Box: {res.box}")
        
    if len(results) > 0:
        print("SUCCESS: OCR detected text.")
    else:
        print("FAILURE: OCR detected nothing.")

if __name__ == "__main__":
    test_ocr()
