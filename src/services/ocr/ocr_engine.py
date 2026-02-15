from abc import ABC, abstractmethod
from typing import List, Optional, Any
import numpy as np
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

import os
import requests
from pathlib import Path
from tqdm import tqdm
from src.config import settings

logger = logging.getLogger(__name__)

class OCRResult(BaseModel):
    text: str
    box: List[List[int]]
    score: float

class OCREngine(ABC):
    @abstractmethod
    def extract_text(self, image: np.ndarray) -> List[OCRResult]:
        """Extract text from a numpy array image (BGR)"""
        pass

from typing import Callable

def download_file(url: str, dest_path: Path, progress_callback: Optional[Callable[[float, str], None]] = None):
    if dest_path.exists():
        return
    
    logger.info(f"Downloading {dest_path.name} from {url}...")
    try:
        # User defined proxy or system proxy
        proxies = {"http": settings.DOWNLOADER_PROXY, "https": settings.DOWNLOADER_PROXY} if settings.DOWNLOADER_PROXY else None
        
        with requests.get(url, stream=True, proxies=proxies, timeout=30) as r:
            r.raise_for_status()
            total_size = int(r.headers.get('content-length', 0))
            downloaded = 0
            
            import time
            last_update_time = 0
            
            with open(dest_path, 'wb') as f, tqdm(
                desc=dest_path.name,
                total=total_size,
                unit='iB',
                unit_scale=True,
                unit_divisor=1024,
            ) as bar:
                for chunk in r.iter_content(chunk_size=8192):
                    size = f.write(chunk)
                    downloaded += size
                    bar.update(size)
                    
                    if progress_callback and total_size > 0:
                        current_time = time.time()
                        if current_time - last_update_time >= 0.5 or downloaded == total_size:
                            progress = min(downloaded / total_size, 1.0)
                            try:
                                progress_callback(progress, f"Downloading {dest_path.name}")
                                last_update_time = current_time
                            except Exception:
                                pass

        logger.info(f"Downloaded {dest_path.name}")
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        # Cleanup partial file
        if dest_path.exists():
            dest_path.unlink()
        raise

class RapidOCREngine(OCREngine):
    def __init__(self):
        try:
            from rapidocr_onnxruntime import RapidOCR
            self._rapid_ocr_class = RapidOCR
        except ImportError:
            logger.error("rapidocr_onnxruntime is not installed.")
            raise ImportError("rapidocr_onnxruntime is not installed. Please pip install rapidocr_onnxruntime")
        
        self.model_dir = settings.OCR_MODEL_DIR / "rapid"
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.ocr = None
        
    def initialize_models(self, progress_callback: Optional[Callable[[float, str], None]] = None):
        if self.ocr:
            return

        # Validated paths as of 2026-02-15
        MODELS_CONFIG = {
            "det": {
                "filename": "ch_PP-OCRv4_det_infer.onnx",
                "hf_subpath": "PP-OCRv4",
                "gh_tag": "v1.3.0"
            },
            "rec": {
                "filename": "ch_PP-OCRv4_rec_infer.onnx", 
                "hf_subpath": "PP-OCRv4",
                "gh_tag": "v1.3.0"
            },
            "cls": {
                "filename": "ch_ppocr_mobile_v2.0_cls_infer.onnx",
                "hf_subpath": "PP-OCRv1", 
                "gh_tag": "v1.3.0" 
            }
        }
        
        use_custom_models = True
        paths = {}
        
        try:
            total_files = len(MODELS_CONFIG)
            current_file_idx = 0
            
            for key, config in MODELS_CONFIG.items():
                filename = config["filename"]
                hf_subpath = config["hf_subpath"]
                gh_tag = config["gh_tag"]
                
                path = self.model_dir / filename
                
                # specific ModelScope/HF paths
                candidates = [
                    # HF Mirror (Primary for CN) - explicit subdirectories
                    f"https://hf-mirror.com/SWHL/RapidOCR/resolve/main/{hf_subpath}/{filename}",
                    # Official HF
                    f"https://huggingface.co/SWHL/RapidOCR/resolve/main/{hf_subpath}/{filename}",
                    # GitHub Releases (Assets are flattened)
                    f"https://mirror.ghproxy.com/https://github.com/RapidAI/RapidOCR/releases/download/{gh_tag}/{filename}", 
                    f"https://ghproxy.net/https://github.com/RapidAI/RapidOCR/releases/download/{gh_tag}/{filename}",
                    f"https://github.com/RapidAI/RapidOCR/releases/download/{gh_tag}/{filename}"
                ]
                
                if not path.exists():
                    success = False
                    
                    # Wrap callback to scale it (0.0-1.0) based on file index
                    def file_progress(p, msg):
                        if progress_callback:
                            # scale p (0-1) to total progress
                            # e.g. file 0: 0-0.33, file 1: 0.33-0.66
                            base_p = current_file_idx / total_files
                            scaled_p = base_p + (p / total_files)
                            progress_callback(scaled_p, msg)

                    for url in candidates:
                        try:
                            logger.info(f"Attempting download of {filename} from {url}...")
                            download_file(url, path, progress_callback=file_progress)
                            success = True
                            break
                        except Exception as e:
                            logger.warning(f"Failed to download from {url}: {e}")
                    
                    if not success:
                         logger.warning(f"Failed to download {filename} to {self.model_dir}. Switching to default RapidOCR behavior.")
                         use_custom_models = False
                         break
                else:
                    # File exists, just report progress
                    if progress_callback:
                         p = (current_file_idx + 1) / total_files
                         progress_callback(p, f"Verified {filename}")
                
                paths[key] = str(path)
                current_file_idx += 1
                
        except Exception as e:
            logger.error(f"Error setting up custom models: {e}")
            use_custom_models = False

        if use_custom_models:
            logger.info(f"Initializing RapidOCR with custom models in {self.model_dir}")
            self.ocr = self._rapid_ocr_class(
                det_model_path=paths["det"],
                rec_model_path=paths["rec"],
                cls_model_path=paths["cls"]
            )
        else:
            logger.info("Initializing RapidOCR with default models (checking ~/.rapidocr)")
            self.ocr = self._rapid_ocr_class()
            
        logger.info("RapidOCREngine initialized successfully")

    def extract_text(self, image: np.ndarray) -> List[OCRResult]:
        if not self.ocr:
            self.initialize_models()

        # RapidOCR expects standard numpy array (H, W, C)
        try:
            # result format: list of [box, text, score]
            # box: list of 4 points [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            result, _ = self.ocr(image)
        except Exception as e:
            logger.error(f"Error during RapidOCR inference: {e}")
            return []

        if not result:
            return []
        
        results = []
        for line in result:
            if not line or len(line) < 3:
                continue
                
            box, text, score = line
            
            # Ensure box is a list for Pydantic
            if hasattr(box, 'tolist'):
                box = box.tolist()
            
            results.append(OCRResult(text=str(text), box=box, score=float(score)))
            
        return results

class PaddleOCREngine(OCREngine):
    def __init__(self, use_gpu: bool = False):
        try:
            from paddleocr import PaddleOCR
        except ImportError:
            logger.error("paddleocr is not installed.")
            raise ImportError("paddleocr is not installed. Please pip install paddlepaddle paddleocr")

        # PaddleOCR handles its own downloads effectively from Baidu mirrors which are fast in China.
        # We can specify 'det_model_dir' etc if we really want to isolate them, 
        # but PaddleOCR's internal logic for model management is complex (versioning etc).
        # For 'dual engine' strategy, allowing Paddle default behavior (downloading to ~/.paddleocr) 
        # is usually safer unless strictly required to be portable.
        # However, if the user insists on 'models' folder, we can attempt to set the base directory?
        # PaddleOCR doesn't expose a clean 'root_dir'. 
        
        # use_angle_cls=True allows detecting rotated text
        # lang='ch' supports Chinese and English
        self.ocr = PaddleOCR(use_angle_cls=True, lang='ch', use_gpu=use_gpu, show_log=False)
        logger.info("PaddleOCREngine initialized successfully")

    def extract_text(self, image: np.ndarray) -> List[OCRResult]:
        try:
            # PaddleOCR result is a list of lists (one for each image if batching, but here we pass one)
            # result structure: [[[[x1,y1],...], (text, score)], ...]
            result = self.ocr.ocr(image, cls=True)
        except Exception as e:
            logger.error(f"Error during PaddleOCR inference: {e}")
            return []

        if not result or result[0] is None:
            return []
            
        results = []
        # PaddleOCR returns a list of results for each image. distinct from RapidOCR structure
        # We process result[0]
        for line in result[0]:
            # line structure: [box, (text, score)]
            box, (text, score) = line
            
            results.append(OCRResult(text=str(text), box=box, score=float(score)))
            
        return results
