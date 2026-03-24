# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

root_dir = Path.cwd().resolve()

a = Analysis(
    [str(root_dir / 'run.py')],
    pathex=[str(root_dir)],
    binaries=[],
    datas=[(str(root_dir / 'backend'), 'backend')],
    hiddenimports=['uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'fastapi', 'pydantic', 'loguru', 'ffmpeg', 'faster_whisper'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'torchaudio', 'torchvision', 'basicsr', 'realesrgan', 'mmcv', 'mmedit', 'pandas', 'pandas.plotting', 'matplotlib', 'matplotlib.backends', 'matplotlib.pyplot', 'PyQt5', 'ctranslate2.converters', 'transformers', 'librosa', 'sklearn', 'numba', 'llvmlite', 'pytest', 'pytest_asyncio', 'coverage', 'tkinter', '_tkinter', 'win32com', 'pythoncom', 'pywintypes', 'Pythonwin'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='mediaflow-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='mediaflow-backend',
)
