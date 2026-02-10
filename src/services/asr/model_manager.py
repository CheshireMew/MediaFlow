import os
import shutil
from pathlib import Path
from typing import Optional, Any
from loguru import logger
from src.config import settings

class ModelManager:
    def __init__(self):
        self._model_instance = None
        self._current_model_name = None
        
    @property
    def model_map(self):
        return settings.ASR_MODELS

    def ensure_model_downloaded(self, model_name: str, progress_callback=None) -> str:
        """
        Ensure the model is downloaded to local storage, supporting ModelScope.
        Returns the local path to the model.
        """
        settings.ASR_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        
        model_repo_id = self.model_map.get(model_name, model_name)
        # CLI expects "faster-whisper-{model_name}" folder structure
        target_dir = settings.ASR_MODEL_DIR / f"faster-whisper-{model_name}"
        
        # If model exists and is not empty, return path
        if target_dir.exists() and any(target_dir.iterdir()):
             return str(target_dir)

        # Download Logic
        try:
            from modelscope.hub.snapshot_download import snapshot_download
            logger.info(f"Attempting download from ModelScope: {model_repo_id}")
            if progress_callback: progress_callback(0, f"Downloading model {model_name} from ModelScope...")
            
            local_model_path = snapshot_download(
                model_repo_id, 
                local_dir=str(target_dir) 
            )
            logger.success(f"Model downloaded to: {local_model_path}")
            if progress_callback: progress_callback(5, "Model downloaded.")
            return local_model_path
            
        except ImportError:
            logger.warning("ModelScope not installed, falling back to default (HuggingFace)...")
            if progress_callback: progress_callback(2, "ModelScope missing. Downloading from HuggingFace...")
            return model_name 
        except Exception as e:
            logger.error(f"ModelScope download failed: {e}. Falling back to default...")
            if progress_callback: progress_callback(2, f"Download failed, retrying... ({str(e)[:20]})")
            return model_name

    def load_model(self, model_name: str, device: str, progress_callback=None) -> Any:
        """
        Load or reload the Whisper model securely from the local models directory.
        """
        if self._model_instance and self._current_model_name == model_name:
            return self._model_instance
            
        logger.info(f"Loading Whisper Model: {model_name} on {device}...")
        
        # Lazy import to speed up app startup
        from faster_whisper import WhisperModel
        
        try:
            compute_type = "float16" if device == "cuda" else "int8"
            
            # Ensure model is downloaded (via ModelScope if possible)
            local_model_path = self.ensure_model_downloaded(model_name, progress_callback)
            
            # Load model
            if progress_callback: progress_callback(8, f"Initializing {model_name} on {device}...")
            self._model_instance = WhisperModel(
                local_model_path,
                device=device,
                compute_type=compute_type,
                download_root=str(settings.ASR_MODEL_DIR) if local_model_path == model_name else None
            )
            self._current_model_name = model_name
            logger.success(f"Model {model_name} loaded successfully.")
            if progress_callback: progress_callback(10, "Model loaded successfully.")
            return self._model_instance
            
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            raise RuntimeError(f"Model loading failed: {e}")
