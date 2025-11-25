'use client';

import { useState } from 'react';
import { X, Settings, Plus } from 'lucide-react';

interface GameModeSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (settings: GameModeSettings) => void;
    currentSettings: GameModeSettings;
    currentEngineConfig: {
        black: { engineId: string | null; engineName: string };
        white: { engineId: string | null; engineName: string };
    } | null;
    onOpenEngineManagement: () => void;
    onStartNewGame: () => void;
}

export interface GameModeSettings {
    blackPlayer: 'human' | 'computer';
    whitePlayer: 'human' | 'computer';
    blackName: string;
    whiteName: string;
}

// Inner component that resets when key changes
function GameModeSettingsContent({
    onClose,
    onSave,
    currentSettings,
    currentEngineConfig,
    onOpenEngineManagement,
    onStartNewGame,
}: Omit<GameModeSettingsProps, 'isOpen'>) {
    const [blackPlayer, setBlackPlayer] = useState<'human' | 'computer'>(currentSettings.blackPlayer);
    const [whitePlayer, setWhitePlayer] = useState<'human' | 'computer'>(currentSettings.whitePlayer);
    const [blackName, setBlackName] = useState(currentSettings.blackName);
    const [whiteName, setWhiteName] = useState(currentSettings.whiteName);

    const handleSave = () => {
        onSave({
            blackPlayer,
            whitePlayer,
            blackName,
            whiteName,
        });
        onClose();
    };

    const getModeSummary = () => {
        if (blackPlayer === 'human' && whitePlayer === 'human') {
            return 'Human vs Human';
        } else if (blackPlayer === 'computer' && whitePlayer === 'computer') {
            return 'Computer vs Computer';
        } else {
            return 'Human vs Computer';
        }
    };

    const blackEngineName = currentEngineConfig?.black.engineName || 'Not configured';
    const whiteEngineName = currentEngineConfig?.white.engineName || 'Not configured';

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-lg mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary">Game Mode Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-background-primary rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Start New Game Button */}
                    <button
                        onClick={onStartNewGame}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-accent-cyan text-white rounded-lg font-medium hover:bg-[#0fc9ad] transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        Start New Game
                    </button>

                    {/* Current mode indicator */}
                    <div className="text-center py-2 px-4 bg-accent-purple/20 rounded-lg">
                        <span className="text-accent-purple font-medium">{getModeSummary()}</span>
                    </div>

                    {/* Black (Sente) Settings */}
                    <div className="space-y-3 p-4 bg-background-primary rounded-lg">
                        <h3 className="font-medium text-text-primary flex items-center gap-2">
                            <span className="text-lg">☗</span> Black (Sente)
                        </h3>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setBlackPlayer('human')}
                                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                    blackPlayer === 'human'
                                        ? 'bg-accent-cyan text-white'
                                        : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                }`}
                            >
                                Human
                            </button>
                            <button
                                onClick={() => setBlackPlayer('computer')}
                                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                    blackPlayer === 'computer'
                                        ? 'bg-accent-purple text-white'
                                        : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                }`}
                            >
                                Computer
                            </button>
                        </div>

                        {blackPlayer === 'computer' && (
                            <div className="text-sm text-text-secondary">
                                Engine: <span className="text-text-primary">{blackEngineName}</span>
                            </div>
                        )}

                        <input
                            type="text"
                            value={blackName}
                            onChange={(e) => setBlackName(e.target.value)}
                            placeholder={blackPlayer === 'computer' ? blackEngineName : 'Guest'}
                            className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                        />
                    </div>

                    {/* White (Gote) Settings */}
                    <div className="space-y-3 p-4 bg-background-primary rounded-lg">
                        <h3 className="font-medium text-text-primary flex items-center gap-2">
                            <span className="text-lg">☖</span> White (Gote)
                        </h3>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setWhitePlayer('human')}
                                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                    whitePlayer === 'human'
                                        ? 'bg-accent-cyan text-white'
                                        : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                }`}
                            >
                                Human
                            </button>
                            <button
                                onClick={() => setWhitePlayer('computer')}
                                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                    whitePlayer === 'computer'
                                        ? 'bg-accent-purple text-white'
                                        : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                }`}
                            >
                                Computer
                            </button>
                        </div>

                        {whitePlayer === 'computer' && (
                            <div className="text-sm text-text-secondary">
                                Engine: <span className="text-text-primary">{whiteEngineName}</span>
                            </div>
                        )}

                        <input
                            type="text"
                            value={whiteName}
                            onChange={(e) => setWhiteName(e.target.value)}
                            placeholder={whitePlayer === 'computer' ? whiteEngineName : 'Guest'}
                            className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                        />
                    </div>

                    {/* Engine Configuration Link */}
                    {(blackPlayer === 'computer' || whitePlayer === 'computer') && (
                        <button
                            onClick={onOpenEngineManagement}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-purple transition-colors"
                        >
                            <Settings className="w-4 h-4" />
                            Configure Engines
                        </button>
                    )}

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        className="w-full py-3 bg-accent-purple text-white rounded-lg font-medium hover:bg-[#8a6fd1] transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function GameModeSettingsModal({
    isOpen,
    currentSettings,
    ...props
}: GameModeSettingsProps) {
    if (!isOpen) return null;
    
    // Use settings as key to reset state when modal opens with new values
    const key = `${currentSettings.blackPlayer}-${currentSettings.whitePlayer}-${currentSettings.blackName}-${currentSettings.whiteName}`;
    return <GameModeSettingsContent key={key} currentSettings={currentSettings} {...props} />;
}
