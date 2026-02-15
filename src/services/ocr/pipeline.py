import cv2
import numpy as np
from typing import List, Optional, Tuple, Dict, Callable
from pydantic import BaseModel
import logging
from .ocr_engine import OCREngine, OCRResult

logger = logging.getLogger(__name__)

class TextEvent(BaseModel):
    start: float
    end: float
    text: str
    box: List[List[int]] = []

class VideoOCRPipeline:
    def __init__(self, engine: OCREngine):
        self.engine = engine

    def _mse(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate Mean Squared Error between two images."""
        h, w = img1.shape[:2]
        diff = cv2.subtract(img1, img2)
        err = np.sum(diff**2)
        mse = err / (float(h * w * 3) if len(img1.shape) == 3 else float(h * w))
        return mse

    def _resize_for_speed(self, img: np.ndarray, width: int = 320) -> np.ndarray:
        h, w = img.shape[:2]
        if w <= width:
            return img
        ratio = width / float(w)
        dim = (width, int(h * ratio))
        return cv2.resize(img, dim, interpolation=cv2.INTER_AREA)

    def process_video(
        self, 
        video_path: str, 
        roi: Optional[Tuple[int, int, int, int]] = None, 
        sample_rate: int = 2,
        similarity_threshold: float = 10.0, # MSE threshold to consider frames different
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> List[TextEvent]:
        """
        Process a video to extract text events.
        
        Args:
            video_path: Path to video file.
            roi: Region of Interest (x, y, w, h). If None, full frame is used.
            sample_rate: Frames per second to process.
            similarity_threshold: Threshold for frame difference to trigger OCR. High = less sensitive.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        
        # Calculate frame interval based on sample_rate
        # If sample_rate is 0 or higher than FPS, strictly process every frame is too slow,
        # but let's assume sample_rate is target fps for processing.
        step = max(1, int(fps / sample_rate))
        
        events: List[TextEvent] = []
        current_event: Optional[TextEvent] = None
        
        prev_roi_frame_small: Optional[np.ndarray] = None
        last_processed_text: str = ""
        
        logger.info(f"Starting OCR processing for {video_path}. FPS: {fps}, Duration: {duration}s, Step: {step}")

        frame_idx = 0
        while True:
            # Efficiently skip frames
            if step > 1:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            
            # Progress update
            if progress_callback and total_frames > 0:
                progress = min(frame_idx / total_frames, 1.0)
                try:
                    progress_callback(progress, f"Scanning frame {frame_idx}/{total_frames}")
                except Exception:
                    pass
            
            ret, frame = cap.read()
            if not ret:
                break

            current_time = frame_idx / fps

            # Apply ROI cropping
            if roi:
                x, y, w, h = roi
                # validate roi
                h_img, w_img = frame.shape[:2]
                x = max(0, min(x, w_img - 1))
                y = max(0, min(y, h_img - 1))
                w = max(1, min(w, w_img - x))
                h = max(1, min(h, h_img - y))
                roi_frame = frame[y:y+h, x:x+w]
            else:
                roi_frame = frame

            # Visual Difference Check
            # Resize for faster comparison
            roi_frame_small = self._resize_for_speed(roi_frame)
            
            should_run_ocr = True
            if prev_roi_frame_small is not None:
                # Compare with previous processed frame
                error = self._mse(roi_frame_small, prev_roi_frame_small)
                if error < similarity_threshold:
                    should_run_ocr = False
            
            ocr_text = ""
            box = []
            
            if should_run_ocr:
                try:
                    results = self.engine.extract_text(roi_frame)
                    # For subtitle extraction, we usually care about the most prominent text
                    # Or we can join all text. Since subtitles are usually at bottom, 
                    # we might just join them with newline.
                    # Sort by Y position
                    results.sort(key=lambda r: r.box[0][1] if r.box else 0)
                    ocr_text = "\n".join([r.text for r in results]).strip()
                    if results:
                        box = results[0].box # Keep coordinates of first line for now
                    
                    prev_roi_frame_small = roi_frame_small
                except Exception as e:
                    logger.error(f"OCR failed at frame {frame_idx}: {e}")
            else:
                # If frame is similar, assume text is same as last time
                ocr_text = last_processed_text

            # Event Merging Logic
            if ocr_text:
                should_merge = False
                if current_event:
                    # check similarity
                    import difflib
                    s = difflib.SequenceMatcher(None, current_event.text, ocr_text)
                    ratio = s.ratio()
                    
                    # Merge if very similar OR one is a substring of another (typewriter effect)
                    # For substring, we want substantial overlap.
                    is_substring = current_event.text in ocr_text or ocr_text in current_event.text
                    
                    if ratio > 0.85 or (is_substring and len(ocr_text) > 3):
                        should_merge = True
                        
                        # Update text if new text is longer (assume it's the "complete" version)
                        if len(ocr_text) > len(current_event.text):
                             current_event.text = ocr_text
                             current_event.box = box # Update box to match new text

                if should_merge:
                    # Extend current event
                    current_event.end = current_time + (step / fps)
                else:
                    # Close previous event if exists
                    if current_event:
                        events.append(current_event)
                    
                    # Start new event
                    current_event = TextEvent(
                        start=current_time,
                        end=current_time + (step / fps),
                        text=ocr_text,
                        box=box
                    )
            else:
                # No text found
                if current_event:
                    events.append(current_event)
                    current_event = None
            
            last_processed_text = ocr_text
            frame_idx += step

        # Append last event
        if current_event:
            events.append(current_event)

        cap.release()
        
        # Post-processing: Merge very close events or filter short ones?
        # For now, return raw events
        return events
