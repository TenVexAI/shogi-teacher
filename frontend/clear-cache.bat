@echo off
echo Clearing electron-builder cache...
rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul
echo Cache cleared!
pause
