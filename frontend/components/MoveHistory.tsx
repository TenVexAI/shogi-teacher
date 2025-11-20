'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

export interface MoveRecord {
    moveNumber: number;
    player: 'b' | 'w';
    move: string;
    timestamp: number;
    timeSinceLastMove: number;
    sfen: string; // Board state after this move
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
    isGameOver?: boolean;
    onRevertToMove?: (moveIndex: number) => void;
}

export default function MoveHistory({ moves, currentTurn, isClockRunning = false, onClockToggle, gameTime = 0, onNewGame, isGameOver = false, onRevertToMove }: MoveHistoryPropsExtended) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [showNewGameModal, setShowNewGameModal] = useState(false);
    const [showRevertModal, setShowRevertModal] = useState(false);
    const [selectedMoveIndex, setSelectedMoveIndex] = useState<number | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [moves]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        if (totalSeconds < 60) {
            return `${totalSeconds}s`;
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        }
        return `${minutes}m ${seconds}s`;
    };

    return (
        <div className="bg-background-secondary rounded-lg shadow-md border border-border h-full flex flex-col">
            <div className="bg-linear-to-r from-accent-cyan to-accent-purple text-white p-4 rounded-t-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold font-pixel drop-shadow-lg mb-1">Move History</h2>
                        <div className="flex items-center gap-2 text-sm opacity-90">
                            <span>Current Turn:</span>
                            <div className={`shogi-piece-indicator ${currentTurn === 'b' ? 'bg-black' : 'bg-white'}`}></div>
                            <span>{currentTurn === 'b' ? 'Black' : 'White'}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-bold font-pixel drop-shadow-lg">{moves.length}</div>
                        <div className="text-xs opacity-90">moves</div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {moves.length === 0 ? (
                    <div className="text-center text-text-secondary mt-8">
                        <p>No moves yet</p>
                        <p className="text-sm mt-2">Start the clock and make your first move!</p>
                    </div>
                ) : (
                    <div className="space-y-0.1">
                        {moves.map((move, index) => (
                            <div
                                key={index}
                                onClick={() => {
                                    setSelectedMoveIndex(index);
                                    setShowRevertModal(true);
                                }}
                                className="flex items-center justify-between py-1 hover:bg-background-primary rounded transition-colors cursor-pointer"
                            >
                                {/* Left side: Move number, piece indicator, and move notation */}
                                <div className="flex items-center gap-2">
                                    <span className="text-text-secondary text-xs font-semibold w-8 text-right">
                                        {move.moveNumber}:
                                    </span>
                                    
                                    <div className="w-4 flex items-center justify-center">
                                        <div className={`shogi-piece-indicator ${move.player === 'b' ? 'bg-black' : 'bg-white'}`}></div>
                                    </div>
                                    
                                    <div className="font-mono font-semibold text-text-primary text-sm text-left">
                                        {move.move}
                                    </div>
                                </div>
                                
                                {/* Right side: Times */}
                                <div className="flex items-center gap-2 text-xs">
                                    <div className="text-text-secondary bg-background-primary border border-border px-2 py-1 rounded text-right min-w-[60px]">
                                        +{formatDuration(move.timeSinceLastMove)}
                                    </div>
                                    
                                    <div className="text-text-secondary text-left min-w-[50px]">
                                        {formatTime(move.timestamp)}
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
                <div className="border-t border-border p-3 bg-background-primary rounded-b-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowNewGameModal(true)}
                                className="px-4 py-2 rounded-lg font-semibold text-sm transition-colors bg-accent-cyan hover:bg-[#0fc9ad] text-white font-pixel drop-shadow-lg"
                            >
                                New Game
                            </button>
                            <button
                                onClick={onClockToggle}
                                disabled={isGameOver}
                                className={`w-12 h-10 rounded-lg font-semibold text-lg transition-colors drop-shadow-lg font-pixel flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isClockRunning
                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                        : 'bg-accent-purple hover:bg-[#8a6fd1] text-white'
                                }`}
                            >
                                {isClockRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                            </button>
                        </div>
                        
                        <div className="text-right">
                            <div className="text-xs text-text-secondary mb-1">Game Time</div>
                            <div className="text-xl font-bold font-pixel text-text-primary drop-shadow-lg">
                                {formatTime(gameTime)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* New Game Confirmation Modal */}
            {showNewGameModal && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-background-secondary border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold text-text-primary mb-4">Start New Game?</h2>
                        <p className="text-text-secondary mb-6">
                            Are you sure you want to start a new game? This will reset the board, move history, and clock.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowNewGameModal(false)}
                                className="px-4 py-2 rounded-lg font-semibold text-sm bg-background-primary border border-border hover:bg-background-secondary text-text-primary transition-colors"
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

            {/* Revert to Move Confirmation Modal */}
            {showRevertModal && selectedMoveIndex !== null && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-background-secondary border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold text-text-primary mb-4">Revert to Move {moves[selectedMoveIndex]?.moveNumber}?</h2>
                        <p className="text-text-secondary mb-6">
                            Are you sure you want to go back to move {moves[selectedMoveIndex]?.moveNumber} ({moves[selectedMoveIndex]?.move})? 
                            All moves after this point will be removed from the history.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowRevertModal(false);
                                    setSelectedMoveIndex(null);
                                }}
                                className="px-4 py-2 rounded-lg font-semibold text-sm bg-background-primary border border-border hover:bg-background-secondary text-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowRevertModal(false);
                                    if (onRevertToMove && selectedMoveIndex !== null) {
                                        onRevertToMove(selectedMoveIndex);
                                    }
                                    setSelectedMoveIndex(null);
                                }}
                                className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent-cyan hover:bg-[#0fc9ad] text-white transition-colors"
                            >
                                Revert to Move
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
