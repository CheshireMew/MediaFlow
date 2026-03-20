import os
import sys
import PyInstaller.__main__

def build():
    os.environ.setdefault("ENABLE_EXPERIMENTAL_PREPROCESSING", "false")

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
        '--exclude-module', 'torch',
        '--exclude-module', 'torchaudio',
        '--exclude-module', 'torchvision',
        '--exclude-module', 'basicsr',
        '--exclude-module', 'realesrgan',
        '--exclude-module', 'mmcv',
        '--exclude-module', 'mmedit',
        '--exclude-module', 'pandas',
        '--exclude-module', 'pandas.plotting',
        '--exclude-module', 'matplotlib',
        '--exclude-module', 'matplotlib.backends',
        '--exclude-module', 'matplotlib.pyplot',
        '--exclude-module', 'PyQt5',
        '--exclude-module', 'ctranslate2.converters',
        '--exclude-module', 'transformers',
        '--exclude-module', 'librosa',
        '--exclude-module', 'sklearn',
        '--exclude-module', 'numba',
        '--exclude-module', 'llvmlite',
        '--exclude-module', 'pytest',
        '--exclude-module', 'pytest_asyncio',
        '--exclude-module', 'coverage',
        '--exclude-module', 'tkinter',
        '--exclude-module', '_tkinter',
        '--exclude-module', 'win32com',
        '--exclude-module', 'pythoncom',
        '--exclude-module', 'pywintypes',
        '--exclude-module', 'Pythonwin',
        
        # Add entire backend package structure
        '--add-data', f'{os.path.join(root_dir, "backend")};backend',
    ])

if __name__ == "__main__":
    print(f"Starting PyInstaller build for MediaFlow Backend...")
    build()
    print(f"Build completed successfully! Outputs are in dist-backend/mediaflow-backend")
