'use client';

import { useState, useEffect } from 'react';
import { audioManager } from '@/lib/audioManager';

interface SoundSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (settings: SoundSettings) => void;
    currentSettings: SoundSettings;
}

export interface SoundSettings {
    uiEnabled: boolean;
    musicEnabled: boolean;
    ambientEnabled: boolean;
    uiVolume: number;
    musicVolume: number;
    ambientVolumes: number[]; // 10 sliders for ambient layers
}

export default function SoundSettingsModal({ isOpen, onClose, onSave, currentSettings }: SoundSettingsModalProps) {
    const [uiEnabled, setUiEnabled] = useState(currentSettings.uiEnabled);
    const [musicEnabled, setMusicEnabled] = useState(currentSettings.musicEnabled);
    const [ambientEnabled, setAmbientEnabled] = useState(currentSettings.ambientEnabled);
    const [uiVolume, setUiVolume] = useState(currentSettings.uiVolume);
    const [musicVolume, setMusicVolume] = useState(currentSettings.musicVolume);
    const [ambientVolumes, setAmbientVolumes] = useState<number[]>(currentSettings.ambientVolumes);

    const ambientLabels = audioManager.getAmbientLabels();

    useEffect(() => {
        setUiEnabled(currentSettings.uiEnabled);
        setMusicEnabled(currentSettings.musicEnabled);
        setAmbientEnabled(currentSettings.ambientEnabled);
        setUiVolume(currentSettings.uiVolume);
        setMusicVolume(currentSettings.musicVolume);
        setAmbientVolumes(currentSettings.ambientVolumes);
    }, [currentSettings]);

    const handleSave = () => {
        onSave({
            uiEnabled,
            musicEnabled,
            ambientEnabled,
            uiVolume,
            musicVolume,
            ambientVolumes
        });
        onClose();
    };

    const handleReset = () => {
        setUiVolume(50);
        setMusicVolume(10);
        setAmbientVolumes([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    };

    const updateAmbientVolume = (index: number, value: number) => {
        const newVolumes = [...ambientVolumes];
        newVolumes[index] = value;
        setAmbientVolumes(newVolumes);
        // Real-time update for ambient sounds
        audioManager.updateAmbientVolume(index, value);
    };

    const handleUiVolumeChange = (value: number) => {
        setUiVolume(value);
        // Real-time update
        audioManager.updateUIVolume(value);
    };

    const handleMusicVolumeChange = (value: number) => {
        setMusicVolume(value);
        // Real-time update for music
        audioManager.updateMusicVolume(value);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold text-accent-purple mb-6 font-pixel">Advanced Sound Settings</h2>
                
                {/* Category Toggles */}
                <div className="space-y-3 mb-6 pb-6 border-b border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-text-primary font-semibold">UI Sounds</label>
                            <p className="text-xs text-text-secondary mt-1">Piece placement, messages, clock, new game</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={uiEnabled}
                                onChange={(e) => setUiEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-cyan"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-text-primary font-semibold">Music</label>
                            <p className="text-xs text-text-secondary mt-1">Background music with fade transitions</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={musicEnabled}
                                onChange={(e) => setMusicEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-cyan"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-text-primary font-semibold">Ambient Sounds</label>
                            <p className="text-xs text-text-secondary mt-1">Japanese garden soundscape layers</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={ambientEnabled}
                                onChange={(e) => setAmbientEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-background-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-cyan"></div>
                        </label>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* UI Volume and Music Volume - Side by Side */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* UI Volume */}
                        <div className={!uiEnabled ? 'opacity-50' : ''}>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-text-primary font-semibold">UI Volume</label>
                                <span className="text-text-secondary text-sm">{uiVolume}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={uiVolume}
                                onChange={(e) => handleUiVolumeChange(Number(e.target.value))}
                                disabled={!uiEnabled}
                                className="w-full h-2 bg-background-primary rounded-lg appearance-none cursor-pointer accent-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>

                        {/* Music Volume */}
                        <div className={!musicEnabled ? 'opacity-50' : ''}>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-text-primary font-semibold">Music Volume</label>
                                <span className="text-text-secondary text-sm">{musicVolume}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={musicVolume}
                                onChange={(e) => handleMusicVolumeChange(Number(e.target.value))}
                                disabled={!musicEnabled}
                                className="w-full h-2 bg-background-primary rounded-lg appearance-none cursor-pointer accent-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Ambient Sliders */}
                    <div className={!ambientEnabled ? 'opacity-50' : ''}>
                        <h3 className="text-lg font-semibold text-text-primary mb-4">Ambient Sound Layers</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {ambientLabels.map((label, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-text-primary text-sm">{label}</label>
                                        <span className="text-text-secondary text-xs">{ambientVolumes[index]}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={ambientVolumes[index]}
                                        onChange={(e) => updateAmbientVolume(index, Number(e.target.value))}
                                        disabled={!ambientEnabled}
                                        className="w-full h-2 bg-background-primary rounded-lg appearance-none cursor-pointer accent-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 justify-between mt-8">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 rounded-lg font-semibold text-sm bg-background-primary border border-border hover:bg-background-secondary text-text-secondary transition-colors"
                    >
                        Reset to Default
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg font-semibold text-sm bg-background-primary border border-border hover:bg-background-secondary text-text-primary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent-purple hover:bg-[#8a6fd1] text-white transition-colors"
                        >
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
