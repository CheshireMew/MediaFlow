import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.archs.srvgg_arch import SRVGGNetCompact

def check_model(model_path):
    print(f"Checking {model_path}...")
    try:
        state_dict = torch.load(model_path, map_location='cpu')
        if 'params' in state_dict:
            state_dict = state_dict['params']
        
        # Check keys to guess architecture
        keys = list(state_dict.keys())
        print(f"Keys: {keys[:5]}...")
        
        # SRVGGNetCompact check
        if 'body.0.weight' in keys:
            print("Detected SRVGGNetCompact")
            model = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type='prelu')
            model.load_state_dict(state_dict, strict=True)
            print("SRVGGNetCompact Load Success")
            return
            
        # RRDBNet check
        if 'conv_first.weight' in keys:
            print("Detected RRDBNet")
            model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
            try:
                model.load_state_dict(state_dict, strict=True)
                print("RRDBNet Load Success")
            except:
                print("RRDBNet Load Failed (Mismatch?)")
            return

        print("Unknown Architecture")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_model("bin/models/realesr-general-x4v3.pth")
    check_model("bin/models/realesr-general-wdn-x4v3.pth")
