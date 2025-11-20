# Shogi Teacher - Electron Desktop App

This project can run as both a web application and a standalone desktop application using Electron.

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Development Mode

**Option 1: Web Browser (Current)**
```bash
npm run dev
```
Then open http://localhost:3000

**Option 2: Electron Desktop App**
```bash
npm run electron:dev
```
This will start both the Next.js dev server and Electron app.

## 📦 Building for Production

### Build for Windows
```bash
npm run electron:build:win
```
Creates:
- `dist/Shogi Teacher Setup.exe` (Installer)
- `dist/Shogi Teacher Portable.exe` (Portable version)

### Build for macOS
```bash
npm run electron:build:mac
```
Creates:
- `dist/Shogi Teacher.dmg` (Installer)
- `dist/Shogi Teacher.zip` (Portable)

### Build for Linux
```bash
npm run electron:build:linux
```
Creates:
- `dist/Shogi Teacher.AppImage` (Portable)
- `dist/shogi-teacher.deb` (Debian package)

### Build for All Platforms
```bash
npm run electron:build
```

## 📁 Output

Built applications will be in the `dist/` folder.

## ⚙️ How It Works

1. **Next.js** builds a static export of the app (`out/` folder)
2. **Electron** wraps this in a native desktop window
3. **Backend** still needs to run separately (Python FastAPI server)

## 🔧 Configuration

- `electron/main.js` - Electron main process (window management)
- `electron/preload.js` - Secure bridge between Electron and web app
- `electron-builder.json` - Build configuration for packaging
- `next.config.js` - Next.js configuration for static export

## 📝 Notes

- The app still requires the Python backend to be running on `http://localhost:8000`
- All sounds, music, and ambient audio work the same as the web version
- Settings are stored locally (not in browser localStorage)
- The app will work exactly like it does in the browser

## 🎯 Distribution

The built executables are standalone and can be distributed to users. They don't need:
- Node.js installed
- npm installed
- A web browser

They DO need:
- The Python backend running (or you can bundle it separately)
- YaneuraOu.exe in the correct location

## 🔮 Future Enhancements

- Bundle Python backend with Electron app
- Auto-start backend when app launches
- Installer that includes everything
- Auto-updates
