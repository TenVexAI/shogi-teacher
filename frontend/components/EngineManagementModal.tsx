'use client';

import { Info, Settings2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import AdvancedEngineSettingsModal from './AdvancedEngineSettingsModal';

interface Engine {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  strength: {
    estimated_elo: number | string;
    level: string;
    minLevel: number;
    maxLevel: number;
  };
  strengthControl: {
    supported: boolean;
    methods: string[];
  };
  features: {
    nnue: boolean;
    ponder: boolean;
    multiPV: boolean;
    skillLevel: boolean;
    uciElo: boolean;
    openingBook: boolean;
  };
}

interface EngineConfig {
  black: {
    engineId: string | null;
    strengthLevel: number;
    customOptions: Record<string, string>;
  };
  white: {
    engineId: string | null;
    strengthLevel: number;
    customOptions: Record<string, string>;
  };
  analysis: {
    engineId: string | null;
    strengthLevel: number;
    enabled: boolean;
    customOptions: Record<string, string>;
  };
}

interface EngineManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STRENGTH_LABELS = {
  10: "Level 10: Superhuman (3000+ Elo)",
  9: "Level 9: 7-Dan (2300+ Elo)",
  8: "Level 8: 5-6 Dan (2100-2299 Elo)",
  7: "Level 7: 3-4 Dan (1800-2099 Elo)",
  6: "Level 6: 1-2 Dan (1600-1799 Elo)",
  5: "Level 5: 3-1 Kyu (1300-1599 Elo)",
  4: "Level 4: 6-4 Kyu (1150-1299 Elo)",
  3: "Level 3: 9-7 Kyu (1000-1149 Elo)",
  2: "Level 2: 12-10 Kyu (700-999 Elo)",
  1: "Level 1: 15-13 Kyu (<700 Elo)",
};

export default function EngineManagementModal({ isOpen, onClose }: EngineManagementModalProps) {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [config, setConfig] = useState<EngineConfig>({
    black: { engineId: null, strengthLevel: 10, customOptions: {} },
    white: { engineId: null, strengthLevel: 10, customOptions: {} },
    analysis: { engineId: null, strengthLevel: 10, enabled: false, customOptions: {} }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [advancedSettingsRole, setAdvancedSettingsRole] = useState<'black' | 'white' | 'analysis'>('black');

  useEffect(() => {
    if (isOpen) {
      fetchEngines();
      fetchConfig();
    }
  }, [isOpen]);

  const fetchEngines = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/engines');
      const data = await response.json();
      setEngines(data.engines || []);
    } catch (error) {
      console.error('Failed to fetch engines:', error);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/engines/config');
      const data = await response.json();
      setConfig(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch config:', error);
      setLoading(false);
    }
  };

  const handleEngineChange = async (side: 'black' | 'white' | 'analysis', engineId: string | null, enabled?: boolean) => {
    setSaving(true);
    setError(null);
    
    try {
      // Add timeout to prevent hanging (70s for GPU engines like Fukauraaou)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 70000); // 70 second timeout
      
      const response = await fetch('http://127.0.0.1:8000/engines/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          engineId: engineId === 'none' ? null : engineId,
          strengthLevel: config[side].strengthLevel,
          customOptions: config[side].customOptions,
          enabled: enabled !== undefined ? enabled : (side === 'analysis' ? config.analysis.enabled : undefined)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setConfig(data.config.engines);
        setError(null);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setError(`Failed to update engine: ${errorData.detail || response.statusText}`);
      }
    } catch (error: unknown) {
      console.error('Failed to update engine:', error);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          setError('Request timed out. The engine may be slow to start. Please try again.');
        } else {
          setError(`Error: ${error.message}`);
        }
      } else {
        setError('Network error. Please check if the backend is running.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStrengthChange = async (side: 'black' | 'white' | 'analysis', level: number) => {
    // Update local state immediately for responsive UI
    setConfig(prev => ({
      ...prev,
      [side]: { ...prev[side], strengthLevel: level }
    }));

    // Debounce the API call
    setSaving(true);
    setError(null);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 70000); // 70 second timeout
      
      const response = await fetch('http://127.0.0.1:8000/engines/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          engineId: config[side].engineId,
          strengthLevel: level,
          customOptions: config[side].customOptions,
          enabled: side === 'analysis' ? config.analysis.enabled : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setConfig(data.config.engines);
        setError(null);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setError(`Failed to update strength: ${errorData.detail || response.statusText}`);
      }
    } catch (error: unknown) {
      console.error('Failed to update strength:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const getSelectedEngine = (side: 'black' | 'white' | 'analysis'): Engine | null => {
    const engineId = config[side].engineId;
    return engines.find(e => e.id === engineId) || null;
  };

  const handleAdvancedSettings = (role: 'black' | 'white' | 'analysis') => {
    setAdvancedSettingsRole(role);
    setAdvancedSettingsOpen(true);
  };

  const handleSaveAdvancedSettings = async (options: Record<string, string>) => {
    const role = advancedSettingsRole;
    setSaving(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 70000);

      const response = await fetch('http://127.0.0.1:8000/engines/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: role,
          engineId: config[role].engineId,
          strengthLevel: config[role].strengthLevel,
          customOptions: options,
          enabled: role === 'analysis' ? config.analysis.enabled : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setConfig(data.config.engines);
        setError(null);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setError(`Failed to save advanced settings: ${errorData.detail || response.statusText}`);
        throw new Error(errorData.detail || response.statusText);
      }
    } catch (error: unknown) {
      console.error('Failed to save advanced settings:', error);
      if (error instanceof Error && error.name !== 'AbortError') {
        throw error;
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-text-primary">Engine Management</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded p-4 text-red-400">
              <p className="font-semibold">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-text-secondary">Loading engines...</div>
          ) : (
            <>
              {/* Black Engine */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-text-primary">Black (王)</h3>
                  {saving && <span className="text-xs text-text-secondary">Saving...</span>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">Engine</label>
                  <select
                    value={config.black.engineId || 'none'}
                    onChange={(e) => handleEngineChange('black', e.target.value)}
                    className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                    disabled={saving}
                  >
                    <option value="none">No Engine</option>
                    {engines.map(engine => (
                      <option key={engine.id} value={engine.id}>
                        {engine.name} - {engine.author}
                      </option>
                    ))}
                  </select>
                </div>

                {config.black.engineId && (
                  <EngineStrengthControl
                    engine={getSelectedEngine('black')}
                    strengthLevel={config.black.strengthLevel}
                    onStrengthChange={(level) => handleStrengthChange('black', level)}
                    disabled={saving}
                  />
                )}

                {config.black.engineId && (
                  <EngineInfo engine={getSelectedEngine('black')} />
                )}

                {config.black.engineId && (
                  <button
                    onClick={() => handleAdvancedSettings('black')}
                    className="flex items-center gap-2 px-4 py-2 border border-border bg-background-primary text-text-primary rounded-lg hover:bg-background-secondary transition-colors text-sm"
                    disabled={saving}
                  >
                    <Settings2 className="w-4 h-4" />
                    Advanced Settings
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* White Engine */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-text-primary">White (玉)</h3>

                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">Engine</label>
                  <select
                    value={config.white.engineId || 'none'}
                    onChange={(e) => handleEngineChange('white', e.target.value)}
                    className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                    disabled={saving}
                  >
                    <option value="none">No Engine</option>
                    {engines.map(engine => (
                      <option key={engine.id} value={engine.id}>
                        {engine.name} - {engine.author}
                      </option>
                    ))}
                  </select>
                </div>

                {config.white.engineId && (
                  <EngineStrengthControl
                    engine={getSelectedEngine('white')}
                    strengthLevel={config.white.strengthLevel}
                    onStrengthChange={(level) => handleStrengthChange('white', level)}
                    disabled={saving}
                  />
                )}

                {config.white.engineId && (
                  <EngineInfo engine={getSelectedEngine('white')} />
                )}

                {config.white.engineId && (
                  <button
                    onClick={() => handleAdvancedSettings('white')}
                    className="flex items-center gap-2 px-4 py-2 border border-border bg-background-primary text-text-primary rounded-lg hover:bg-background-secondary transition-colors text-sm"
                    disabled={saving}
                  >
                    <Settings2 className="w-4 h-4" />
                    Advanced Settings
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Analysis Engine */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-text-primary">Analysis Engine</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.analysis.enabled}
                      onChange={(e) => handleEngineChange('analysis', config.analysis.engineId, e.target.checked)}
                      disabled={saving || !config.analysis.engineId}
                      className="w-4 h-4 text-accent-purple bg-background-primary border-border rounded focus:ring-2 focus:ring-accent-purple"
                    />
                    <span className="text-sm text-text-secondary">Enable Live Analysis</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">Engine</label>
                  <select
                    value={config.analysis.engineId || 'none'}
                    onChange={(e) => handleEngineChange('analysis', e.target.value)}
                    className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                    disabled={saving}
                  >
                    <option value="none">No Engine</option>
                    {engines.map(engine => (
                      <option key={engine.id} value={engine.id}>
                        {engine.name} - {engine.author}
                      </option>
                    ))}
                  </select>
                </div>

                {config.analysis.engineId && (
                  <EngineStrengthControl
                    engine={getSelectedEngine('analysis')}
                    strengthLevel={config.analysis.strengthLevel}
                    onStrengthChange={(level) => handleStrengthChange('analysis', level)}
                    disabled={saving}
                  />
                )}

                {config.analysis.engineId && (
                  <EngineInfo engine={getSelectedEngine('analysis')} />
                )}

                {config.analysis.engineId && (
                  <button
                    onClick={() => handleAdvancedSettings('analysis')}
                    className="flex items-center gap-2 px-4 py-2 border border-border bg-background-primary text-text-primary rounded-lg hover:bg-background-secondary transition-colors text-sm"
                    disabled={saving}
                  >
                    <Settings2 className="w-4 h-4" />
                    Advanced Settings
                  </button>
                )}

                {config.analysis.enabled && config.analysis.engineId && (
                  <div className="bg-background-primary border border-accent-cyan/30 rounded-lg p-3">
                    <p className="text-xs text-accent-cyan">
                      ✓ Analysis engine will provide continuous insights as the game progresses
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Advanced Settings Modal */}
      <AdvancedEngineSettingsModal
        isOpen={advancedSettingsOpen}
        onClose={() => setAdvancedSettingsOpen(false)}
        engineId={config[advancedSettingsRole].engineId}
        engineName={getSelectedEngine(advancedSettingsRole)?.name || 'Engine'}
        currentOptions={config[advancedSettingsRole].customOptions}
        onSave={handleSaveAdvancedSettings}
      />
    </div>
  );
}

function EngineStrengthControl({
  engine,
  strengthLevel,
  onStrengthChange,
  disabled
}: {
  engine: Engine | null;
  strengthLevel: number;
  onStrengthChange: (level: number) => void;
  disabled: boolean;
}) {
  if (!engine) return null;

  const minLevel = engine.strength.minLevel;
  const maxLevel = engine.strength.maxLevel;
  const isAdjustable = engine.strengthControl.supported;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm text-text-secondary">Strength Level</label>
        <span className="text-sm font-mono text-text-primary">
          {STRENGTH_LABELS[strengthLevel as keyof typeof STRENGTH_LABELS]}
        </span>
      </div>

      <input
        type="range"
        min={minLevel}
        max={maxLevel}
        value={strengthLevel}
        onChange={(e) => onStrengthChange(parseInt(e.target.value))}
        disabled={disabled || !isAdjustable}
        className="w-full h-2 bg-background-primary rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: isAdjustable 
            ? `linear-gradient(to right, #00d9ff ${(strengthLevel - minLevel) / (maxLevel - minLevel) * 100}%, #1a1d2e ${(strengthLevel - minLevel) / (maxLevel - minLevel) * 100}%)`
            : '#1a1d2e'
        }}
      />

      {!isAdjustable && (
        <p className="text-xs text-text-secondary italic">
          This engine does not support strength adjustment. Always plays at Level {maxLevel}.
        </p>
      )}

      {isAdjustable && engine.strengthControl.methods.length > 0 && (
        <p className="text-xs text-text-secondary">
          Strength control: {engine.strengthControl.methods.join(', ')}
        </p>
      )}
    </div>
  );
}

function EngineInfo({ engine }: { engine: Engine | null }) {
  if (!engine) return null;

  return (
    <div className="bg-background-primary border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-accent-purple mt-0.5 shrink-0" />
        <div className="space-y-1 text-sm">
          <p className="text-text-primary">
            <span className="font-semibold">{engine.name}</span> v{engine.version}
          </p>
          <p className="text-text-secondary">{engine.description}</p>
          <p className="text-text-secondary">
            Author: {engine.author} | Estimated: {engine.strength.estimated_elo} Elo
          </p>
          {engine.features.nnue && (
            <p className="text-accent-cyan text-xs">✓ NNUE Evaluation</p>
          )}
          {engine.features.openingBook && (
            <p className="text-accent-cyan text-xs">✓ Opening Book</p>
          )}
        </div>
      </div>
    </div>
  );
}
