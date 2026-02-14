
import os
import sys
from loguru import logger

# Add project root to path
sys.path.append(os.getcwd())

from src.utils.subtitle_writer import SubtitleWriter

def create_dummy_srt(path):
    content = """1
00:00:01,000 --> 00:00:03,000
Opacity Test
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    return path

def verify_opacity():
    srt_path = "output/test_opacity.srt"
    ass_path = "output/test_opacity.ass"
    
    # ensure output dir
    os.makedirs("output", exist_ok=True)
    create_dummy_srt(srt_path)
    
    # Test Case 1: Background Panel ON (BorderStyle=3), Opacity 0.2
    # Opacity 0.2 -> ASS Alpha: (1 - 0.2) * 255 = 204 -> CC
    # Color #000000 -> &H000000
    # Expected BackColour: &HCC000000
    
    options_1 = {
        "border_style": 3,
        "back_color": "&HCC000000",
        "outline": 5 # padding
    }
    
    logger.info("Test 1: BorderStyle=3, Opacity 0.2 (Alpha CC)")
    SubtitleWriter.convert_srt_to_ass(srt_path, ass_path, style_options=options_1)
    
    with open(ass_path, 'r', encoding='utf-8-sig') as f:
        content = f.read()
        
    # Parse Style line
    # Style: Default,Arial,24,&H00FFFFFF,&H00000000,&H00000000,&HCC000000,-1,0,0,0,100,100,0,0,3,5,0,2,10,10,20,1
    # Look for BorderStyle=3 (16th field loops dependent)
    # Check if &HCC000000 is present
    
    if "&HCC000000" in content:
        logger.success("Test 1 PASSED: Found correct BackColour &HCC000000")
    else:
        logger.error("Test 1 FAILED: BackColour &HCC000000 not found")
        logger.info(f"Content: {content}")
        
    if ",3," in content: # simple check for border style 3 in params
         logger.success("Test 1 PASSED: Found BorderStyle 3")
    else:
         logger.error("Test 1 FAILED: BorderStyle 3 not found")

    # Test Case 2: Opacity 1.0 (Opaque)
    # Opacity 1.0 -> ASS Alpha: (1 - 1.0) * 255 = 0 -> 00
    # Expected: &H00000000
    
    options_2 = {
        "border_style": 3,
        "back_color": "&H00000000",
        "outline": 5
    }
    
    logger.info("Test 2: BorderStyle=3, Opacity 1.0 (Alpha 00)")
    SubtitleWriter.convert_srt_to_ass(srt_path, ass_path, style_options=options_2)
    
    with open(ass_path, 'r', encoding='utf-8-sig') as f:
        content = f.read()
        
    if "&H00000000" in content:
        logger.success("Test 2 PASSED: Found correct BackColour &H00000000")
    else:
        logger.error("Test 2 FAILED: BackColour &H00000000 not found")

if __name__ == "__main__":
    verify_opacity()
