import cv2
import numpy as np
from pathlib import Path
from loguru import logger
import subprocess
import asyncio

class CleanerService:
    MAX_PROPAINTER_FRAMES = 3000  # ~100 seconds at 30fps

    def __init__(self):
        pass

    def clean_video(self, input_path: str, output_path: str, roi: list, method: str = "telea", progress_callback=None):
        """
        Clean video by removing watermark in ROI.
        
        Args:
            input_path: Path to input video
            output_path: Path to output video
            roi: List [x, y, w, h] of the region to remove
            method: 'telea', 'navier' (OpenCV) or 'propainter' (AI)
            progress_callback: Function(percent, status_str)
        """
        logger.info(f"Cleaning video: {input_path}, ROI: {roi}, Method: {method}")
        
        if method in ["telea", "navier"]:
            flags = cv2.INPAINT_TELEA if method == "telea" else cv2.INPAINT_NS
            return self._clean_opencv(input_path, output_path, roi, flags, progress_callback)
        elif method == "propainter":
            return self._clean_propainter(input_path, output_path, roi, progress_callback)
        else:
            raise ValueError(f"Unknown cleaning method: {method}")

    def _clean_opencv(self, input_path, output_path, roi, flags, progress_callback):
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {input_path}")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # ROI validation
        if len(roi) != 4:
            raise ValueError("ROI must be [x, y, w, h]")
        
        x, y, w, h = map(int, roi)
        
        # Ensure ROI is within bounds
        x = max(0, min(x, width - 1))
        y = max(0, min(y, height - 1))
        w = max(1, min(w, width - x))
        h = max(1, min(h, height - y))

        logger.debug(f"Validated ROI: x={x}, y={y}, w={w}, h={h}")

        # Create localized mask for the ROI
        mask = np.zeros((height, width), dtype=np.uint8)
        mask[y:y+h, x:x+w] = 255
        
        # Optimization: Crop the mask to just the ROI + padding for faster processing?
        # cv2.inpaint expects full size image and mask. 
        # For performance on high-res video, we might want to crop, inpaint, paste back?
        # But cv2.inpaint is reasonably fast on small regions.

        # Setup VideoWriter
        # Use 'mp4v' or 'avc1'
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        if not out.isOpened():
            cap.release()
            raise RuntimeError(f"Could not create video writer: {output_path}")

        frame_count = 0
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                # Inpaint
                # radius=3 is standard for removing small text/lines
                dst = cv2.inpaint(frame, mask, 3, flags)

                out.write(dst)

                frame_count += 1
                if progress_callback and frame_count % 30 == 0:
                    if total_frames > 0:
                        percent = (frame_count / total_frames) * 100
                        progress_callback(percent, f"Cleaning... {percent:.1f}%")
        except Exception as e:
            logger.error(f"Error during OpenCV inpainting: {e}")
            raise e
        finally:
            cap.release()
            out.release()
        
        return output_path

    def _clean_propainter(self, input_path, output_path, roi, progress_callback):
        from backend.models.propainter_core.propainter_wrapper import ProPainterWrapper

        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {input_path}")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Memory guard: ProPainter loads all frames into memory
        if total_frames > self.MAX_PROPAINTER_FRAMES:
            cap.release()
            raise ValueError(
                f"Video too long for ProPainter ({total_frames} frames). "
                f"Max {self.MAX_PROPAINTER_FRAMES} frames (~{self.MAX_PROPAINTER_FRAMES // 30}s at 30fps). "
                f"Use OpenCV method (telea/navier) for long videos."
            )

        # ROI validation
        x, y, w, h = map(int, roi)
        x = max(0, min(x, width - 1))
        y = max(0, min(y, height - 1))
        w = max(1, min(w, width - x))
        h = max(1, min(h, height - y))

        # Read all frames (Memory warning: extensive usage for long videos)
        frames = []
        masks = []
        
        # Create common mask
        mask_base = np.zeros((height, width), dtype=np.uint8)
        mask_base[y:y+h, x:x+w] = 255

        if progress_callback: progress_callback(0, "Reading video frames...")
        
        while True:
            ret, frame = cap.read()
            if not ret: break
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame_rgb)
            masks.append(mask_base)
            
        cap.release()
        
        if not frames:
            raise RuntimeError("No frames read from video")

        logger.info(f"Loaded {len(frames)} frames for ProPainter processing. Resolution: {width}x{height}")

        # Instantiate Wrapper
        # Initialize only once per service lifetime ideally, but here per request for simplicity/cleanup
        if progress_callback: progress_callback(10, "Initializing AI model...")
        cleaner = ProPainterWrapper() # Device auto-detect (CPU likely)
        
        if progress_callback: progress_callback(20, "Running AI Inference (this is slow)...")
        
        # Run Inference
        try:
            cleaned_frames = cleaner.clean_video_frames(frames, masks)
        except Exception as e:
            logger.error(f"ProPainter inference failed: {e}")
            raise e
            
        # Write Output
        if progress_callback: progress_callback(90, "Saving video...")
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (cleaned_frames[0].shape[1], cleaned_frames[0].shape[0]))
        
        if not out.isOpened():
            raise RuntimeError(f"Could not create video writer: {output_path}")
            
        for i, frame in enumerate(cleaned_frames):
            # Convert RGB back to BGR
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            out.write(frame_bgr)
            
        out.release()
        
        if progress_callback: progress_callback(100, "Done")
        
        return output_path

