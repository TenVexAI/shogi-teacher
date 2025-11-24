import React from 'react';

interface PieceStandProps {
    pieces: { [piece: string]: number };
    color: 'b' | 'w';
    onPieceDrop?: (piece: string) => void;
    boardFlipped?: boolean;
    position?: 'top' | 'bottom';
    useWesternNotation?: boolean;
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

export default function PieceStand({ pieces, color, onPieceDrop, boardFlipped = false, position = 'top', useWesternNotation = false }: PieceStandProps) {
    // Create a 5x7 grid for piece placement
    const grid: (string | null)[][] = Array(5).fill(null).map(() => Array(7).fill(null));
    
    // Determine row indices based on position
    // Top stand: pawns at top (rows 0-1), generals at bottom (row 4)
    // Bottom stand: generals at top (row 0), pawns at bottom (rows 3-4)
    const isTopStand = position === 'top';
    const pawnRows = isTopStand ? [0, 1] : [4, 3];
    const rookBishopRow = isTopStand ? 2 : 2;
    const lanceKnightRow = isTopStand ? 3 : 1;
    const silverGoldRow = isTopStand ? 4 : 0;
    
    // Determine alignment (right for top, left for bottom)
    const alignRight = isTopStand;
    
    let pawnIndex = 0;
    let rookBishopIndex = 0;
    let lanceKnightIndex = 0;
    let silverGoldIndex = 0;
    
    Object.entries(pieces).forEach(([piece, count]) => {
        const baseType = piece.toUpperCase();
        
        for (let i = 0; i < count; i++) {
            if (baseType === 'P') {
                // Pawns in 2 rows (14 total capacity)
                const row = pawnRows[Math.floor(pawnIndex / 7)];
                let col = pawnIndex % 7;
                if (alignRight) col = 6 - col; // Reverse column for right alignment
                if (row !== undefined) grid[row][col] = piece;
                pawnIndex++;
            } else if (baseType === 'R' || baseType === 'B') {
                // Rook and Bishop
                let col = rookBishopIndex;
                if (alignRight) col = 6 - col;
                if (rookBishopIndex < 7) grid[rookBishopRow][col] = piece;
                rookBishopIndex++;
            } else if (baseType === 'L' || baseType === 'N') {
                // Lance and Knight
                let col = lanceKnightIndex;
                if (alignRight) col = 6 - col;
                if (lanceKnightIndex < 7) grid[lanceKnightRow][col] = piece;
                lanceKnightIndex++;
            } else if (baseType === 'S' || baseType === 'G') {
                // Silver and Gold
                let col = silverGoldIndex;
                if (alignRight) col = 6 - col;
                if (silverGoldIndex < 7) grid[silverGoldRow][col] = piece;
                silverGoldIndex++;
            }
        }
    });

    return (
        <div 
            className="relative w-75 h-70 rounded-sm overflow-hidden"
            style={{ 
                backgroundImage: 'url(/images/piece-stand.png)',
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center'
            }}
        >
            {/* Pieces container - 5x7 grid layout */}
            <div className="absolute grid grid-cols-7 grid-rows-5 gap-1 p-1" style={{ 
                top: '0', 
                left: '0', 
                width: '100%', 
                height: '100%' 
            }}>
                {grid.map((row, rowIndex) => 
                    row.map((piece, colIndex) => {
                        if (!piece) return <div key={`${rowIndex}-${colIndex}`} />;
                        
                        const pieceScale = getPieceScale(piece);
                        const shouldRotate = boardFlipped ? color === 'b' : color === 'w';
                        const transformValue = shouldRotate 
                            ? `rotate(180deg) scale(${pieceScale})` 
                            : `scale(${pieceScale})`;
                        const pieceSymbols = useWesternNotation ? WESTERN_PIECE_SYMBOLS : PIECE_SYMBOLS;
                        
                        return (
                            <div
                                key={`${rowIndex}-${colIndex}`}
                                className="shogi-piece cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
                                onClick={() => onPieceDrop?.(piece)}
                                style={{
                                    transform: transformValue,
                                }}
                            >
                                <span className="shogi-piece-text text-3xl font-bold select-none text-black font-shogi">
                                    {pieceSymbols[piece.toUpperCase()]}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
