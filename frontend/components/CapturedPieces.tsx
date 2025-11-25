import React from 'react';

interface CapturedPiecesProps {
    pieces: { [piece: string]: number };
    color: 'b' | 'w';
    onPieceDrop?: (piece: string) => void;
    boardFlipped?: boolean;
    isTopPanel?: boolean;
    useWesternNotation?: boolean;
    playerName?: string;
}

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

export default function CapturedPieces({ pieces, color, onPieceDrop, boardFlipped = false, isTopPanel = false, useWesternNotation = false, playerName }: CapturedPiecesProps) {
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
        <div className={`${bgColor} ${textColor} p-3 rounded-lg w-[524px] h-[100px] border border-border overflow-y-auto`}>
            <div className={`text-sm font-semibold mb-2 font-pixel drop-shadow-lg ${alignClass}`}>
                {displayName}&apos;s Captured Pieces
            </div>
            <div className={`flex flex-wrap gap-2 ${alignClass}`}>
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
                        return (
                            <div
                                key={`${piece}-${index}`}
                                className="shogi-piece cursor-pointer hover:scale-110 transition-transform"
                                onClick={() => onPieceDrop?.(piece)}
                                title={`Click to drop ${pieceSymbols[piece]}`}
                                style={{
                                    transform: transformValue,
                                }}
                            >
                                <span className="shogi-piece-text text-2xl font-bold select-none text-black font-shogi">
                                    {pieceSymbols[piece]}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
