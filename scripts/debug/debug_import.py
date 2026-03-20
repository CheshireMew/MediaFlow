
import sys
import os
from pathlib import Path

# Add project root
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

print(f"Root: {root}")
print(f"Sys Path: {sys.path}")

print("Checking backend/models/propainter_core structure:")
p_core = root / "backend" / "models" / "propainter_core"
if p_core.exists():
    print(f"  {p_core} exists")
    print(f"  Contents: {[x.name for x in p_core.iterdir()]}")
else:
    print(f"  {p_core} does not exist")

print("Attempting import...")
try:
    from backend.models.propainter_core.propainter_wrapper import ProPainterWrapper
    print("Import SUCCESS")
    p = ProPainterWrapper()
    print("Instantiation SUCCESS")
except Exception as e:
    print(f"Import FAILED: {e}")
    import traceback
    traceback.print_exc()
