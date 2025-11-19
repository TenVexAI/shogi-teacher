'use client';

import { useEffect, useRef, useState } from 'react';

export interface MoveRecord {
    moveNumber: number;
    player: 'b' | 'w';
    move: string;
    timestamp: number;
    timeSinceLastMove: number;
}

interface MoveHistoryProps {
    moves: MoveRecord[];
    currentTurn: 'b' | 'w';
}

interface MoveHistoryPropsExtended extends MoveHistoryProps {
    isClockRunning?: boolean;
    onClockToggle?: () => void;
    gameTime?: number;
    onNewGame?: () => void;
}

export default function MoveHistory({ moves, currentTurn, isClockRunning = false, onClockToggle, gameTime = 0, onNewGame }: MoveHistoryPropsExtended) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [showNewGameModal, setShowNewGameModal] = useState(false);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [moves]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col">
            <div className="bg-linear-to-r from-blue-600 to-purple-600 text-white p-4 rounded-t-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold">Move History</h2>
                        <p className="text-sm opacity-90">
                            Current Turn: {currentTurn === 'b' ? '⚫ Black' : '⚪ White'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-bold">{moves.length}</div>
                        <div className="text-xs opacity-90">moves</div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {moves.length === 0 ? (
                    <div className="text-center text-gray-400 mt-8">
                        <p>No moves yet</p>
                        <p className="text-sm mt-2">Start the clock and make your first move!</p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {moves.map((move, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between px-2 py-1 hover:bg-gray-50 rounded transition-colors"
                            >
                                {/* Left side: Turn number box and move notation */}
                                <div className="flex items-center gap-2">
                                    <div 
                                        className={`shrink-0 w-8 h-7 flex items-center justify-center rounded font-bold text-xs ${
                                            move.player === 'b'
                                                ? 'bg-gray-800 text-white'
                                                : 'bg-white text-gray-800 border border-gray-400'
                                        }`}
                                    >
                                        {move.moveNumber}
                                    </div>
                                    
                                    <div className="font-mono font-semibold text-gray-800 text-sm">
                                        {move.move}
                                    </div>
                                </div>
                                
                                {/* Right side: Times */}
                                <div className="flex items-center gap-2 text-xs">
                                    <div className="text-gray-600">
                                        {formatTime(move.timestamp)}
                                    </div>
                                    
                                    <div className="text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                        +{formatDuration(move.timeSinceLastMove)}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* Clock controls at bottom */}
            {onClockToggle && (
                <div className="border-t border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowNewGameModal(true)}
                                className="px-4 py-2 rounded-lg font-semibold text-sm transition-colors bg-orange-600 hover:bg-orange-700 text-white"
                            >
                                New Game
                            </button>
                            <button
                                onClick={onClockToggle}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                    isClockRunning
                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                        : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                            >
                                {isClockRunning ? '⏸ Pause' : '▶ Start'}
                            </button>
                        </div>
                        
                        <div className="text-right">
                            <div className="text-xs text-gray-600 mb-1">Game Time</div>
                            <div className="text-2xl font-bold font-mono text-gray-800">
                                {formatTime(gameTime)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* New Game Confirmation Modal */}
            {showNewGameModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Start New Game?</h2>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to start a new game? This will reset the board, move history, and clock.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowNewGameModal(false)}
                                className="px-4 py-2 rounded-lg font-semibold text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowNewGameModal(false);
                                    if (onNewGame) onNewGame();
                                }}
                                className="px-4 py-2 rounded-lg font-semibold text-sm bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                            >
                                Start New Game
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
