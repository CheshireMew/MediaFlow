from loguru import logger

class CleanerService:
    def __init__(self):
        pass

    @staticmethod
    def _opencv_dependencies():
        try:
            import cv2
            import numpy as np
        except ImportError as exc:
            raise RuntimeError(
                "Video cleanup requires the optional OpenCV dependencies."
            ) from exc
        return cv2, np

    def clean_video(self, input_path: str, output_path: str, roi: list, method: str = "telea", progress_callback=None):
        """
        Clean video by removing watermark in ROI.
        
        Args:
            input_path: Path to input video
            output_path: Path to output video
            roi: List [x, y, w, h] of the region to remove
            method: 'telea' or 'navier' (OpenCV)
            progress_callback: Function(percent, message_code, message_params)
        """
        logger.info(f"Cleaning video: {input_path}, ROI: {roi}, Method: {method}")
        if method not in {"telea", "navier"}:
            raise ValueError(f"Unknown cleaning method: {method}")
        cv2, _ = self._opencv_dependencies()
        flags = cv2.INPAINT_TELEA if method == "telea" else cv2.INPAINT_NS
        return self._clean_opencv(input_path, output_path, roi, flags, progress_callback)

    def _clean_opencv(self, input_path, output_path, roi, flags, progress_callback):
        cv2, np = self._opencv_dependencies()
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
                        progress_callback(
                            percent,
                            "cleanup_progress",
                            {"percent": round(percent, 1)},
                        )
        except Exception as e:
            logger.error(f"Error during OpenCV inpainting: {e}")
            raise e
        finally:
            cap.release()
            out.release()
        
        return output_path
