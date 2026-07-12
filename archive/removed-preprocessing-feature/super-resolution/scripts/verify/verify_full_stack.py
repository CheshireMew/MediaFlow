import sys
import torch
import mmcv
try:
    from mmedit.models import build_model
except ImportError:
    print("mmedit not installed.")
    sys.exit(1)

def verify():
    print(f"Torch: {torch.__version__}")
    print(f"CUDA Available: {torch.cuda.is_available()}")
    if not torch.cuda.is_available():
        print("FAIL: CUDA missing.")
        return False
        
    print(f"MMCV: {mmcv.__version__}")
    
    # Check Model Load
    model_config = dict(
        type='BasicVSR',
        generator=dict(
            type='BasicVSRPlusPlus',
            mid_channels=64,
            num_blocks=7,
            is_low_res_input=True,
            spynet_pretrained='bin/models/spynet_20210409-c6c1bd09.pth'
        ),
        pixel_loss=dict(type='CharbonnierLoss', loss_weight=1.0, reduction='mean')
    )
    
    try:
        model = build_model(model_config, train_cfg=None, test_cfg=dict(metrics=['PSNR', 'SSIM'], crop_border=0))
        model.cuda() # Test GPU access
        print("Model built and moved to CUDA success.")
    except Exception as e:
        print(f"Model build failed: {e}")
        return False
        
    print("Full Stack Verified!")
    return True

if __name__ == "__main__":
    success = verify()
    sys.exit(0 if success else 1)
