// Preload script for Electron
// This runs in a separate context before the web page loads
// Used for secure communication between main and renderer processes

/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform
});
