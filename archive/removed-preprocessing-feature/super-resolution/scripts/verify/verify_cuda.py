import torch
import sys

print(f"Torch Version: {torch.__version__}")
if torch.cuda.is_available():
    print("CUDA is available.")
    print(f"Device: {torch.cuda.get_device_name(0)}")
    sys.exit(0)
else:
    print("CUDA is NOT available (CPU only).")
    sys.exit(1)
