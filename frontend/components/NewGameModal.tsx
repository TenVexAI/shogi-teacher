'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Upload, Users, Monitor, Bot, Settings, ArrowLeftRight, Globe, Camera, Edit2 } from 'lucide-react';
import { GameMode } from '@/types/game';
import ImageToBoardModal from './ImageToBoardModal';

interface EngineConfig {
    black: { engineId: string | null; engineName: string };
    white: { engineId: string | null; engineName: string };
}

interface OnlinePlayState {
    isInGame: boolean;
    isP2PConnected: boolean;
    opponentName: string | null;
    currentUserName?: string | null;
}

interface NewGameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartGame: (config: GameConfig) => void;
    onImportGame: (content: string, format?: string) => void;
    onLoadFromSfen: (sfen: string) => void;
    currentEngineConfig: EngineConfig | null;
    onOpenEngineManagement: () => void;
    onlinePlayState?: OnlinePlayState;
    hasLLMConfigured?: boolean;
}

export interface GameConfig {
    mode: GameMode;
    humanPlaysAs: 'black' | 'white';
    blackEngine: string;
    whiteEngine: string;
    blackName: string;
    whiteName: string;
    handicap?: string | null;  // Handicap ID or null for no handicap
}

// Handicap definitions with SFEN starting positions
// In handicap games, White (gote) has pieces removed and moves first
// Note: "Left" from White's perspective = file 1 side (right side from Black's view)
export const HANDICAPS = [
    {
        id: 'sente',
        nameEn: 'Black',
        nameJp: '先手 (sente)',
        description: 'Standard position, White moves first',
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: 'lance',
        nameEn: 'Lance',
        nameJp: '香落ち (kyō ochi)',
        description: 'Left lance removed',
        sfen: 'lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: 'bishop',
        nameEn: 'Bishop',
        nameJp: '角落ち (kaku ochi)',
        description: 'Bishop removed',
        sfen: 'lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: 'rook',
        nameEn: 'Rook',
        nameJp: '飛車落ち (hisha ochi)',
        description: 'Rook removed',
        sfen: 'lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: 'rook-lance',
        nameEn: 'Rook–Lance',
        nameJp: '飛香落ち (hi-kyō ochi)',
        description: 'Rook, left lance removed',
        sfen: 'lnsgkgsn1/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '2-piece',
        nameEn: '2-Piece',
        nameJp: '二枚落ち (ni-mai ochi)',
        description: 'Rook, bishop removed',
        sfen: 'lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '4-piece',
        nameEn: '4-Piece',
        nameJp: '四枚落ち (yon-mai ochi)',
        description: 'Rook, bishop, both lances removed',
        sfen: '1nsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '6-piece',
        nameEn: '6-Piece',
        nameJp: '六枚落ち (roku-mai ochi)',
        description: 'Rook, bishop, lances, knights removed',
        sfen: '2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '8-piece',
        nameEn: '8-Piece',
        nameJp: '八枚落ち (hachi-mai ochi)',
        description: 'Rook, bishop, lances, knights, silvers removed',
        sfen: '3gkg3/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '9-piece',
        nameEn: '9-Piece',
        nameJp: '九枚落ち (kyū-mai ochi)',
        description: 'Left gold also removed',
        sfen: '3gk4/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '10-piece',
        nameEn: '10-Piece',
        nameJp: '十枚落ち (jū-mai ochi)',
        description: 'Both golds also removed',
        sfen: '4k4/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
    {
        id: '3-pawns',
        nameEn: 'Three Pawns',
        nameJp: '歩三兵 (fu sanbyō)',
        description: 'Only king remains, 3 pawns in hand',
        sfen: '4k4/9/9/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w 3p 1',
    },
    {
        id: 'naked-king',
        nameEn: 'Naked King',
        nameJp: '裸玉 (hadaka gyoku)',
        description: 'Only king remains',
        sfen: '4k4/9/9/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    },
];

const GAME_MODES = [
    {
        id: 'human_vs_human' as GameMode,
        name: 'Human vs Human',
        description: 'Two players take turns on this device',
        icon: Users,
    },
    {
        id: 'human_vs_computer' as GameMode,
        name: 'Human vs Computer',
        description: 'Play against a shogi engine',
        icon: Monitor,
    },
    {
        id: 'computer_vs_computer' as GameMode,
        name: 'Computer vs Computer',
        description: 'Watch two engines play each other',
        icon: Bot,
    },
];

export default function NewGameModal({
    isOpen,
    onClose,
    onStartGame,
    onImportGame,
    onLoadFromSfen,
    currentEngineConfig,
    onOpenEngineManagement,
    onlinePlayState,
    hasLLMConfigured = false,
}: NewGameModalProps) {
    // Check if we're in online P2P mode
    const isOnlineP2P = onlinePlayState?.isInGame && onlinePlayState?.isP2PConnected;

    // Initialize state with online mode values if applicable
    const getInitialBlackName = () => isOnlineP2P ? (onlinePlayState?.currentUserName || '') : '';
    const getInitialWhiteName = () => isOnlineP2P ? (onlinePlayState?.opponentName || '') : '';
    
    const [selectedMode, setSelectedMode] = useState<GameMode>('human_vs_human');
    const [humanPlaysAs, setHumanPlaysAs] = useState<'black' | 'white'>('black');
    const [blackName, setBlackName] = useState(getInitialBlackName);
    const [whiteName, setWhiteName] = useState(getInitialWhiteName);
    const [showImport, setShowImport] = useState(false);
    const [showImageToBoard, setShowImageToBoard] = useState(false);
    const [showCustomBoard, setShowCustomBoard] = useState(false);
    const [importContent, setImportContent] = useState('');
    const [importFormat, setImportFormat] = useState<string>('');
    const [handicapEnabled, setHandicapEnabled] = useState(false);
    const [selectedHandicap, setSelectedHandicap] = useState<string>('2-piece');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Track previous online state to detect changes
    const prevIsOnlineP2P = useRef(isOnlineP2P);
    
    // Update names when online state changes (e.g., modal reopened while in game)
    useEffect(() => {
        if (isOnlineP2P && !prevIsOnlineP2P.current) {
            // Just transitioned to online mode
            setBlackName(onlinePlayState?.currentUserName || '');
            setWhiteName(onlinePlayState?.opponentName || '');
            setSelectedMode('human_vs_human');
        }
        prevIsOnlineP2P.current = isOnlineP2P;
    }, [isOnlineP2P, onlinePlayState]);

    // Reset to main view when modal opens
    useEffect(() => {
        if (isOpen) {
            setShowImport(false);
        }
    }, [isOpen]);

    // Swap player names (black <-> white)
    const handleSwapPlayers = () => {
        const tempBlack = blackName;
        setBlackName(whiteName);
        setWhiteName(tempBlack);
    };

    // Get engine info from current config
    const blackEngineName = currentEngineConfig?.black.engineName || 'Not configured';
    const whiteEngineName = currentEngineConfig?.white.engineName || 'Not configured';
    const blackEngineId = currentEngineConfig?.black.engineId || 'yaneuraou';
    const whiteEngineId = currentEngineConfig?.white.engineId || 'yaneuraou';

    if (!isOpen) return null;

    const handleStartGame = () => {
        onStartGame({
            mode: selectedMode,
            humanPlaysAs,
            blackEngine: blackEngineId,
            whiteEngine: whiteEngineId,
            blackName: blackName || '',
            whiteName: whiteName || '',
            handicap: handicapEnabled ? selectedHandicap : null,
        });
        onClose();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Try to detect format from extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['kif', 'csa', 'ki2', 'psn'].includes(ext || '')) {
            setImportFormat(ext || '');
        }

        // For KIF and KI2 files, try Shift_JIS encoding first (common for Japanese game records)
        // If that fails or produces garbled text, fall back to UTF-8
        const isJapaneseFormat = ext === 'kif' || ext === 'ki2';
        
        if (isJapaneseFormat) {
            try {
                // Try Shift_JIS first
                const arrayBuffer = await file.arrayBuffer();
                const decoder = new TextDecoder('shift_jis');
                const shiftJisContent = decoder.decode(arrayBuffer);
                
                // Check if it looks like valid Japanese (contains Japanese move markers)
                if (shiftJisContent.includes('▲') || shiftJisContent.includes('△') || 
                    shiftJisContent.includes('先手') || shiftJisContent.includes('後手')) {
                    setImportContent(shiftJisContent);
                    return;
                }
                
                // Fall back to UTF-8
                const utf8Decoder = new TextDecoder('utf-8');
                setImportContent(utf8Decoder.decode(arrayBuffer));
            } catch {
                // If decoding fails, read as UTF-8
                const reader = new FileReader();
                reader.onload = (event) => {
                    setImportContent(event.target?.result as string);
                };
                reader.readAsText(file, 'UTF-8');
            }
        } else {
            // For CSA and PSN, use UTF-8
            const reader = new FileReader();
            reader.onload = (event) => {
                setImportContent(event.target?.result as string);
            };
            reader.readAsText(file, 'UTF-8');
        }
    };

    const handleImport = () => {
        if (importContent) {
            onImportGame(importContent, importFormat || undefined);
            onClose();
        }
    };

    const handleOpenEngineSettings = () => {
        onClose();
        onOpenEngineManagement();
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary">
                        {showImport ? 'Import Game' : 'New Game'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-background-primary rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Import Game and Game From Image buttons - only shown when not importing */}
                    {!showImport && (
                        <div className="flex gap-2 mb-6 flex-wrap">
                            <button
                                onClick={() => setShowImport(true)}
                                className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 bg-background-primary text-text-secondary hover:text-text-primary hover:bg-background-secondary"
                            >
                                <Upload className="w-4 h-4" />
                                Import Game Instead
                            </button>
                            <button
                                onClick={() => setShowImageToBoard(true)}
                                disabled={!hasLLMConfigured}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                                    hasLLMConfigured
                                        ? 'bg-background-primary text-text-secondary hover:text-text-primary hover:bg-background-secondary'
                                        : 'bg-background-primary/50 text-text-secondary/50 cursor-not-allowed'
                                }`}
                                title={hasLLMConfigured ? 'Load position from image' : 'Requires LLM API key configured in Settings'}
                            >
                                <Camera className="w-4 h-4" />
                                Game From Image
                            </button>
                            <button
                                onClick={() => setShowCustomBoard(true)}
                                className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 bg-background-primary text-text-secondary hover:text-text-primary hover:bg-background-secondary"
                                title="Set up a custom board position"
                            >
                                <Edit2 className="w-4 h-4" />
                                Custom Board
                            </button>
                        </div>
                    )}
                    {/* Back button when importing */}
                    {showImport && (
                        <div className="flex gap-2 mb-6">
                            <button
                                onClick={() => setShowImport(false)}
                                className="px-4 py-2 rounded-lg font-medium transition-colors bg-background-primary text-text-secondary hover:text-text-primary hover:bg-background-secondary"
                            >
                                ← Back to New Game
                            </button>
                        </div>
                    )}

                    {showImport ? (
                        /* Import section */
                        <div className="space-y-4">
                            <p className="text-text-secondary text-sm">
                                Import a saved game in KIF, CSA, KI2, or PSN format.
                            </p>

                            {/* File upload */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-accent-purple transition-colors"
                            >
                                <Upload className="w-12 h-12 mx-auto mb-4 text-text-secondary" />
                                <p className="text-text-primary font-medium">
                                    Click to upload or drag and drop
                                </p>
                                <p className="text-text-secondary text-sm mt-1">
                                    KIF, CSA, KI2, PSN files
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".kif,.csa,.ki2,.psn,.txt"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                            </div>

                            {/* Or paste content */}
                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">
                                    Or paste game content:
                                </label>
                                <textarea
                                    value={importContent}
                                    onChange={(e) => setImportContent(e.target.value)}
                                    placeholder="Paste KIF, CSA, KI2, or PSN content here..."
                                    className="w-full h-40 px-3 py-2 bg-background-primary border border-border rounded-lg text-text-primary placeholder-text-secondary text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent-purple"
                                />
                            </div>

                            {/* Format selector (optional) */}
                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">
                                    Format (auto-detected if not specified):
                                </label>
                                <select
                                    value={importFormat}
                                    onChange={(e) => setImportFormat(e.target.value)}
                                    className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                                >
                                    <option value="">Auto-detect</option>
                                    <option value="kif">KIF</option>
                                    <option value="csa">CSA</option>
                                    <option value="ki2">KI2</option>
                                    <option value="psn">PSN</option>
                                </select>
                            </div>

                            <button
                                onClick={handleImport}
                                disabled={!importContent}
                                className="w-full py-3 bg-accent-purple text-white rounded-lg font-medium hover:bg-[#8a6fd1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Import Game
                            </button>
                        </div>
                    ) : (
                        /* New game section */
                        <div className="space-y-6">
                            {/* Game mode selection */}
                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-3">
                                    Game Mode
                                </label>
                                <div className="grid grid-cols-1 gap-3">
                                    {GAME_MODES.map((mode) => {
                                        // Determine if this mode should be disabled in online mode
                                        const isDisabled = isOnlineP2P && mode.id !== 'human_vs_human';
                                        const isOnlineMatch = isOnlineP2P && mode.id === 'human_vs_human';
                                        
                                        return (
                                            <button
                                                key={mode.id}
                                                onClick={() => !isDisabled && setSelectedMode(mode.id)}
                                                disabled={isDisabled}
                                                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                                                    isDisabled
                                                        ? 'border-border opacity-40 cursor-not-allowed'
                                                        : selectedMode === mode.id
                                                            ? 'border-accent-purple bg-accent-purple/10'
                                                            : 'border-border hover:border-text-secondary'
                                                } ${isOnlineMatch ? 'border-[#3cf281] bg-[#3cf281]/10' : ''}`}
                                            >
                                                {isOnlineMatch ? (
                                                    <Globe className="w-8 h-8 text-[#3cf281]" />
                                                ) : (
                                                    <mode.icon className={`w-8 h-8 ${
                                                        isDisabled
                                                            ? 'text-text-secondary/50'
                                                            : selectedMode === mode.id 
                                                                ? 'text-accent-purple' 
                                                                : 'text-text-secondary'
                                                    }`} />
                                                )}
                                                <div className="text-left flex-1">
                                                    <div className={`font-medium ${isDisabled ? 'text-text-secondary/50' : 'text-text-primary'}`}>
                                                        {isOnlineMatch ? 'Online Match' : mode.name}
                                                    </div>
                                                    <div className={`text-sm ${isDisabled ? 'text-text-secondary/50' : 'text-text-secondary'}`}>
                                                        {isOnlineMatch 
                                                            ? `Playing online vs ${onlinePlayState?.opponentName}`
                                                            : isDisabled
                                                                ? 'Unavailable during online match'
                                                                : mode.description
                                                        }
                                                    </div>
                                                </div>
                                                {isOnlineMatch && (
                                                    <span className="px-2 py-1 bg-[#3cf281]/20 text-[#3cf281] text-xs rounded font-medium">
                                                        Connected
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Human vs Computer options */}
                            {selectedMode === 'human_vs_computer' && (
                                <div className="space-y-4 p-4 bg-background-primary rounded-lg">
                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-2">
                                            Play as
                                        </label>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setHumanPlaysAs('black')}
                                                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                                    humanPlaysAs === 'black'
                                                        ? 'bg-gray-800 text-white'
                                                        : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                                }`}
                                            >
                                                ☗ Black (Sente)
                                            </button>
                                            <button
                                                onClick={() => setHumanPlaysAs('white')}
                                                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                                    humanPlaysAs === 'white'
                                                        ? 'bg-gray-200 text-gray-800'
                                                        : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                                }`}
                                            >
                                                ☖ White (Gote)
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-2">
                                            Computer Engine
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary">
                                                {humanPlaysAs === 'black' ? whiteEngineName : blackEngineName}
                                            </div>
                                            <button
                                                onClick={handleOpenEngineSettings}
                                                className="flex items-center gap-2 px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-purple transition-colors"
                                            >
                                                <Settings className="w-4 h-4" />
                                                Configure
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Computer vs Computer options */}
                            {selectedMode === 'computer_vs_computer' && (
                                <div className="space-y-4 p-4 bg-background-primary rounded-lg">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-text-primary mb-2">
                                                ☗ Black Engine
                                            </label>
                                            <div className="px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary">
                                                {blackEngineName}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-text-primary mb-2">
                                                ☖ White Engine
                                            </label>
                                            <div className="px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary">
                                                {whiteEngineName}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleOpenEngineSettings}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-purple transition-colors"
                                    >
                                        <Settings className="w-4 h-4" />
                                        Configure Engines
                                    </button>
                                </div>
                            )}

                            {/* Player names */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-medium text-text-primary">
                                        {isOnlineP2P ? 'Player Names' : 'Player Names (optional)'}
                                    </label>
                                    {isOnlineP2P && (
                                        <button
                                            onClick={handleSwapPlayers}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-purple transition-colors"
                                            title="Swap black and white players"
                                        >
                                            <ArrowLeftRight className="w-4 h-4" />
                                            Swap Colors
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-text-secondary mb-1">
                                            ☗ Black (Sente)
                                        </label>
                                        <input
                                            type="text"
                                            value={blackName}
                                            onChange={(e) => setBlackName(e.target.value)}
                                            placeholder={
                                                selectedMode === 'human_vs_computer' && humanPlaysAs === 'white'
                                                    ? blackEngineName
                                                    : selectedMode === 'computer_vs_computer'
                                                    ? blackEngineName
                                                    : 'Guest'
                                            }
                                            className={`w-full px-3 py-2 bg-background-primary border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-purple ${
                                                isOnlineP2P ? 'border-[#3cf281]/50' : 'border-border'
                                            }`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-text-secondary mb-1">
                                            ☖ White (Gote)
                                        </label>
                                        <input
                                            type="text"
                                            value={whiteName}
                                            onChange={(e) => setWhiteName(e.target.value)}
                                            placeholder={
                                                selectedMode === 'human_vs_computer' && humanPlaysAs === 'black'
                                                    ? whiteEngineName
                                                    : selectedMode === 'computer_vs_computer'
                                                    ? whiteEngineName
                                                    : 'Guest'
                                            }
                                            className={`w-full px-3 py-2 bg-background-primary border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-purple ${
                                                isOnlineP2P ? 'border-[#3cf281]/50' : 'border-border'
                                            }`}
                                        />
                                    </div>
                                </div>
                                {isOnlineP2P && (
                                    <p className="text-xs text-[#3cf281]/70">
                                        Use &quot;Swap Colors&quot; to change who plays Black (first move) vs White
                                    </p>
                                )}
                            </div>

                            {/* Handicap selection */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-medium text-text-primary">
                                        Handicap
                                    </label>
                                    <button
                                        onClick={() => setHandicapEnabled(!handicapEnabled)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            handicapEnabled ? 'bg-accent-purple' : 'bg-background-primary border border-border'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                handicapEnabled ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                                
                                {handicapEnabled && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-text-secondary">
                                            White (Gote) starts with fewer pieces and moves first
                                        </p>
                                        <select
                                            value={selectedHandicap}
                                            onChange={(e) => setSelectedHandicap(e.target.value)}
                                            className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                                        >
                                            {HANDICAPS.map((h) => (
                                                <option key={h.id} value={h.id}>
                                                    {h.nameEn} — {h.nameJp}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-text-secondary italic">
                                            {HANDICAPS.find(h => h.id === selectedHandicap)?.description}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleStartGame}
                                className="w-full py-3 bg-accent-purple text-white rounded-lg font-medium hover:bg-[#8a6fd1] transition-colors"
                            >
                                Start Game
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Image to Board Modal */}
            <ImageToBoardModal
                isOpen={showImageToBoard}
                onClose={() => setShowImageToBoard(false)}
                onConfirm={(sfen) => {
                    onLoadFromSfen(sfen);
                    setShowImageToBoard(false);
                    onClose();
                }}
                hasLLMConfigured={hasLLMConfigured}
            />

            {/* Custom Board Modal */}
            <ImageToBoardModal
                isOpen={showCustomBoard}
                onClose={() => setShowCustomBoard(false)}
                onConfirm={(sfen) => {
                    onLoadFromSfen(sfen);
                    setShowCustomBoard(false);
                    onClose();
                }}
                hasLLMConfigured={true} // Not needed for custom mode
                mode="custom"
            />
        </div>
    );
}
