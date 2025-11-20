"""
Build script to create a standalone executable of the backend using PyInstaller.
This bundles Python, FastAPI, and all dependencies into a single .exe file.
"""
import PyInstaller.__main__
import os
import shutil

# Get the directory of this script
backend_dir = os.path.dirname(os.path.abspath(__file__))
engine_dir = os.path.join(backend_dir, 'engine')
dist_dir = os.path.join(backend_dir, 'dist')

# Clean previous builds
if os.path.exists(dist_dir):
    shutil.rmtree(dist_dir)
if os.path.exists(os.path.join(backend_dir, 'build')):
    shutil.rmtree(os.path.join(backend_dir, 'build'))

print("Building backend executable...")

PyInstaller.__main__.run([
    'main.py',
    '--name=shogi-teacher-backend',
    '--onefile',
    '--console',
    '--add-data=engine;engine',  # Include engine directory
    '--hidden-import=uvicorn.logging',
    '--hidden-import=uvicorn.loops',
    '--hidden-import=uvicorn.loops.auto',
    '--hidden-import=uvicorn.protocols',
    '--hidden-import=uvicorn.protocols.http',
    '--hidden-import=uvicorn.protocols.http.auto',
    '--hidden-import=uvicorn.protocols.websockets',
    '--hidden-import=uvicorn.protocols.websockets.auto',
    '--hidden-import=uvicorn.lifespan',
    '--hidden-import=uvicorn.lifespan.on',
    '--collect-all=fastapi',
    '--collect-all=starlette',
    '--collect-all=pydantic',
    '--collect-all=anthropic',
    f'--distpath={dist_dir}',
])

print(f"\n✅ Backend executable created: {os.path.join(dist_dir, 'shogi-teacher-backend.exe')}")
print("This file will be bundled with the Electron app.")
