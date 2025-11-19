import React from 'react';

interface CapturedPiecesProps {
    pieces: { [piece: string]: number };
    color: 'b' | 'w';
    onPieceDrop?: (piece: string) => void;
}

const PIECE_SYMBOLS: { [key: string]: string } = {
    'P': '歩', 'L': '香', 'N': '桂', 'S': '銀', 'G': '金', 'B': '角', 'R': '飛'
};

export default function CapturedPieces({ pieces, color, onPieceDrop }: CapturedPiecesProps) {
    const colorName = color === 'b' ? 'Black' : 'White';
    const bgColor = color === 'b' ? 'bg-gray-800' : 'bg-gray-100';
    const textColor = color === 'b' ? 'text-white' : 'text-gray-800';
    const alignClass = color === 'b' ? 'text-right justify-end' : 'text-left justify-start';

    // Flatten pieces array to show each piece individually
    const individualPieces: string[] = [];
    Object.entries(pieces).forEach(([piece, count]) => {
        for (let i = 0; i < count; i++) {
            individualPieces.push(piece);
        }
    });

    return (
        <div className={`${bgColor} ${textColor} p-3 rounded-lg w-[524px] min-h-[80px]`}>
            <div className={`text-sm font-semibold mb-2 font-pixel drop-shadow-lg ${alignClass}`}>
                {colorName}&apos;s Captured Pieces
            </div>
            <div className={`flex flex-wrap gap-2 ${alignClass}`}>
                {individualPieces.length === 0 ? (
                    <div className="text-xs opacity-60">None</div>
                ) : (
                    individualPieces.map((piece, index) => (
                        <div
                            key={`${piece}-${index}`}
                            className="shogi-piece cursor-pointer hover:scale-110 transition-transform"
                            onClick={() => onPieceDrop?.(piece)}
                            title={`Click to drop ${PIECE_SYMBOLS[piece]}`}
                            style={{
                                transform: color === 'w' ? 'rotate(180deg)' : 'none',
                            }}
                        >
                            <span className="shogi-piece-text text-3xl font-bold select-none text-black font-shogi">
                                {PIECE_SYMBOLS[piece]}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
