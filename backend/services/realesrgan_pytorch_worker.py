import argparse
import sys
import os
import torch
import cv2
import time
import queue
import threading
from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.archs.srvgg_arch import SRVGGNetCompact
from realesrgan import RealESRGANer

def get_model_instance(model_path, device):
    state_dict = torch.load(model_path, map_location='cpu')
    if 'params' in state_dict:
        state_dict = state_dict['params']
    
    keys = list(state_dict.keys())
    
    # SRVGGNetCompact
    if 'body.0.weight' in keys:
        model = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type='prelu')
        model.load_state_dict(state_dict, strict=True)
        return model, 4 # Assuming scale 4 for these specific models
        
    # RRDBNet (Standard x4plus)
    if 'conv_first.weight' in keys:
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        model.load_state_dict(state_dict, strict=True)
        return model, 4
        
    # AnimeVideo v3 (SRVGGNetCompactCompact? Or just SRVGGNetCompact with different params?)
    # For now, support these two active cases.
    raise ValueError(f"Unsupported model architecture: {model_path}")

def main():
    # Force utf-8 encoding for standard outputs to prevent IPC crashes on Windows
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if callable(reconfigure):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    reconfigure_err = getattr(sys.stderr, "reconfigure", None)
    if callable(reconfigure_err):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=str, required=True)
    parser.add_argument('--output', type=str, required=True)
    parser.add_argument('--model_path', type=str, required=True)
    parser.add_argument('--tile', type=int, default=0) # 0 for auto/no-tile
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Input not found: {args.input}")
        sys.exit(1)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    try:
        model, scale = get_model_instance(args.model_path, device)
        model.to(device)
        model.eval()
        
        upsampler = RealESRGANer(
            scale=scale,
            model_path=None, # Already loaded model
            model=model,
            tile=args.tile,
            tile_pad=10,
            pre_pad=0,
            half=True, # FP16
            device=device
        )
        
        # Open Video
        cap = cv2.VideoCapture(args.input)
        if not cap.isOpened():
            print("Failed to open video")
            sys.exit(1)
            
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        out_width = width * scale
        out_height = height * scale
        
        print(f"Input: {width}x{height} @ {fps}fps")
        print(f"Output: {out_width}x{out_height}")
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(args.output, fourcc, fps, (out_width, out_height))
        
        frame_idx = 0
        start_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            try:
                # Upscale
                # RealESRGANer expects BGR (cv2 default)
                # enhance returns (output, img_mode)
                output, _ = upsampler.enhance(frame, outscale=scale)
                
                writer.write(output)
                
                frame_idx += 1
                if frame_idx % 10 == 0:
                    print(f"Progress: {(frame_idx/total_frames)*100:.1f}%")
                    sys.stdout.flush()
            except Exception as e:
                print(f"Error processing frame {frame_idx}: {e}")
                break
                
        cap.release()
        writer.release()
        
        duration = time.time() - start_time
        print(f"Finished in {duration:.2f}s ({frame_idx/duration:.1f} fps)")

    except Exception as e:
        print(f"Fatal Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
