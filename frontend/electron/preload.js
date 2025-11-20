// Preload script for Electron
// This runs in a separate context before the web page loads
// Used for secure communication between main and renderer processes

/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  // Learn window management
  openLearnWindow: () => ipcRenderer.invoke('open-learn-window'),
  closeLearnWindow: () => ipcRenderer.invoke('close-learn-window'),
  isLearnWindowOpen: () => ipcRenderer.invoke('is-learn-window-open'),
  onLearnWindowStateChange: (callback) => {
    ipcRenderer.on('learn-window-state-changed', (event, isOpen) => callback(isOpen));
    return () => ipcRenderer.removeAllListeners('learn-window-state-changed');
  }
});
