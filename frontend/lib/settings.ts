// UI Settings persistence using backend API

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface UISettings {
  // App settings
  useLLM: boolean;
  showBestMove: boolean;
  showBoardOptionsPanel: boolean;
  
  // Sound settings
  allSoundsMuted: boolean;  // Master mute toggle
  uiSoundEnabled: boolean;  // UI sounds enabled in settings
  musicSoundEnabled: boolean;  // Music enabled in settings
  ambientSoundEnabled: boolean;  // Ambient sounds enabled in settings
  
  // Board display settings
  useJapaneseCoords: boolean;
  boardFlipped: boolean;
  useWesternNotation: boolean;
  highlightLastMove: boolean;
  showMovementOverlay: boolean;
}

const DEFAULT_SETTINGS: UISettings = {
  useLLM: true,
  showBestMove: false,
  showBoardOptionsPanel: true,
  allSoundsMuted: false,
  uiSoundEnabled: false,
  musicSoundEnabled: false,
  ambientSoundEnabled: false,
  useJapaneseCoords: false,
  boardFlipped: false,
  useWesternNotation: false,
  highlightLastMove: false,
  showMovementOverlay: false,
};

// Cache for settings to avoid excessive API calls
let cachedSettings: UISettings | null = null;

export async function loadUISettings(): Promise<UISettings> {
  // Return cached if available
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/ui-preferences`);
    if (response.ok) {
      const settings = await response.json();
      const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
      cachedSettings = mergedSettings;
      return mergedSettings;
    }
  } catch (error) {
    console.error('Failed to load UI settings from backend:', error);
  }

  const defaultsCopy = { ...DEFAULT_SETTINGS };
  cachedSettings = defaultsCopy;
  return defaultsCopy;
}

export function loadUISettingsSync(): UISettings {
  // Return cached settings or defaults for synchronous calls
  if (!cachedSettings) {
    cachedSettings = DEFAULT_SETTINGS;
  }
  return cachedSettings;
}

export async function saveUISettings(settings: Partial<UISettings>): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/ui-preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });

    if (response.ok) {
      const result = await response.json();
      // Update cache with full preferences from server
      cachedSettings = result.preferences;
    } else {
      throw new Error('Failed to save settings');
    }
  } catch (error) {
    console.error('Failed to save UI settings:', error);
    throw error;
  }
}

export async function updateUISetting<K extends keyof UISettings>(
  key: K,
  value: UISettings[K]
): Promise<void> {
  await saveUISettings({ [key]: value });
}
