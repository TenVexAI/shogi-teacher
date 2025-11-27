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
  },
  
  // Online play window management
  openOnlinePlayWindow: () => ipcRenderer.invoke('open-online-play-window'),
  closeOnlinePlayWindow: () => ipcRenderer.invoke('close-online-play-window'),
  isOnlinePlayWindowOpen: () => ipcRenderer.invoke('is-online-play-window-open'),
  onOnlinePlayWindowStateChange: (callback) => {
    ipcRenderer.on('online-play-window-state-changed', (event, isOpen) => callback(isOpen));
    return () => ipcRenderer.removeAllListeners('online-play-window-state-changed');
  },
  
  // Inter-window communication
  sendToOnlinePlayWindow: (message) => ipcRenderer.invoke('send-to-online-play-window', message),
  sendToMainWindow: (message) => ipcRenderer.invoke('send-to-main-window', message),
  onMainWindowMessage: (callback) => {
    ipcRenderer.on('main-window-message', (event, message) => callback(message));
    return () => ipcRenderer.removeAllListeners('main-window-message');
  },
  onOnlinePlayMessage: (callback) => {
    ipcRenderer.on('online-play-message', (event, message) => callback(message));
    return () => ipcRenderer.removeAllListeners('online-play-message');
  },
  
  // File save with dialog
  saveFile: (content, defaultFilename, filters) => ipcRenderer.invoke('save-file', { content, defaultFilename, filters })
});
