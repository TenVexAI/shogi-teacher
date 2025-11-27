// Type definitions for Electron API exposed via preload script

interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  
  // Learn window management
  openLearnWindow: () => Promise<void>;
  closeLearnWindow: () => Promise<void>;
  isLearnWindowOpen: () => Promise<boolean>;
  onLearnWindowStateChange: (callback: (isOpen: boolean) => void) => () => void;
  
  // Online play window management
  openOnlinePlayWindow: () => Promise<void>;
  closeOnlinePlayWindow: () => Promise<void>;
  isOnlinePlayWindowOpen: () => Promise<boolean>;
  onOnlinePlayWindowStateChange: (callback: (isOpen: boolean) => void) => () => void;
  
  // Inter-window communication
  sendToOnlinePlayWindow: (message: unknown) => Promise<boolean>;
  sendToMainWindow: (message: unknown) => Promise<boolean>;
  onMainWindowMessage: (callback: (message: unknown) => void) => () => void;
  onOnlinePlayMessage: (callback: (message: unknown) => void) => () => void;
  
  // File operations
  saveFile: (
    content: string, 
    defaultFilename: string, 
    filters?: { name: string; extensions: string[] }[]
  ) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
}

interface Window {
  electron?: ElectronAPI;
}
