# =============================================================================
# PyInstaller spec — Prysmor Identity Lock Sidecar
#
# Build:
#   pip install pyinstaller
#   pyinstaller prysmor-sidecar.spec
#
# Output: dist\prysmor-sidecar\prysmor-sidecar.exe   (folder bundle)
#         dist\prysmor-sidecar-onefile\prysmor-sidecar.exe  (single exe, slower start)
#
# The installer copies the FOLDER bundle to:
#   C:\Program Files\Prysmor\
# so the exe path is:
#   C:\Program Files\Prysmor\prysmor-sidecar.exe
# =============================================================================

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

block_cipher = None

# ── Collect InsightFace model data ────────────────────────────────────────────
datas = []
try:
    datas += collect_data_files('insightface')
except Exception:
    pass
try:
    datas += collect_data_files('onnxruntime')
except Exception:
    pass

# ── Hidden imports needed at runtime ─────────────────────────────────────────
hidden_imports = [
    'insightface',
    'insightface.app',
    'insightface.model_zoo',
    'onnxruntime',
    'onnxruntime.capi',
    'cv2',
    'numpy',
    'torch',
    'torchvision',
    'fastapi',
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'pydantic',
    'starlette',
    'starlette.routing',
    'starlette.middleware',
    'anyio',
    'anyio._backends._asyncio',
    'huggingface_hub',
    'email.mime.multipart',
    'email.mime.base',
]

a = Analysis(
    ['face_embedding_server.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib', 'tkinter', 'PyQt5', 'PyQt6', 'wx',
        'IPython', 'jupyter', 'notebook',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── Folder bundle (recommended — faster startup than onefile) ─────────────────
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='prysmor-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,          # no console window in production
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='prysmor-sidecar',
)
