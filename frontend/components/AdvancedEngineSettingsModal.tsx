'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings2, Info } from 'lucide-react';

interface USIOption {
  name: string;
  type: 'check' | 'spin' | 'combo' | 'button' | 'string';
  default: string | null;
  min: number | null;
  max: number | null;
  vars: string[] | null;
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
  const [options, setOptions] = useState<USIOption[]>([]);
  const [values, setValues] = useState<Record<string, string>>(currentOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchOptions = useCallback(async () => {
    if (!engineId) return;

    setLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/engines/${engineId}/options`);
      const data = await response.json();
      setOptions(data.options || []);
    } catch (error) {
      console.error('Failed to fetch engine options:', error);
    } finally {
      setLoading(false);
    }
  }, [engineId]);

  useEffect(() => {
    if (isOpen && engineId) {
      fetchOptions();
    }
  }, [isOpen, engineId, fetchOptions]);

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
    const defaults: Record<string, string> = {};
    options.forEach(opt => {
      if (opt.default !== null) {
        defaults[opt.name] = opt.default;
      }
    });
    setValues(defaults);
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
            <div className="text-center py-8 text-text-secondary">Loading options...</div>
          ) : options.length === 0 ? (
            <div className="text-center py-8 text-text-secondary">
              <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No configurable options available for this engine.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {options.map((option) => (
                <div key={option.name} className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">
                    {option.name}
                  </label>

                  {/* Check (boolean) */}
                  {option.type === 'check' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={values[option.name] === 'true'}
                        onChange={(e) => setValues({...values, [option.name]: e.target.checked ? 'true' : 'false'})}
                        className="w-4 h-4 text-accent-purple bg-background-primary border-border rounded focus:ring-2 focus:ring-accent-purple"
                      />
                      <span className="text-xs text-text-secondary">
                        Default: {option.default || 'false'}
                      </span>
                    </div>
                  )}

                  {/* Spin (number with range) */}
                  {option.type === 'spin' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min={option.min || 0}
                          max={option.max || 100}
                          value={values[option.name] || option.default || option.min || 0}
                          onChange={(e) => setValues({...values, [option.name]: e.target.value})}
                          className="flex-1 h-2 bg-background-primary rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-sm font-mono text-text-primary w-20 text-right">
                          {values[option.name] || option.default || option.min}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        Range: {option.min} - {option.max} | Default: {option.default}
                      </p>
                    </div>
                  )}

                  {/* Combo (dropdown) */}
                  {option.type === 'combo' && option.vars && (
                    <div className="space-y-1">
                      <select
                        value={values[option.name] || option.default || ''}
                        onChange={(e) => setValues({...values, [option.name]: e.target.value})}
                        className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                      >
                        {option.vars.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                      <p className="text-xs text-text-secondary">Default: {option.default}</p>
                    </div>
                  )}

                  {/* String (text input) */}
                  {option.type === 'string' && (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={values[option.name] || option.default || ''}
                        onChange={(e) => setValues({...values, [option.name]: e.target.value})}
                        placeholder={option.default || ''}
                        className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                      />
                      <p className="text-xs text-text-secondary">Default: {option.default || '(empty)'}</p>
                    </div>
                  )}

                  {/* Button (not editable, just info) */}
                  {option.type === 'button' && (
                    <p className="text-xs text-text-secondary italic">
                      This is a button option (cannot be configured here)
                    </p>
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
