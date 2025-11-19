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

    return (
        <div className={`${bgColor} ${textColor} p-3 rounded-lg`}>
            <div className="text-sm font-semibold mb-2 font-pixel drop-shadow-lg">{colorName}&apos;s Captured Pieces</div>
            <div className="flex flex-wrap gap-2">
                {Object.entries(pieces).length === 0 ? (
                    <div className="text-xs opacity-60">None</div>
                ) : (
                    Object.entries(pieces).map(([piece, count]) => (
                        <div
                            key={piece}
                            className="flex items-center gap-1 bg-opacity-20 bg-white px-2 py-1 rounded cursor-pointer hover:bg-opacity-30 transition-colors"
                            onClick={() => onPieceDrop?.(piece)}
                            title={`Click to drop ${PIECE_SYMBOLS[piece]}`}
                        >
                            <span className="text-lg font-shogi">{PIECE_SYMBOLS[piece]}</span>
                            {count > 1 && <span className="text-xs">×{count}</span>}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
