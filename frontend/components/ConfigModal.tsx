'use client';

import { useState, useEffect } from 'react';

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (apiKey: string, useLLM: boolean, showBestMove: boolean) => Promise<void>;
    currentUseLLM?: boolean;
    currentApiKey?: string;
    currentShowBestMove?: boolean;
    onOpenSounds?: () => void;
    soundToggles?: {
        uiEnabled: boolean;
        musicEnabled: boolean;
        ambientEnabled: boolean;
    };
    onSoundToggle?: (category: 'ui' | 'music' | 'ambient', enabled: boolean) => void;
}

export default function ConfigModal({ isOpen, onClose, onSave, currentUseLLM = true, currentApiKey = '', currentShowBestMove = false, onOpenSounds, soundToggles, onSoundToggle }: ConfigModalProps) {
    const [apiKey, setApiKey] = useState('');
    const [useLLM, setUseLLM] = useState(currentUseLLM);
    const [showBestMove, setShowBestMove] = useState(currentShowBestMove);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setError('');
            setSuccess(false);
            setApiKey('');
        } else {
            setUseLLM(currentUseLLM);
            setShowBestMove(currentShowBestMove);
        }
    }, [isOpen, currentUseLLM, currentShowBestMove]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);
        setIsSaving(true);

        try {
            await onSave(apiKey, useLLM, showBestMove);
            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 1000);
        } catch {
            setError('Failed to save configuration. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
                    <button
                        onClick={onClose}
                        className="text-text-secondary hover:text-text-primary text-2xl"
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="apiKey" className="block text-sm font-medium text-text-primary mb-2">
                            Claude API Key
                        </label>
                        <input
                            type="password"
                            id="apiKey"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={currentApiKey ? '••••••••••••••••' : 'sk-ant-...'}
                            className="w-full px-3 py-2 bg-background-primary border border-border text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-purple placeholder:text-text-secondary"
                            required={useLLM && !currentApiKey}
                        />
                        <p className="text-xs text-text-secondary mt-1">
                            {currentApiKey 
                                ? 'Leave empty to keep existing key. Enter a new key to update.'
                                : 'Get your API key from console.anthropic.com'
                            }
                        </p>
                    </div>

                    <div className="mb-4">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={useLLM}
                                onChange={(e) => setUseLLM(e.target.checked)}
                                className="w-4 h-4 text-accent-purple bg-background-primary border-border rounded focus:ring-accent-purple focus:ring-2"
                            />
                            <span className="ml-2 text-sm text-text-primary">
                                Enable LLM Analysis
                            </span>
                        </label>
                        <p className="text-xs text-text-secondary mt-1 ml-6">
                            When disabled, only engine analysis will be shown (no AI explanations)
                        </p>
                    </div>

                    <div className="mb-4">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showBestMove}
                                onChange={(e) => setShowBestMove(e.target.checked)}
                                className="w-4 h-4 text-accent-purple bg-background-primary border-border rounded focus:ring-accent-purple focus:ring-2"
                            />
                            <span className="ml-2 text-sm text-text-primary">Show Best Move Button</span>
                        </label>
                        <p className="text-xs text-text-secondary mt-1 ml-6">
                            Display a button to automatically play the engine&apos;s recommended move
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-600 text-red-400 rounded">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 bg-green-900/30 border border-green-600 text-green-400 rounded">
                            Configuration saved successfully!
                        </div>
                    )}

                    {/* Sound Category Toggles */}
                    {soundToggles && onSoundToggle && (
                        <div className="mb-4 space-y-3 pb-4 border-b border-border">
                            <h3 className="text-sm font-semibold text-text-primary">Sound Categories</h3>
                            
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm text-text-primary">UI Sounds</span>
                                <div className="relative inline-flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={soundToggles.uiEnabled}
                                        onChange={(e) => onSoundToggle('ui', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-cyan"></div>
                                </div>
                            </label>

                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm text-text-primary">Music</span>
                                <div className="relative inline-flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={soundToggles.musicEnabled}
                                        onChange={(e) => onSoundToggle('music', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-cyan"></div>
                                </div>
                            </label>

                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm text-text-primary">Ambient Sounds</span>
                                <div className="relative inline-flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={soundToggles.ambientEnabled}
                                        onChange={(e) => onSoundToggle('ambient', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-cyan"></div>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Advanced Sound Settings Button */}
                    {onOpenSounds && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onOpenSounds();
                            }}
                            className="w-full mb-4 px-4 py-3 bg-linear-to-r from-accent-cyan to-accent-purple text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 font-semibold"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                            </svg>
                            Advanced Sound Settings
                        </button>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-border bg-background-primary text-text-primary rounded-lg hover:bg-background-secondary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 px-4 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
