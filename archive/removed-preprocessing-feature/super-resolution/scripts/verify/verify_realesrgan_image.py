
import os
from backend.services.realesrgan_service import RealESRGANService

def verify_image_upscale():
    service = RealESRGANService()
    if not service.is_available():
        print("Real-ESRGAN binary not found, skipping test.")
        return

    # Create dummy image
    from PIL import Image
    dummy_img_path = "test_image.jpg"
    output_img_path = "test_image_out.jpg"
    
    img = Image.new('RGB', (100, 100), color = 'red')
    img.save(dummy_img_path)
    
    try:
        print(f"Upscaling {dummy_img_path}...")
        service.upscale(dummy_img_path, output_img_path, scale=2)
        
        if os.path.exists(output_img_path):
            print(f"Success! Output image created at {output_img_path}")
            # Optional: Check dimensions if needed
        else:
            print("Failure: Output image not found.")
            
    except Exception as e:
        print(f"Error during image upscale: {e}")
    finally:
        if os.path.exists(dummy_img_path): os.remove(dummy_img_path)
        if os.path.exists(output_img_path): os.remove(output_img_path)

if __name__ == "__main__":
    verify_image_upscale()
