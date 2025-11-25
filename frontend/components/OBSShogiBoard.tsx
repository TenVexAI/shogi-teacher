'use client';

import { useMemo } from 'react';
import { GameState } from '@/types/game';
import PieceStand from './PieceStand';

interface OBSShogiBoardProps {
    gameState: GameState;
    lastMoveUsi: string | null;
    highlightLastMove?: boolean;
    showJapaneseCoords?: boolean;
    useWesternNotation?: boolean;
    boardFlipped?: boolean;
    showMovementOverlay?: boolean;
}

const PIECE_SYMBOLS: { [key: string]: string } = {
    // White pieces (lowercase in SFEN)
    'p': '歩', 'l': '香', 'n': '桂', 's': '銀', 'g': '金', 'b': '角', 'r': '飛', 'k': '玉',
    '+p': 'と', '+l': '杏', '+n': '圭', '+s': '全', '+b': '馬', '+r': '龍',
    // Black pieces (uppercase in SFEN)
    'P': '歩', 'L': '香', 'N': '桂', 'S': '銀', 'G': '金', 'B': '角', 'R': '飛', 'K': '王',
    '+P': 'と', '+L': '杏', '+N': '圭', '+S': '全', '+B': '馬', '+R': '龍',
};

const WESTERN_PIECE_SYMBOLS: { [key: string]: string } = {
    'p': 'P', 'l': 'L', 'n': 'N', 's': 'S', 'g': 'G', 'b': 'B', 'r': 'R', 'k': 'K',
    '+p': '+P', '+l': '+L', '+n': '+N', '+s': '+S', '+b': '+B', '+r': '+R',
    'P': 'P', 'L': 'L', 'N': 'N', 'S': 'S', 'G': 'G', 'B': 'B', 'R': 'R', 'K': 'K',
    '+P': '+P', '+L': '+L', '+N': '+N', '+S': '+S', '+B': '+B', '+R': '+R',
};

type MovementPattern = { [direction: number]: 'dot' | 'line' };

const PIECE_MOVEMENTS: { [key: string]: MovementPattern | 'knight' } = {
    'p': { 4: 'dot' }, 'P': { 0: 'dot' },
    'l': { 4: 'line' }, 'L': { 0: 'line' },
    'n': 'knight', 'N': 'knight',
    's': { 3: 'dot', 4: 'dot', 5: 'dot', 1: 'dot', 7: 'dot' },
    'S': { 0: 'dot', 1: 'dot', 3: 'dot', 5: 'dot', 7: 'dot' },
    'g': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' },
    'G': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' },
    'b': { 1: 'line', 3: 'line', 5: 'line', 7: 'line' },
    'B': { 1: 'line', 3: 'line', 5: 'line', 7: 'line' },
    'r': { 0: 'line', 2: 'line', 4: 'line', 6: 'line' },
    'R': { 0: 'line', 2: 'line', 4: 'line', 6: 'line' },
    'k': { 0: 'dot', 1: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot', 7: 'dot' },
    'K': { 0: 'dot', 1: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot', 7: 'dot' },
    '+p': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' },
    '+P': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' },
    '+l': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' },
    '+L': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' },
    '+n': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' },
    '+N': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' },
    '+s': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' },
    '+S': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' },
    '+b': { 0: 'dot', 1: 'line', 2: 'dot', 3: 'line', 4: 'dot', 5: 'line', 6: 'dot', 7: 'line' },
    '+B': { 0: 'dot', 1: 'line', 2: 'dot', 3: 'line', 4: 'dot', 5: 'line', 6: 'dot', 7: 'line' },
    '+r': { 0: 'line', 1: 'dot', 2: 'line', 3: 'dot', 4: 'line', 5: 'dot', 6: 'line', 7: 'dot' },
    '+R': { 0: 'line', 1: 'dot', 2: 'line', 3: 'dot', 4: 'line', 5: 'dot', 6: 'line', 7: 'dot' },
};

const JAPANESE_COORDINATES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function parseSfen(sfen: string): (string | null)[][] {
    // Extract only the board position part (before space/turn indicator)
    const boardPart = sfen.split(' ')[0];
    const rows = boardPart.split('/');
    return rows.map(row => {
        const squares: (string | null)[] = [];
        let i = 0;
        while (i < row.length) {
            const char = row[i];
            if (char === '+') {
                squares.push('+' + row[i + 1]);
                i += 2;
            } else if (!isNaN(parseInt(char))) {
                const emptyCount = parseInt(char);
                for (let j = 0; j < emptyCount; j++) {
                    squares.push(null);
                }
                i++;
            } else {
                squares.push(char);
                i++;
            }
        }
        return squares;
    });
}

function usiToPosition(usi: string): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
    if (usi.includes('*')) return null;
    
    const fromFile = 9 - parseInt(usi[0]);
    const fromRank = usi.charCodeAt(1) - 'a'.charCodeAt(0);
    const toFile = 9 - parseInt(usi[2]);
    const toRank = usi.charCodeAt(3) - 'a'.charCodeAt(0);
    
    return {
        from: { row: fromRank, col: fromFile },
        to: { row: toRank, col: toFile }
    };
}

function parseLastMoveUsi(lastMoveUsi: string | null): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
    if (!lastMoveUsi) {
        return null;
    }
    
    if (!lastMoveUsi.includes('*')) {
        return usiToPosition(lastMoveUsi);
    }
    
    const parts = lastMoveUsi.split('*');
    if (parts.length !== 2) {
        return null;
    }
    
    const destination = parts[1];
    if (destination.length < 2) {
        return null;
    }
    
    const toCol = 9 - parseInt(destination[0]);
    const toRow = destination.charCodeAt(1) - 'a'.charCodeAt(0);
    
    return {
        from: { row: -1, col: -1 },
        to: { row: toRow, col: toCol }
    };
}

export default function OBSShogiBoard({ 
    gameState, 
    lastMoveUsi,
    highlightLastMove = true,
    showJapaneseCoords = false,
    useWesternNotation = false,
    boardFlipped = false,
    showMovementOverlay = false
}: OBSShogiBoardProps) {
    const board = useMemo(() => parseSfen(gameState.sfen), [gameState.sfen]);
    const lastMovePositions = parseLastMoveUsi(lastMoveUsi);

    return (
        <div className="relative flex items-center justify-center" style={{ marginLeft: -150, marginTop: -250 }}>
            {/* White's piece stand - top left */}
            <div className="absolute" style={{ top: 0, left: -310 }}>
                <PieceStand
                    pieces={boardFlipped ? gameState.pieces_in_hand.b : gameState.pieces_in_hand.w}
                    color={boardFlipped ? "b" : "w"}
                    boardFlipped={boardFlipped}
                    position="top"
                    useWesternNotation={useWesternNotation}
                />
            </div>

            {/* Black's piece stand - bottom right */}
            <div className="absolute" style={{ bottom: 0, right: -310 }}>
                <PieceStand
                    pieces={boardFlipped ? gameState.pieces_in_hand.w : gameState.pieces_in_hand.b}
                    color={boardFlipped ? "w" : "b"}
                    boardFlipped={boardFlipped}
                    position="bottom"
                    useWesternNotation={useWesternNotation}
                />
            </div>

            <div className="inline-block" style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}>
                {/* Board with extended edges containing coordinates */}
                <div className="flex">
                    {/* The actual board with equal padding on all sides for coordinates */}
                    <div 
                        className="relative rounded-sm overflow-hidden"
                        style={{
                            backgroundImage: 'url(/images/wood-grain.png)',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            padding: '20px'
                        }}
                    >
                        {/* Column numbers (9 to 1) - positioned on top edge */}
                        <div className="absolute top-0 left-6 flex" style={{ marginTop: '2px' }}>
                            {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(num => (
                                <div 
                                    key={num} 
                                    className="w-16 h-5 flex items-center justify-center text-sm font-semibold text-black font-pixel"
                                    style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}
                                >
                                    {num}
                                </div>
                            ))}
                        </div>
                        
                        {/* Row letters - positioned on right edge */}
                        <div className="absolute right-0 top-6 flex flex-col" style={{ marginRight: '2px' }}>
                            {showJapaneseCoords 
                                ? JAPANESE_COORDINATES.map((coord, idx) => (
                                    <div 
                                        key={idx} 
                                        className="w-5 h-16 flex items-center justify-center text-base font-semibold text-black font-shogi"
                                        style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}
                                    >
                                        {coord}
                                    </div>
                                ))
                                : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(letter => (
                                    <div 
                                        key={letter} 
                                        className="w-5 h-16 flex items-center justify-center text-sm font-semibold text-black font-pixel"
                                        style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}
                                    >
                                        {letter}
                                    </div>
                                ))
                            }
                        </div>
                        
                        {board.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex">
                                {row.map((piece, colIndex) => {
                                    const isWhitePiece = piece && piece.toLowerCase() === piece && piece !== '+';
                                    const pieceSymbols = useWesternNotation ? WESTERN_PIECE_SYMBOLS : PIECE_SYMBOLS;
                                    const pieceSymbol = piece ? pieceSymbols[piece] || piece : '';
                                    
                                    const isLastMoveSquare = highlightLastMove && lastMovePositions && (
                                        (lastMovePositions.from.row === rowIndex && lastMovePositions.from.col === colIndex) ||
                                        (lastMovePositions.to.row === rowIndex && lastMovePositions.to.col === colIndex)
                                    );

                                    const isPromoted = piece && piece.startsWith('+');
                                    
                                    const getPieceScale = (piece: string | null): number => {
                                        if (!piece) return 1.0;
                                        const baseType = piece.replace('+', '').toLowerCase();
                                        switch (baseType) {
                                            case 'k': return 1.0;
                                            case 'r': return 0.97;
                                            case 'b': return 0.97;
                                            case 'g': return 0.94;
                                            case 's': return 0.94;
                                            case 'n': return 0.91;
                                            case 'l': return 0.88;
                                            case 'p': return 0.85;
                                            default: return 1.0;
                                        }
                                    };
                                    const pieceScale = piece ? getPieceScale(piece) * 1.3 : 1.3;
                                    
                                    const hasStarPointTopRight = (rowIndex === 3 && colIndex === 2) || 
                                                                 (rowIndex === 3 && colIndex === 5) ||
                                                                 (rowIndex === 6 && colIndex === 2) || 
                                                                 (rowIndex === 6 && colIndex === 5);
                                    
                                    return (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            className={`
                                                relative w-16 h-16 border border-gray-800 flex items-center justify-center
                                                ${isLastMoveSquare ? 'bg-cyan-200/40 ring-2 ring-cyan-400/60' : ''}
                                            `}
                                        >
                                            {hasStarPointTopRight && (
                                                <div 
                                                    className="absolute w-1.5 h-1.5 bg-gray-800 rounded-full z-10"
                                                    style={{
                                                        right: '-0.5px',
                                                        top: '-1.0px',
                                                        transform: 'translate(50%, -50%)'
                                                    }}
                                                />
                                            )}
                                            {piece && (
                                                <>
                                                    <div 
                                                        className="shogi-piece relative z-10"
                                                        style={{ 
                                                            transform: `${boardFlipped 
                                                                ? (isWhitePiece ? 'rotate(180deg)' : 'rotate(0deg)')
                                                                : (isWhitePiece ? 'rotate(180deg)' : 'rotate(0deg)')} scale(${pieceScale})`
                                                        }}
                                                    >
                                                        <span className={`shogi-piece-text ${useWesternNotation ? 'text-2xl' : 'text-3xl'} font-bold select-none font-shogi ${isPromoted ? 'text-red-600' : 'text-black'}`}>
                                                            {pieceSymbol}
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Movement Overlay */}
                                                    {showMovementOverlay && (
                                                        <div className="absolute inset-0 pointer-events-none z-20">
                                                            {(() => {
                                                                const movement = PIECE_MOVEMENTS[piece];
                                                                if (!movement) return null;
                                                                
                                                                if (movement === 'knight') {
                                                                    const topPosition = isWhitePiece ? '75%' : '25%';
                                                                    return (
                                                                        <>
                                                                            <div 
                                                                                className="absolute text-xl font-bold text-accent-purple opacity-70"
                                                                                style={{ 
                                                                                    top: topPosition, 
                                                                                    left: '25%', 
                                                                                    transform: `translate(-50%, -50%) ${isWhitePiece ? 'rotate(-90deg) scaleX(-1)' : 'rotate(-90deg)'}`
                                                                                }}
                                                                            >
                                                                                ⤴
                                                                            </div>
                                                                            <div 
                                                                                className="absolute text-xl font-bold text-accent-purple opacity-70"
                                                                                style={{ 
                                                                                    top: topPosition, 
                                                                                    left: '75%', 
                                                                                    transform: `translate(-50%, -50%) ${isWhitePiece ? 'rotate(90deg)' : 'rotate(90deg) scaleX(-1)'}`
                                                                                }}
                                                                            >
                                                                                ⤴
                                                                            </div>
                                                                        </>
                                                                    );
                                                                }
                                                                
                                                                const directionOffsets = [
                                                                    [-1, 0], [-1, 1], [0, 1], [1, 1],
                                                                    [1, 0], [1, -1], [0, -1], [-1, -1],
                                                                ];
                                                                
                                                                return Object.entries(movement).map(([dir, type]) => {
                                                                    const direction = parseInt(dir);
                                                                    const [dy, dx] = directionOffsets[direction];
                                                                    const distance = type === 'dot' ? 30 : 32;
                                                                    const top = 50 + (dy * distance);
                                                                    const left = 50 + (dx * distance);
                                                                    
                                                                    return (
                                                                        <div
                                                                            key={direction}
                                                                            className="absolute"
                                                                            style={{
                                                                                top: `${top}%`,
                                                                                left: `${left}%`,
                                                                                transform: 'translate(-50%, -50%)',
                                                                            }}
                                                                        >
                                                                            {type === 'dot' ? (
                                                                                <div className="w-2.5 h-2.5 rounded-full bg-accent-purple opacity-70" />
                                                                            ) : (
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
                                                                            )}
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
