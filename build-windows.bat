@echo off
echo ========================================
echo Building Shogi Teacher for Windows
echo ========================================
echo.

echo Step 1: Installing build dependencies...
cd backend
pip install -r requirements-build.txt
if errorlevel 1 (
    echo ERROR: Failed to install build dependencies!
    pause
    exit /b 1
)
echo.

echo Step 2: Building Python backend...
python build_backend.py
if errorlevel 1 (
    echo ERROR: Backend build failed!
    pause
    exit /b 1
)
echo Backend build complete!
echo.

echo Step 3: Building Electron app...
cd ..\frontend
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

call npm run electron:build:win
if errorlevel 1 (
    echo ERROR: Electron build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo BUILD COMPLETE!
echo ========================================
echo.
echo Installer location: frontend\dist\Shogi Teacher Setup.exe
echo Portable version: frontend\dist\Shogi Teacher Portable.exe
echo.
pause
