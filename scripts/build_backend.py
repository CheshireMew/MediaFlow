import os
import sys
import PyInstaller.__main__

def build():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    entry_point = os.path.join(root_dir, "run.py")
    dist_path = os.path.join(root_dir, "dist-backend")
    work_path = os.path.join(root_dir, "build-backend")

    PyInstaller.__main__.run([
        entry_point,
        '--name', 'mediaflow-backend',
        '--onedir',   # output as a directory instead of a single massive exe to speed up startup
        '--windowed', # No console window (Electron will orchestrate)
        '--noconfirm',
        '--clean',
        '--distpath', dist_path,
        '--workpath', work_path,
        
        # FastAPI / Uvicorn hidden imports
        '--hidden-import', 'uvicorn.logging',
        '--hidden-import', 'uvicorn.loops',
        '--hidden-import', 'uvicorn.loops.auto',
        '--hidden-import', 'uvicorn.protocols',
        '--hidden-import', 'uvicorn.protocols.http',
        '--hidden-import', 'uvicorn.protocols.http.auto',
        '--hidden-import', 'uvicorn.protocols.websockets',
        '--hidden-import', 'uvicorn.protocols.websockets.auto',
        '--hidden-import', 'uvicorn.lifespan',
        '--hidden-import', 'uvicorn.lifespan.on',
        '--hidden-import', 'fastapi',
        '--hidden-import', 'pydantic',
        '--hidden-import', 'loguru',
        
        # Audio/Video processing
        '--hidden-import', 'ffmpeg',
        '--hidden-import', 'faster_whisper',
        '--hidden-import', 'torch',
        '--hidden-import', 'torchaudio',
        '--hidden-import', 'torchvision',
        
        # Add entire backend package structure
        '--add-data', f'{os.path.join(root_dir, "backend")};backend',
    ])

if __name__ == "__main__":
    print(f"Starting PyInstaller build for MediaFlow Backend...")
    build()
    print(f"Build completed successfully! Outputs are in dist-backend/mediaflow-backend")
