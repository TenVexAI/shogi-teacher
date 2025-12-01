import React from 'react';

interface CapturedPiecesProps {
    pieces: { [piece: string]: number };
    color: 'b' | 'w';
    onPieceDrop?: (piece: string) => void;
    boardFlipped?: boolean;
    isTopPanel?: boolean;
    useWesternNotation?: boolean;
    playerName?: string;
    showMovementOverlay?: boolean;
}

// Movement patterns for captured pieces - Black perspective (up = forward)
// White pieces use mirrored patterns (down = forward)
type MovementPattern = { [direction: number]: 'dot' | 'line' };
const PIECE_MOVEMENTS_BLACK: { [key: string]: MovementPattern | 'knight' } = {
    'P': { 0: 'dot' }, // Pawn: forward 1
    'L': { 0: 'line' }, // Lance: forward continuous
    'N': 'knight', // Knight: L-shape
    'S': { 0: 'dot', 1: 'dot', 3: 'dot', 5: 'dot', 7: 'dot' }, // Silver: forward + diagonals
    'G': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' }, // Gold: 6 directions
    'B': { 1: 'line', 3: 'line', 5: 'line', 7: 'line' }, // Bishop: diagonals
    'R': { 0: 'line', 2: 'line', 4: 'line', 6: 'line' }, // Rook: orthogonals
};
const PIECE_MOVEMENTS_WHITE: { [key: string]: MovementPattern | 'knight' } = {
    'P': { 4: 'dot' }, // Pawn: forward 1 (down for white)
    'L': { 4: 'line' }, // Lance: forward continuous
    'N': 'knight', // Knight: L-shape
    'S': { 4: 'dot', 3: 'dot', 5: 'dot', 1: 'dot', 7: 'dot' }, // Silver
    'G': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' }, // Gold
    'B': { 1: 'line', 3: 'line', 5: 'line', 7: 'line' }, // Bishop: diagonals
    'R': { 0: 'line', 2: 'line', 4: 'line', 6: 'line' }, // Rook: orthogonals
};

const PIECE_SYMBOLS: { [key: string]: string } = {
    'P': '歩', 'L': '香', 'N': '桂', 'S': '銀', 'G': '金', 'B': '角', 'R': '飛'
};

const WESTERN_PIECE_SYMBOLS: { [key: string]: string } = {
    'P': 'P', 'L': 'L', 'N': 'N', 'S': 'S', 'G': 'G', 'B': 'B', 'R': 'R'
};

// Get scale factor based on piece type
const getPieceScale = (piece: string): number => {
    if (!piece) return 1.0;
    const baseType = piece.replace('+', '').toLowerCase();
    switch (baseType) {
        case 'k': return 1.0;  // King
        case 'r': return 0.97; // Rook
        case 'b': return 0.97; // Bishop
        case 'g': return 0.94; // Gold
        case 's': return 0.94; // Silver
        case 'n': return 0.91; // Knight
        case 'l': return 0.88; // Lance
        case 'p': return 0.85; // Pawn
        default: return 1.0;
    }
};

export default function CapturedPieces({ pieces, color, onPieceDrop, boardFlipped = false, isTopPanel = false, useWesternNotation = false, playerName, showMovementOverlay = false }: CapturedPiecesProps) {
    const colorName = color === 'b' ? 'Black' : 'White';
    const displayName = playerName || colorName;
    const bgColor = color === 'b' ? 'bg-[#111111]' : 'bg-gray-100';
    const textColor = color === 'b' ? 'text-white' : 'text-gray-800';
    const alignClass = isTopPanel ? 'text-left justify-start' : 'text-right justify-end';

    // Flatten pieces array to show each piece individually
    const individualPieces: string[] = [];
    Object.entries(pieces).forEach(([piece, count]) => {
        for (let i = 0; i < count; i++) {
            individualPieces.push(piece);
        }
    });

    return (
        <div className={`${bgColor} ${textColor} p-3 rounded-lg w-[524px] h-[100px] border border-border`} style={{ overflow: 'visible' }}>
            <div className={`text-sm font-semibold mb-2 font-pixel drop-shadow-lg ${alignClass}`}>
                {displayName}&apos;s Captured Pieces
            </div>
            <div className={`flex flex-wrap gap-2 ${alignClass} overflow-visible`}>
                {individualPieces.length === 0 ? (
                    <div className="text-xs opacity-60">None</div>
                ) : (
                    individualPieces.map((piece, index) => {
                        const pieceScale = getPieceScale(piece);
                        const shouldRotate = boardFlipped ? color === 'b' : color === 'w';
                        const transformValue = shouldRotate 
                            ? `rotate(180deg) scale(${pieceScale})` 
                            : `scale(${pieceScale})`;
                        const pieceSymbols = useWesternNotation ? WESTERN_PIECE_SYMBOLS : PIECE_SYMBOLS;
                        // Use movement pattern based on visual orientation (where piece is on screen)
                        // When at bottom (not rotated), forward is visually UP - use BLACK patterns
                        // When at top (rotated), forward is visually DOWN - use WHITE patterns
                        const isAtTop = shouldRotate; // Pieces at top are rotated
                        const movement = isAtTop ? PIECE_MOVEMENTS_WHITE[piece] : PIECE_MOVEMENTS_BLACK[piece];
                        
                        // Direction offsets for overlay [dy, dx] - positive dy is down
                        const directionOffsets: [number, number][] = [
                            [-1, 0],  // 0: up
                            [-1, 1],  // 1: up-right
                            [0, 1],   // 2: right
                            [1, 1],   // 3: down-right
                            [1, 0],   // 4: down
                            [1, -1],  // 5: down-left
                            [0, -1],  // 6: left
                            [-1, -1], // 7: up-left
                        ];
                        
                        return (
                            <div
                                key={`${piece}-${index}`}
                                className="shogi-piece cursor-pointer hover:scale-110 transition-transform relative overflow-visible"
                                onClick={() => onPieceDrop?.(piece)}
                                title={`Click to drop ${pieceSymbols[piece]}`}
                                style={{
                                    transform: transformValue,
                                    overflow: 'visible',
                                }}
                            >
                                <span className="shogi-piece-text text-2xl font-bold select-none text-black font-shogi">
                                    {pieceSymbols[piece]}
                                </span>
                                
                                {/* Movement Overlay - counter-rotate for white pieces since piece itself is rotated */}
                                {showMovementOverlay && movement && (
                                    <div className="absolute inset-0 pointer-events-none z-20" style={{ transform: shouldRotate ? 'rotate(180deg)' : 'none' }}>
                                        {movement === 'knight' ? (
                                            // Knight: curved arrows like the board
                                            // isAtTop means forward is down, so arrows point down
                                            <>
                                                <div 
                                                    className="absolute text-sm font-bold text-accent-purple opacity-70"
                                                    style={{ 
                                                        top: isAtTop ? '70%' : '30%', 
                                                        left: '25%', 
                                                        transform: `translate(-50%, -50%) ${isAtTop ? 'rotate(-90deg) scaleX(-1)' : 'rotate(-90deg)'}`
                                                    }}
                                                >
                                                    ⤴
                                                </div>
                                                <div 
                                                    className="absolute text-sm font-bold text-accent-purple opacity-70"
                                                    style={{ 
                                                        top: isAtTop ? '70%' : '30%', 
                                                        left: '75%', 
                                                        transform: `translate(-50%, -50%) ${isAtTop ? 'rotate(90deg)' : 'rotate(90deg) scaleX(-1)'}`
                                                    }}
                                                >
                                                    ⤴
                                                </div>
                                            </>
                                        ) : (
                                            Object.entries(movement).map(([dir, type]) => {
                                                const direction = parseInt(dir);
                                                const [dy, dx] = directionOffsets[direction];
                                                const isLine = type === 'line';
                                                
                                                // Position from center - same ratios as board
                                                const distance = isLine ? 32 : 30;
                                                const posX = 50 + dx * distance;
                                                const posY = 50 + dy * distance;
                                                
                                                return (
                                                    <div
                                                        key={direction}
                                                        className="absolute"
                                                        style={{
                                                            left: `${posX}%`,
                                                            top: `${posY}%`,
                                                            transform: 'translate(-50%, -50%)',
                                                        }}
                                                    >
                                                        {isLine ? (
                                                            <div 
                                                                className="w-1 h-2.5 bg-accent-purple opacity-70"
                                                                style={{
                                                                    transform: dx === 0 
                                                                        ? 'none'
                                                                        : dy === 0
                                                                            ? 'rotate(90deg)'
                                                                            : `rotate(${Math.atan2(dy, dx) * (180 / Math.PI) + 90}deg)`
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="w-2.5 h-2.5 rounded-full bg-accent-purple opacity-70" />
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
