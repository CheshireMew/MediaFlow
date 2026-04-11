import os
from loguru import logger
from PIL import Image
from psd_tools import PSDImage

class WatermarkProcessor:
    @staticmethod
    def process_watermark(input_path: str, output_path: str = None) -> str:
        """
        Process watermark (PSD or Image):
        1. Convert to PNG if needed.
        2. Trim transparent areas (Smart Crop).
        3. Save to output_path.
        """
        logger.info(f"Processing watermark: {input_path}")
        try:
            if not os.path.exists(input_path):
                raise FileNotFoundError(f"File not found: {input_path}")

            if not output_path:
                base, _ = os.path.splitext(input_path)
                output_path = f"{base}_trimmed.png"

            img = None
            
            # 1. Load Image
            if input_path.lower().endswith('.psd'):
                logger.debug("Opening PSD...")
                psd = PSDImage.open(input_path)
                img = psd.composite()
            else:
                logger.debug("Opening Image...")
                with Image.open(input_path) as source_img:
                    img = source_img.convert("RGBA")

            # 2. Smart Trim
            logger.debug("Calculating bounding box for trim...")
            bbox = img.getbbox()
            if bbox:
                logger.debug(f"Trimming transparent areas: {bbox}")
                img = img.crop(bbox)
            else:
                logger.warning("Image appears fully transparent.")

            # 3. Save
            logger.debug(f"Saving trimmed watermark to {output_path}...")
            img.save(output_path, format="PNG")
            
            logger.info(f"Watermark processed: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Failed to process watermark: {e}")
            raise
