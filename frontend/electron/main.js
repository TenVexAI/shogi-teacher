/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let learnWindow = null;
let backendProcess = null;
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Clear cache in development to fix icon issues
if (isDev) {
  app.whenReady().then(() => {
    session.defaultSession.clearCache();
  });
}

// Start the Python backend
async function startBackend() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // In development, assume backend is running separately
      console.log('Development mode: Assuming backend is running on port 8000');
      resolve();
      return;
    }

    // In production, start the bundled backend executable
    const backendPath = path.join(process.resourcesPath, 'backend', 'shogi-teacher-backend.exe');
    console.log('Starting backend:', backendPath);

    backendProcess = spawn(backendPath, [], {
      cwd: path.join(process.resourcesPath, 'backend'),
      stdio: 'pipe'
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('error', (error) => {
      console.error('Failed to start backend:', error);
      reject(error);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
    });

    // Wait for backend to be ready
    let attempts = 0;
    const maxAttempts = 30;
    const checkBackend = setInterval(async () => {
      attempts++;
      try {
        await axios.get(`${BACKEND_URL}/game/state`);
        clearInterval(checkBackend);
        console.log('Backend is ready!');
        resolve();
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(checkBackend);
          console.error('Backend failed to start within timeout');
          reject(new Error('Backend startup timeout'));
        }
      }
    }, 1000);
  });
}

// Stop the backend
function stopBackend() {
  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1500,
    minHeight: 990,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'Shogi Teacher',
    backgroundColor: '#141414',
    show: false // Don't show until backend is ready
  });

  // Don't allow window.open, use IPC instead
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
    mainWindow.show();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    // Show window after backend starts
    startBackend()
      .then(() => {
        mainWindow.show();
      })
      .catch((error) => {
        console.error('Failed to start backend:', error);
        // Show window anyway, but backend won't work
        mainWindow.show();
      });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create learn window
function createLearnWindow() {
  if (learnWindow) {
    learnWindow.focus();
    return;
  }

  learnWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'Learn to Play Shogi',
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const learnUrl = isDev ? 'http://localhost:3000/learn' : path.join(__dirname, '../out/learn/index.html');
  
  if (isDev) {
    learnWindow.loadURL(learnUrl);
  } else {
    learnWindow.loadFile(learnUrl);
  }

  learnWindow.on('closed', () => {
    learnWindow = null;
    // Notify main window that learn window closed
    if (mainWindow) {
      mainWindow.webContents.send('learn-window-state-changed', false);
    }
  });

  // Notify main window that learn window opened
  if (mainWindow) {
    mainWindow.webContents.send('learn-window-state-changed', true);
  }
}

// IPC Handlers
ipcMain.handle('open-learn-window', () => {
  createLearnWindow();
});

ipcMain.handle('close-learn-window', () => {
  if (learnWindow) {
    learnWindow.close();
  }
});

ipcMain.handle('is-learn-window-open', () => {
  return learnWindow !== null;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});
