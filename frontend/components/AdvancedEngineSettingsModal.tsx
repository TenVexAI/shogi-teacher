'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings2, Info } from 'lucide-react';

interface AdvancedSetting {
  name: string;
  displayName: string;
  description: string;
  type: 'slider' | 'toggle' | 'select' | 'text';
  default: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  dependsOn?: {
    setting: string;
    value: boolean;
  };
  analysisDefault?: number;
}

interface AdvancedSettingsConfig {
  engineId: string;
  engineName: string;
  settings: AdvancedSetting[];
}

interface AdvancedEngineSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineId: string | null;
  engineName: string;
  currentOptions: Record<string, string>;
  onSave: (options: Record<string, string>) => Promise<void>;
}

export default function AdvancedEngineSettingsModal({
  isOpen,
  onClose,
  engineId,
  engineName,
  currentOptions,
  onSave
}: AdvancedEngineSettingsModalProps) {
  const [config, setConfig] = useState<AdvancedSettingsConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>(currentOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!engineId) return;

    setLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/engines/${engineId}/advanced-settings`);
      const data = await response.json();
      setConfig(data);
      
      // Initialize values with defaults if not already set
      const newValues = {...currentOptions};
      data.settings?.forEach((setting: AdvancedSetting) => {
        if (newValues[setting.name] === undefined) {
          newValues[setting.name] = String(setting.default);
        }
      });
      setValues(newValues);
    } catch (error) {
      console.error('Failed to fetch advanced settings:', error);
    } finally {
      setLoading(false);
    }
  }, [engineId, currentOptions]);

  useEffect(() => {
    if (isOpen && engineId) {
      fetchSettings();
    }
  }, [isOpen, engineId, fetchSettings]);

  useEffect(() => {
    // Update values when currentOptions change
    setValues(currentOptions);
  }, [currentOptions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch (error) {
      console.error('Failed to save options:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!config) return;
    const defaults: Record<string, string> = {};
    config.settings.forEach(setting => {
      defaults[setting.name] = String(setting.default);
    });
    setValues(defaults);
  };

  const shouldShowSetting = (setting: AdvancedSetting): boolean => {
    if (!setting.dependsOn) return true;
    const dependencyValue = values[setting.dependsOn.setting];
    return dependencyValue === String(setting.dependsOn.value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-60">
      <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Settings2 className="w-5 h-5 text-accent-purple" />
            <h2 className="text-xl font-bold text-text-primary">Advanced Settings: {engineName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-text-secondary">Loading settings...</div>
          ) : !config || config.settings.length === 0 ? (
            <div className="text-center py-8 text-text-secondary">
              <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No advanced settings configuration available for this engine.</p>
              <p className="text-xs mt-2">Create an advanced_settings.json file to enable custom settings.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {config.settings.filter(shouldShowSetting).map((setting) => (
                <div key={setting.name} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <label className="text-sm font-semibold text-text-primary">
                        {setting.displayName}
                      </label>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {setting.description}
                      </p>
                    </div>
                  </div>

                  {/* Toggle (boolean) */}
                  {setting.type === 'toggle' && (
                    <div className="flex items-center gap-3 mt-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={values[setting.name] === 'true'}
                          onChange={(e) => setValues({...values, [setting.name]: e.target.checked ? 'true' : 'false'})}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-purple rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-purple"></div>
                      </label>
                      <span className="text-xs text-text-secondary">
                        {values[setting.name] === 'true' ? 'Enabled' : 'Disabled'} (default: {String(setting.default)})
                      </span>
                    </div>
                  )}

                  {/* Slider (number) */}
                  {setting.type === 'slider' && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min={setting.min}
                          max={setting.max}
                          step={setting.step || 1}
                          value={values[setting.name] || String(setting.default)}
                          onChange={(e) => setValues({...values, [setting.name]: e.target.value})}
                          className="flex-1 h-2 bg-background-primary rounded-lg appearance-none cursor-pointer accent-accent-purple"
                        />
                        <span className="text-sm font-mono text-accent-purple font-semibold w-24 text-right">
                          {values[setting.name] || String(setting.default)}{setting.unit ? ` ${setting.unit}` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-text-secondary">
                        <span>Min: {setting.min}{setting.unit ? ` ${setting.unit}` : ''}</span>
                        <span>Default: {setting.default}{setting.unit ? ` ${setting.unit}` : ''}</span>
                        <span>Max: {setting.max}{setting.unit ? ` ${setting.unit}` : ''}</span>
                      </div>
                    </div>
                  )}

                  {/* Select (dropdown) */}
                  {setting.type === 'select' && setting.options && (
                    <div className="mt-2">
                      <select
                        value={values[setting.name] || String(setting.default)}
                        onChange={(e) => setValues({...values, [setting.name]: e.target.value})}
                        className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                      >
                        {setting.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <p className="text-xs text-text-secondary mt-1">Default: {setting.default}</p>
                    </div>
                  )}

                  {/* Text (text input) */}
                  {setting.type === 'text' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={values[setting.name] || String(setting.default) || ''}
                        onChange={(e) => setValues({...values, [setting.name]: e.target.value})}
                        placeholder={String(setting.default) || ''}
                        className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple font-mono text-sm"
                      />
                      <p className="text-xs text-text-secondary mt-1">Default: {setting.default || '(empty)'}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-between gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-border bg-background-primary text-text-primary rounded-lg hover:bg-background-secondary transition-colors"
            disabled={saving}
          >
            Reset to Defaults
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border bg-background-primary text-text-primary rounded-lg hover:bg-background-secondary transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] transition-colors disabled:opacity-50"
              disabled={saving || loading}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
