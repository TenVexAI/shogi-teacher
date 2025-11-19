'use client';

import { useState, useEffect } from 'react';

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (apiKey: string) => Promise<void>;
}

export default function ConfigModal({ isOpen, onClose, onSave }: ConfigModalProps) {
    const [apiKey, setApiKey] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setError('');
            setSuccess(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);
        setIsSaving(true);

        try {
            await onSave(apiKey);
            setSuccess(true);
            setApiKey('');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch {
            setError('Failed to save configuration. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
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
                            placeholder="sk-ant-..."
                            className="w-full px-3 py-2 bg-background-primary border border-border text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-purple placeholder:text-text-secondary"
                            required
                        />
                        <p className="text-xs text-text-secondary mt-1">
                            Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-accent-purple hover:text-accent-cyan hover:underline">console.anthropic.com</a>
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
