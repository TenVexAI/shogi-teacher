// Type definitions for Electron API exposed via preload script

interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  openLearnWindow: () => Promise<void>;
  closeLearnWindow: () => Promise<void>;
  isLearnWindowOpen: () => Promise<boolean>;
  onLearnWindowStateChange: (callback: (isOpen: boolean) => void) => () => void;
}

interface Window {
  electron?: ElectronAPI;
}
