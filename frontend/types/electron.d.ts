// Type definitions for Electron API exposed via preload script

export interface AnalysisWindowInitialData {
  type: 'current_game' | 'load_file';
  // For current_game: game state from main window
  moves?: Array<{
    move_usi: string;
    move_notation: string;
    sfen_after: string;
    time_spent_ms?: number;
  }>;
  startingSfen?: string;
  blackName?: string;
  whiteName?: string;
  // For load_file: file path or content
  filePath?: string;
  fileContent?: string;
  fileFormat?: 'kif' | 'ki2' | 'csa' | 'psn' | 'sfen';
}

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
  
  // Analysis window management
  openAnalysisWindow: (initialData?: AnalysisWindowInitialData) => Promise<number>;
  getAnalysisWindowCount: () => Promise<number>;
  onAnalysisInitialData: (callback: (data: AnalysisWindowInitialData) => void) => () => void;
}

interface Window {
  electron?: ElectronAPI;
}
