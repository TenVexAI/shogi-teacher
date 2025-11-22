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


interface CudaStatus {
  hasGPU: boolean;
  gpuNames: string[];
  hasCUDA: boolean;
  cudaVersion: string | null;
  ready: boolean;
  warnings: string[];
}

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
  const [cudaStatus, setCudaStatus] = useState<CudaStatus | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchEngines();
      fetchConfig();
      fetchCudaStatus();
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

  const fetchCudaStatus = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/system/cuda-status');
      const data = await response.json();
      setCudaStatus(data);
    } catch (error) {
      console.error('Failed to fetch CUDA status:', error);
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
    // For fairy-stockfish, update customOptions with UCI_Elo or Skill Level
    const selectedEngine = getSelectedEngine(side);
    if (!selectedEngine || selectedEngine.id !== 'fairy-stockfish') return;

    const isUciLimitStrength = config[side].customOptions['UCI_LimitStrength'] !== 'false';
    const settingName = isUciLimitStrength ? 'UCI_Elo' : 'Skill Level';
    
    const updatedOptions = {
      ...config[side].customOptions,
      [settingName]: String(level)
    };

    // Update local state immediately for responsive UI
    setConfig(prev => ({
      ...prev,
      [side]: { ...prev[side], customOptions: updatedOptions }
    }));

    // API call to save
    setSaving(true);
    setError(null);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 70000);
      
      const response = await fetch('http://127.0.0.1:8000/engines/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          engineId: config[side].engineId,
          strengthLevel: config[side].strengthLevel,
          customOptions: updatedOptions,
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
                    onStrengthChange={(level) => handleStrengthChange('black', level)}
                    disabled={saving}
                    customOptions={config.black.customOptions}
                  />
                )}

                {config.black.engineId && (
                  <EngineInfo engine={getSelectedEngine('black')} cudaStatus={cudaStatus} />
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
                    onStrengthChange={(level) => handleStrengthChange('white', level)}
                    disabled={saving}
                    customOptions={config.white.customOptions}
                  />
                )}

                {config.white.engineId && (
                  <EngineInfo engine={getSelectedEngine('white')} cudaStatus={cudaStatus} />
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
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary">Enable Live Analysis</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.analysis.enabled}
                        onChange={(e) => handleEngineChange('analysis', config.analysis.engineId, e.target.checked)}
                        disabled={saving || !config.analysis.engineId}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-purple rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-purple peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                    </label>
                  </div>
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
                    onStrengthChange={(level) => handleStrengthChange('analysis', level)}
                    disabled={saving}
                    customOptions={config.analysis.customOptions}
                  />
                )}

                {config.analysis.engineId && (
                  <EngineInfo engine={getSelectedEngine('analysis')} cudaStatus={cudaStatus} />
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
  onStrengthChange,
  disabled,
  customOptions
}: {
  engine: Engine | null;
  onStrengthChange: (level: number) => void;
  disabled: boolean;
  customOptions: Record<string, string>;
}) {
  if (!engine) return null;

  // Only show strength control for fairy-stockfish
  if (engine.id !== 'fairy-stockfish') return null;

  // Check if UCI_LimitStrength is enabled (default is true)
  const isUciLimitStrength = customOptions['UCI_LimitStrength'] !== 'false';

  // Determine which setting to control
  const settingName = isUciLimitStrength ? 'UCI_Elo' : 'Skill Level';
  const min = isUciLimitStrength ? 500 : -20;
  const max = isUciLimitStrength ? 2850 : 20;
  const step = isUciLimitStrength ? 50 : 1;
  const defaultValue = isUciLimitStrength ? 1200 : 20;

  // Get current value from customOptions or use default
  const currentValue = customOptions[settingName] 
    ? parseInt(customOptions[settingName]) 
    : defaultValue;

  const handleChange = (newValue: number) => {
    // This will be handled through the advanced settings system
    // We need to update customOptions, not strengthLevel
    onStrengthChange(newValue);
  };

  const getLabel = (value: number) => {
    if (isUciLimitStrength) {
      // UCI_Elo labels
      if (value < 800) return `${value} Elo (Beginner)`;
      if (value < 1500) return `${value} Elo (Club Player)`;
      if (value < 1800) return `${value} Elo (Intermediate)`;
      if (value < 2200) return `${value} Elo (Strong Amateur)`;
      if (value < 2400) return `${value} Elo (Professional)`;
      return `${value} Elo (Superhuman)`;
    } else {
      // Skill Level labels
      if (value < 0) return `${value} (Very Weak)`;
      if (value < 5) return `${value} (Weak)`;
      if (value < 10) return `${value} (Moderate)`;
      if (value < 15) return `${value} (Strong)`;
      return `${value} (Maximum)`;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm text-text-secondary">
          {settingName}
          {!isUciLimitStrength && (
            <span className="text-xs ml-2 text-accent-cyan">(UCI_LimitStrength disabled)</span>
          )}
        </label>
        <span className="text-sm font-mono text-accent-purple font-semibold">
          {getLabel(currentValue)}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={(e) => handleChange(parseInt(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-background-primary rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 accent-accent-purple"
        style={{
          background: `linear-gradient(to right, #a78bfa ${((currentValue - min) / (max - min)) * 100}%, #1a1d2e ${((currentValue - min) / (max - min)) * 100}%)`
        }}
      />

      <div className="flex justify-between text-xs text-text-secondary">
        <span>Min: {min}</span>
        <span>Default: {defaultValue}</span>
        <span>Max: {max}</span>
      </div>

      <p className="text-xs text-text-secondary">
        {isUciLimitStrength 
          ? 'Adjust playing strength in Elo rating. Toggle UCI_LimitStrength in Advanced Settings to use Skill Level instead.'
          : 'Using Skill Level control. Enable UCI_LimitStrength in Advanced Settings to use Elo rating.'}
      </p>
    </div>
  );
}

function EngineInfo({ engine, cudaStatus }: { engine: Engine | null; cudaStatus: CudaStatus | null }) {
  if (!engine) return null;

  const isFukauraou = engine.id === 'fukauraou';
  const showCudaWarnings = isFukauraou && cudaStatus && !cudaStatus.ready;

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
          
          {/* CUDA Status for Fukauraou */}
          {isFukauraou && cudaStatus && (
            <div className="mt-2 pt-2 border-t border-border space-y-1">
              <p className="text-xs font-semibold text-text-primary">GPU Requirements:</p>
              {cudaStatus.hasGPU ? (
                <p className="text-xs text-accent-cyan">
                  ✓ GPU: {cudaStatus.gpuNames.join(', ')}
                </p>
              ) : (
                <p className="text-xs text-red-400">✗ No NVIDIA GPU detected</p>
              )}
              {cudaStatus.hasCUDA ? (
                <p className="text-xs text-accent-cyan">
                  ✓ CUDA: {cudaStatus.cudaVersion}
                </p>
              ) : (
                <p className="text-xs text-red-400">✗ CUDA not installed</p>
              )}
              <p className="text-xs text-text-secondary italic">Note: TensorRT DLLs are bundled with the model</p>
            </div>
          )}
          
          {/* Warning box for Fukauraou if not ready */}
          {showCudaWarnings && cudaStatus.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400 space-y-1">
              <p className="font-semibold">⚠ Requirements Not Met:</p>
              {cudaStatus.warnings.map((warning, idx) => (
                <p key={idx}>• {warning}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
