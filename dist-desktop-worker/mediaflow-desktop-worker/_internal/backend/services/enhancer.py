
from typing import Optional, Callable
from loguru import logger
from .realesrgan_service import RealESRGANService
from .basicvsr_service import BasicVSRService

class EnhancerService:
    """
    Unified Enhancer Service dispatcher.
    routes requests to 'realesrgan' (ncnn) or 'basicvsr' (pytorch).
    """
    def __init__(self):
        self._realesrgan = RealESRGANService()
        self._basicvsr = BasicVSRService()
        logger.info("EnhancerService initialized with RealESRGAN and BasicVSR backends.")

    def is_available(self, method: str = "realesrgan") -> bool:
        if method == "basicvsr":
            return self._basicvsr.is_available()
        return self._realesrgan.is_available()

    def upscale(
        self, 
        input_path: str, 
        output_path: str, 
        method: str = "realesrgan",
        model: Optional[str] = None, 
        scale: int = 4,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ):
        """
        Dispatch upscale task to specific backend.
        """
        logger.info(f"Enhancer upscale request: method={method}, input={input_path}")
        
        if method == "basicvsr":
            # Map parameters for BasicVSR
            kwargs = {}
            if model: kwargs['model'] = model
            if scale: kwargs['scale'] = scale
            return self._basicvsr.upscale(input_path, output_path, progress_callback=progress_callback, **kwargs)
        
        # Default to RealESRGAN
        kwargs = {}
        if model: kwargs['model'] = model
        if scale: kwargs['scale'] = scale
        # Ensure scale is int
        return self._realesrgan.upscale(input_path, output_path, progress_callback=progress_callback, **kwargs)

# For backward compatibility if needed, but better to update consumers
# RealESRGANService = RealESRGANService 
