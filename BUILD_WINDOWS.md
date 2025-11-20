# 🏗️ Building Shogi Teacher for Windows

This guide will help you build a standalone Windows installer that includes everything: frontend, backend, and engine.

## 📋 Prerequisites

1. **Python 3.10+** installed
2. **Node.js 18+** and npm installed
3. **YaneuraOu.exe** in `backend/engine/` directory

## 🚀 Build Steps

### Step 1: Build the Python Backend

```bash
cd backend

# Install build dependencies
pip install -r requirements-build.txt

# Build the backend executable
python build_backend.py
```

This creates `backend/dist/shogi-teacher-backend.exe` (~50-100MB)

### Step 2: Build the Electron App

```bash
cd ../frontend

# Install dependencies (if not already done)
npm install

# Build the Windows installer
npm run electron:build:win
```

This will:
1. Build the Next.js app (static export)
2. Bundle the backend executable
3. Include YaneuraOu.exe and engine files
4. Create the Windows installer

### Step 3: Find Your Installer

The installer will be in `frontend/dist/`:
- **`Shogi Teacher Setup.exe`** - Full installer (~150-200MB)
- **`Shogi Teacher Portable.exe`** - Portable version (no installation needed)

## 📦 What Gets Bundled

The installer includes:
- ✅ Frontend (Next.js app)
- ✅ Backend (Python FastAPI server)
- ✅ YaneuraOu.exe (Shogi engine)
- ✅ All dependencies
- ✅ Sound files (music, ambient, UI sounds)

## 🎯 Distribution

Users can:
1. Download the installer
2. Run it
3. Launch "Shogi Teacher" from Start Menu or Desktop
4. Everything works automatically - no setup needed!

## 🔧 How It Works

1. **User launches app** → Electron window opens
2. **Backend auto-starts** → Python server runs in background (port 8000)
3. **Frontend loads** → React app connects to backend
4. **User closes app** → Backend automatically stops

## ⚙️ Advanced Options

### Build Portable Version Only
```bash
npm run electron:build:win -- --win portable
```

### Build Installer Only
```bash
npm run electron:build:win -- --win nsis
```

### Custom Build Options
Edit `electron-builder.json` to customize:
- App icon
- Installer name
- Installation directory
- Desktop shortcuts
- Start menu shortcuts

## 🐛 Troubleshooting

### Backend executable not found
- Make sure you ran `python build_backend.py` first
- Check that `backend/dist/shogi-teacher-backend.exe` exists

### YaneuraOu.exe not found
- Ensure `backend/engine/YaneuraOu.exe` exists
- The engine must be in the `engine/` folder

### Build fails
- Delete `frontend/dist` and `frontend/out` folders
- Run `npm install` again
- Try building backend and frontend separately

## 📊 File Sizes

- Backend executable: ~50-100 MB
- Frontend (static): ~10-20 MB
- YaneuraOu.exe: ~5-10 MB
- Sound files: ~500 MB
- **Total installer: ~600-700 MB**

## 🎉 Success!

Once built, you have a professional Windows application that:
- Installs like any other Windows app
- Runs completely offline (except for Claude API)
- Includes everything needed
- Auto-updates possible (future feature)

## 🔮 Future Enhancements

- [ ] Code signing certificate (removes "Unknown Publisher" warning)
- [ ] Auto-updater integration
- [ ] Reduce installer size with compression
- [ ] macOS and Linux builds
