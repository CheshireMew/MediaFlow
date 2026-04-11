import argparse
import sys
import os
import torch
import mmcv
import numpy as np
import cv2
import time
from mmcv.runner import load_checkpoint
# Try importing, handle if not installed yet (will error at runtime if missing)
try:
    from mmedit.models import build_model
except ImportError:
    print("mmedit not found. Please run install_mmedit.py")
    sys.exit(1)

def chunked_inference(model, video_reader, writer, window_size=30, overlap=10):
    """
    Run inference on video in chunks with overlap to maintain temporal consistency
    and avoid boundary artifacts.
    """
    total_frames = len(video_reader)
    device = torch.device('cuda')
    
    # Pre-allocate buffer logic
    # We step by (window_size - overlap)
    step = window_size - overlap
    
    for i in range(0, total_frames, step):
        # Determine chunk range
        start_idx = i
        end_idx = min(i + window_size, total_frames)
        
        # If the remaining chunk is too small (e.g. just overlap size), merge with previous?
        # Simpler: Just process it. BasicVSR handles variable length.
        
        # Read frames for this chunk
        chunk_frames = []
        for j in range(start_idx, end_idx):
            frame = video_reader[j] # MMVC VideoReader allows index access
            chunk_frames.append(frame)
            
        if not chunk_frames:
            break
            
        # Convert to Tensor (N, T, C, H, W) -> MMEdit expects (1, T, C, H, W)
        # Frames are H, W, C (BGR) from mmcv
        # Need to normalize to [0, 1] and RGB
        
        # Convert list of arrays to single array
        chunk_np = np.stack(chunk_frames) # (T, H, W, C)
        
        # Convert BGR to RGB, normalize, transpose to (T, C, H, W)
        chunk_np = chunk_np[..., ::-1] / 255.0
        chunk_tensor = torch.from_numpy(chunk_np.transpose(0, 3, 1, 2)).float()
        
        # Add batch dim -> (1, T, C, H, W)
        chunk_tensor = chunk_tensor.unsqueeze(0).to(device)
        
        # Pad to multiple of 16 to avoid size mismatch in downsampling layers
        _, _, _, h, w = chunk_tensor.shape
        multiple = 16
        pad_h = (multiple - h % multiple) % multiple
        pad_w = (multiple - w % multiple) % multiple
        if pad_h > 0 or pad_w > 0:
            chunk_tensor = torch.nn.functional.pad(chunk_tensor, (0, pad_w, 0, pad_h), mode='reflect')
        
        # Run Inference
        with torch.no_grad():
            output = model(chunk_tensor, test_mode=True)['output']
            # Output is (1, T, C, H_out, W_out)
            
        # Crop padding
        if pad_h > 0 or pad_w > 0:
            # Output is scaled by 4
            scale = 4
            output = output[..., :h*scale, :w*scale]
        
        # Post-process and Write
        output_np = output.squeeze(0).cpu().numpy() # (T, C, H, W)
        output_np = output_np.transpose(0, 2, 3, 1) # (T, H, W, C)
        output_np = (output_np * 255.0).clip(0, 255).astype(np.uint8)
        output_np = output_np[..., ::-1] # RGB to BGR for cv2/mmcv writing
        
        # Determine which frames to keep
        # For the first chunk, keep [0 : step]
        # For middle chunks, keep [overlap//2 : step + overlap//2] ?
        # Standard overlap-save:
        # If I am chunk 0 (0-30), I output 0-20. (Valid 0-20, Garbage 20-30 due to future).
        # Chunk 1 (20-50), I output 20-40. (Corrects 20-30 with future info, Valid 30-40, Garbage 40-50).
        # We need to act carefully.
        
        # Simplification:
        # Keep frames [0 : step] if first chunk.
        # Else keep [0 : step] of local result?
        # Actually, BasicVSR is bidirectional. The *ENDS* are problematic.
        # To get perfect frame 20, we need 0-30.
        # So for Chunk 0 (0-30), frames 0-25 are good. 25-30 might be weak.
        # Chunk 1 (20-50), frames 25-45 are good.
        # So we overlap.
        
        # Logic: 
        # Global Frame Index `j` maps to Chunk Index `k`.
        # We want to write `step` frames per iteration, except last.
        
        if i == 0:
            # First chunk: write [0 : step]
            # Actually, to be safe, write [0 : window - overlap/2]
            frames_to_write = output_np[:step]
        elif end_idx == total_frames:
            # Last chunk: write everything remaining? 
            # We already wrote up to `i`.
            # Wait, `step` is 20. `i` increments by 20.
            # So `i` matches the write pointer!
            # We just need to write the valid middle part.
            
            # Since Bidirectional looks at BOTH ends, the *start* of this chunk (which was the *end* of prev) is now better.
            # But we already wrote the previous chunk's end.
            
            # Ideally:
            # Chunk 0: Process 0-30. Write 0-20.
            # Chunk 1: Process 20-50. Write 20-40. 
            # (Note Input 20-30 re-processed. Output 20-30 is now "refined").
            
            frames_to_write = output_np[:] # Write all (overlap handles "start"?)
            
            # Actually, if we naively write sequentially:
            # Iter 0: write 0-20.
            # Iter 1: write 20-40. (Input starts at 20. Output starts at 20).
            # Yes. This works. The first few frames of output_np correspond to 20+.
            # Are they improved? Yes, because they have future context (20-50).
            # The previous iteration's 20-30 lacked future context beyond 30.
            # So re-calculating 20-40 is correct.
            
            frames_to_write = output_np # Write full duration logic locally?
            
            pass 
        else:
             pass
        
        # Correct logic is simpler:
        # Just write `output_np[:step]`?
        # If I write 0-20.
        # Next iter starts at 20.
        # Process 20-50. Output 20-50.
        # Write 0-20 relative (so 20-40 global).
        # This matches.
        
        if end_idx == total_frames:
             # Last chunk, write everything
             frames_to_write = output_np
        else:
             # Non-last chunk, write up to step
             frames_to_write = output_np[:step]
             
        for frame in frames_to_write:
            writer.write(frame)
            
        print(f"Progress: {(min(end_idx, total_frames)/total_frames)*100:.1f}%")
        sys.stdout.flush()

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
    parser.add_argument('--model', type=str, default='basicvsr_plusplus_c64n7_8x1_600k_reds4')
    parser.add_argument('--checkpoint', type=str, default='bin/models/basicvsr_plusplus_c64n7_8x1_600k_reds4.pth')
    args = parser.parse_args()

    # Config
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
    
    # Initialize
    device = torch.device('cuda')
    model = build_model(model_config, train_cfg=None, test_cfg=dict(metrics=['PSNR', 'SSIM'], crop_border=0))
    load_checkpoint(model, args.checkpoint, map_location='cuda')
    model.to(device)
    model.eval()
    
    # Video I/O
    video_reader = mmcv.VideoReader(args.input)
    width = video_reader.width
    height = video_reader.height
    fps = video_reader.fps
    
    # Upscale 4x
    scale = 4
    out_width = width * scale
    out_height = height * scale
    
    # Use cv2 writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video_writer = cv2.VideoWriter(args.output, fourcc, fps, (out_width, out_height))
    
    try:
        start_time = time.time()
        chunked_inference(model, video_reader, video_writer)
        print(f"Inference finished in {time.time() - start_time:.2f}s")
    finally:
        video_writer.release()

if __name__ == '__main__':
    main()
