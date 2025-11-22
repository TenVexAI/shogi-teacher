'use client';

import { useState, useMemo } from 'react';
import { GameState } from '@/types/game';
import CapturedPieces from './CapturedPieces';
import { Languages, FlipVertical, Type, Zap, Compass } from 'lucide-react';

interface Position {
    row: number;
    col: number;
}

interface EngineConfig {
    black: {
        engineId: string | null;
        strengthLevel: number;
    };
    white: {
        engineId: string | null;
        strengthLevel: number;
    };
}

interface ShogiBoardProps {
    gameState: GameState;
    onMove: (move: string) => void;
    showBestMove?: boolean;
    onBestMove?: () => void;
    isLoading?: boolean;
    showCheckNotification?: boolean;
    isCheck?: boolean;
    engineConfig?: EngineConfig;
    showBoardOptionsPanel?: boolean;
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
    // White pieces (lowercase in SFEN)
    'p': 'P', 'l': 'L', 'n': 'N', 's': 'S', 'g': 'G', 'b': 'B', 'r': 'R', 'k': 'K',
    '+p': '+P', '+l': '+L', '+n': '+N', '+s': '+S', '+b': '+B', '+r': '+R',
    // Black pieces (uppercase in SFEN)
    'P': 'P', 'L': 'L', 'N': 'N', 'S': 'S', 'G': 'G', 'B': 'B', 'R': 'R', 'K': 'K',
    '+P': '+P', '+L': '+L', '+N': '+N', '+S': '+S', '+B': '+B', '+R': '+R',
};

const JAPANESE_COORDINATES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

// Movement patterns: direction => type ('dot' for 1 square, 'line' for continuous, 'knight' for L-shape)
// Directions: 0=up, 1=up-right, 2=right, 3=down-right, 4=down, 5=down-left, 6=left, 7=up-left
type MovementPattern = { [direction: number]: 'dot' | 'line' };

const PIECE_MOVEMENTS: { [key: string]: MovementPattern | 'knight' } = {
    // Pawn: forward 1
    'p': { 4: 'dot' }, // White pawn (moves down in display)
    'P': { 0: 'dot' }, // Black pawn (moves up in display)
    // Lance: forward continuous
    'l': { 4: 'line' }, 
    'L': { 0: 'line' },
    // Knight: special L-shape
    'n': 'knight',
    'N': 'knight',
    // Silver: 5 directions (forward, forward-diagonals, back-diagonals)
    's': { 3: 'dot', 4: 'dot', 5: 'dot', 1: 'dot', 7: 'dot' }, // White silver
    'S': { 0: 'dot', 1: 'dot', 3: 'dot', 5: 'dot', 7: 'dot' }, // Black silver
    // Gold: 6 directions (forward, sides, forward-diagonals, back)
    'g': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' }, // White gold
    'G': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' }, // Black gold
    // Bishop: 4 diagonals continuous
    'b': { 1: 'line', 3: 'line', 5: 'line', 7: 'line' },
    'B': { 1: 'line', 3: 'line', 5: 'line', 7: 'line' },
    // Rook: 4 orthogonal continuous
    'r': { 0: 'line', 2: 'line', 4: 'line', 6: 'line' },
    'R': { 0: 'line', 2: 'line', 4: 'line', 6: 'line' },
    // King: all 8 directions, 1 square
    'k': { 0: 'dot', 1: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot', 7: 'dot' },
    'K': { 0: 'dot', 1: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot', 7: 'dot' },
    // Promoted pieces (move like gold)
    '+p': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' }, // Promoted pawn (white, like gold)
    '+P': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' }, // Promoted pawn (black, like gold)
    '+l': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' }, // Promoted lance (white, like gold)
    '+L': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' }, // Promoted lance (black, like gold)
    '+n': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' }, // Promoted knight (white, like gold)
    '+N': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' }, // Promoted knight (black, like gold)
    '+s': { 0: 'dot', 2: 'dot', 3: 'dot', 4: 'dot', 5: 'dot', 6: 'dot' }, // Promoted silver (white, like gold)
    '+S': { 0: 'dot', 1: 'dot', 2: 'dot', 4: 'dot', 6: 'dot', 7: 'dot' }, // Promoted silver (black, like gold)
    '+b': { 0: 'dot', 1: 'line', 2: 'dot', 3: 'line', 4: 'dot', 5: 'line', 6: 'dot', 7: 'line' }, // Promoted bishop (dragon horse)
    '+B': { 0: 'dot', 1: 'line', 2: 'dot', 3: 'line', 4: 'dot', 5: 'line', 6: 'dot', 7: 'line' },
    '+r': { 0: 'line', 1: 'dot', 2: 'line', 3: 'dot', 4: 'line', 5: 'dot', 6: 'line', 7: 'dot' }, // Promoted rook (dragon king)
    '+R': { 0: 'line', 1: 'dot', 2: 'line', 3: 'dot', 4: 'line', 5: 'dot', 6: 'line', 7: 'dot' },
};

function parseSfen(sfen: string): (string | null)[][] {
    const parts = sfen.split(' ');
    const boardPart = parts[0];
    const rows = boardPart.split('/');

    const board: (string | null)[][] = [];

    for (const row of rows) {
        const boardRow: (string | null)[] = [];
        let i = 0;
        while (i < row.length) {
            const char = row[i];
            if (char === '+') {
                // Promoted piece
                boardRow.push('+' + row[i + 1]);
                i += 2;
            } else if (!isNaN(parseInt(char))) {
                // Empty squares
                const count = parseInt(char);
                for (let j = 0; j < count; j++) {
                    boardRow.push(null);
                }
                i++;
            } else {
                // Regular piece
                boardRow.push(char);
                i++;
            }
        }
        board.push(boardRow);
    }

    return board;
}

function usiToPosition(usi: string): { from: Position; to: Position } | null {
    if (usi.length < 4) return null;

    const fromCol = 9 - parseInt(usi[0]);
    const fromRow = usi.charCodeAt(1) - 'a'.charCodeAt(0);
    const toCol = 9 - parseInt(usi[2]);
    const toRow = usi.charCodeAt(3) - 'a'.charCodeAt(0);

    return {
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol }
    };
}

function positionToUsi(from: Position, to: Position, promote: boolean = false): string {
    const fromCol = 9 - from.col;
    const fromRow = String.fromCharCode('a'.charCodeAt(0) + from.row);
    const toCol = 9 - to.col;
    const toRow = String.fromCharCode('a'.charCodeAt(0) + to.row);

    return `${fromCol}${fromRow}${toCol}${toRow}${promote ? '+' : ''}`;
}

// Check if a piece can promote
function canPromote(piece: string, fromRow: number, toRow: number, isBlack: boolean): boolean {
    // Already promoted pieces can't promote again
    if (piece.startsWith('+')) return false;
    // Gold and King can't promote
    const pieceType = piece.toLowerCase();
    if (pieceType === 'g' || pieceType === 'k') return false;
    
    // Check if move is in or to promotion zone (last 3 rows)
    if (isBlack) {
        return fromRow <= 2 || toRow <= 2;
    } else {
        return fromRow >= 6 || toRow >= 6;
    }
}

// Check if a piece MUST promote (would be unable to move otherwise)
function mustPromote(piece: string, toRow: number, isBlack: boolean): boolean {
    const pieceType = piece.toLowerCase();
    
    if (isBlack) {
        // Pawn or Lance on last row
        if ((pieceType === 'p' || pieceType === 'l') && toRow === 0) return true;
        // Knight on last 2 rows
        if (pieceType === 'n' && toRow <= 1) return true;
    } else {
        // Pawn or Lance on last row
        if ((pieceType === 'p' || pieceType === 'l') && toRow === 8) return true;
        // Knight on last 2 rows
        if (pieceType === 'n' && toRow >= 7) return true;
    }
    
    return false;
}

export default function ShogiBoard({ gameState, onMove, showBestMove = false, onBestMove, isLoading = false, showCheckNotification = true, engineConfig, showBoardOptionsPanel = true }: ShogiBoardProps) {
    const board = useMemo(() => parseSfen(gameState.sfen), [gameState.sfen]);
    const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
    const [selectedDropPiece, setSelectedDropPiece] = useState<string | null>(null);
    
    // Board display toggles
    const [useJapaneseCoords, setUseJapaneseCoords] = useState(false);
    const [boardFlipped, setBoardFlipped] = useState(false);
    const [useWesternNotation, setUseWesternNotation] = useState(false);
    const [highlightLastMove, setHighlightLastMove] = useState(false);
    const [showMovementOverlay, setShowMovementOverlay] = useState(false);
    const [lastMovePositions, setLastMovePositions] = useState<{ from: Position; to: Position } | null>(null);

    // Check if current player has an engine configured
    const currentPlayerHasEngine = engineConfig 
        ? (gameState.turn === 'b' ? engineConfig.black.engineId !== null : engineConfig.white.engineId !== null)
        : true; // If no config provided, assume engine is available (backward compatibility)
    const [legalMoves, setLegalMoves] = useState<Position[]>([]);
    const [showPromotionDialog, setShowPromotionDialog] = useState(false);
    const [pendingMove, setPendingMove] = useState<{ from: Position; to: Position; piece: string } | null>(null);

    const handleDropPieceSelect = (piece: string) => {
        // Clear any selected square
        setSelectedSquare(null);
        setLegalMoves([]);

        // Toggle drop piece selection
        if (selectedDropPiece === piece) {
            setSelectedDropPiece(null);
        } else {
            setSelectedDropPiece(piece);

            // Find legal drop squares for this piece
            const dropMoves: Position[] = [];
            gameState.legal_moves.forEach(usi => {
                // Drop moves are in format: P*5e (piece*square)
                if (usi.includes('*') && usi.startsWith(piece)) {
                    const squarePart = usi.split('*')[1];
                    const col = 9 - parseInt(squarePart[0]);
                    const row = squarePart.charCodeAt(1) - 'a'.charCodeAt(0);
                    dropMoves.push({ row, col });
                }
            });
            setLegalMoves(dropMoves);
        }
    };

    const handleSquareClick = (row: number, col: number) => {
        // If a drop piece is selected, try to drop it
        if (selectedDropPiece) {
            const isLegalDrop = legalMoves.some(m => m.row === row && m.col === col);
            if (isLegalDrop) {
                const col_usi = 9 - col;
                const row_usi = String.fromCharCode('a'.charCodeAt(0) + row);
                const dropMove = `${selectedDropPiece}*${col_usi}${row_usi}`;
                onMove(dropMove);
                // Track drop move (no 'from' position for drops, so use same position)
                setLastMovePositions({ from: { row, col }, to: { row, col } });
            }
            setSelectedDropPiece(null);
            setLegalMoves([]);
            return;
        }

        // Normal piece movement logic
        if (!selectedSquare) {
            // Select a piece
            if (board[row]?.[col]) {
                setSelectedSquare({ row, col });

                // Calculate legal moves for this piece
                const moves: Position[] = [];
                gameState.legal_moves.forEach(usi => {
                    if (!usi.includes('*')) {  // Skip drop moves
                        const positions = usiToPosition(usi);
                        if (positions && positions.from.row === row && positions.from.col === col) {
                            moves.push(positions.to);
                        }
                    }
                });
                setLegalMoves(moves);
            }
        } else {
            // Try to move
            const isLegalMove = legalMoves.some(m => m.row === row && m.col === col);

            if (isLegalMove) {
                const piece = board[selectedSquare.row]?.[selectedSquare.col];
                if (!piece) return;

                const isBlack = gameState.turn === 'b';
                const fromRow = selectedSquare.row;
                const toRow = row;

                // Check if promotion is possible
                if (canPromote(piece, fromRow, toRow, isBlack)) {
                    // Check if promotion is forced
                    if (mustPromote(piece, toRow, isBlack)) {
                        // Auto-promote
                        const usiMove = positionToUsi(selectedSquare, { row, col }, true);
                        onMove(usiMove);
                    } else {
                        // Show promotion dialog
                        setPendingMove({ from: selectedSquare, to: { row, col }, piece });
                        setShowPromotionDialog(true);
                        return; // Don't clear selection yet
                    }
                } else {
                    // No promotion possible, just move
                    const usiMove = positionToUsi(selectedSquare, { row, col });
                    onMove(usiMove);
                    // Track last move for highlighting
                    setLastMovePositions({ from: selectedSquare, to: { row, col } });
                }
            }

            setSelectedSquare(null);
            setLegalMoves([]);
        }
    };

    const isSelected = (row: number, col: number) => {
        return selectedSquare?.row === row && selectedSquare?.col === col;
    };

    const isLegalMove = (row: number, col: number) => {
        return legalMoves.some(m => m.row === row && m.col === col);
    };

    const handlePromote = (promote: boolean) => {
        if (!pendingMove) return;
        
        const usiMove = positionToUsi(pendingMove.from, pendingMove.to, promote);
        onMove(usiMove);
        
        // Track last move for highlighting
        setLastMovePositions({ from: pendingMove.from, to: pendingMove.to });
        
        setShowPromotionDialog(false);
        setPendingMove(null);
        setSelectedSquare(null);
        setLegalMoves([]);
    };

    const attackerColor = gameState.turn === 'b' ? 'White' : 'Black';
    const defenderColor = gameState.turn === 'b' ? 'Black' : 'White';
    const isGameOver = gameState.is_game_over;

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Top captured pieces - swap based on board orientation */}
            <CapturedPieces
                pieces={boardFlipped ? gameState.pieces_in_hand.b : gameState.pieces_in_hand.w}
                color={boardFlipped ? "b" : "w"}
                onPieceDrop={boardFlipped 
                    ? (gameState.turn === 'b' ? handleDropPieceSelect : undefined)
                    : (gameState.turn === 'w' ? handleDropPieceSelect : undefined)
                }
                boardFlipped={boardFlipped}
                isTopPanel={true}
            />

            {/* Reserved space for check notification (top) */}
            <div className="h-6 flex items-center justify-center">
                {showCheckNotification && (boardFlipped ? gameState.turn === 'b' : gameState.turn === 'w') && (
                    isGameOver ? (
                        <div className="font-bold text-base font-pixel text-accent-cyan">
                            🏆 Checkmate! {gameState.winner === 'b' ? 'Black' : 'White'} Wins!
                        </div>
                    ) : gameState.in_check ? (
                        <div className="font-semibold text-sm font-pixel animate-color-shift">
                            ⚠️ {attackerColor} put {defenderColor} in Check!
                        </div>
                    ) : null
                )}
            </div>

            <div className="inline-block" style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}>
                {/* Column numbers (9 to 1) */}
                <div className="flex" style={{ marginLeft: useJapaneseCoords ? '12px' : '44px' }}>
                    {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(num => (
                        <div 
                            key={num} 
                            className="w-12 h-8 flex items-center justify-center text-sm font-semibold text-text-primary font-pixel drop-shadow-lg"
                            style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}
                        >
                            {num}
                        </div>
                    ))}
                </div>

                {/* Board with row letters/numbers */}
                <div className="flex">
                    {/* Left coordinates (a-i or empty if Japanese coords) */}
                    {!useJapaneseCoords && (
                        <div className="flex flex-col justify-center">
                            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(letter => (
                                <div 
                                    key={letter} 
                                    className="w-8 h-12 flex items-center justify-center text-sm font-semibold text-text-primary font-pixel drop-shadow-lg"
                                    style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}
                                >
                                    {letter}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* The actual board */}
                    <div className="border-4 border-gray-700 bg-amber-100 p-2">
                        {board.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex">
                                {row.map((piece, colIndex) => {
                                    // In this SFEN: uppercase = Black (bottom), lowercase = White (top)
                                    // Black pieces should be right-side up, White pieces should be upside down
                                    const isWhitePiece = piece && piece.toLowerCase() === piece && piece !== '+';
                                    const pieceSymbols = useWesternNotation ? WESTERN_PIECE_SYMBOLS : PIECE_SYMBOLS;
                                    const pieceSymbol = piece ? pieceSymbols[piece] || piece : '';
                                    
                                    // Check if this square is part of the last move
                                    const isLastMoveSquare = highlightLastMove && lastMovePositions && (
                                        (lastMovePositions.from.row === rowIndex && lastMovePositions.from.col === colIndex) ||
                                        (lastMovePositions.to.row === rowIndex && lastMovePositions.to.col === colIndex)
                                    );

                                    const isPromoted = piece && piece.startsWith('+');
                                    
                                    return (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            onClick={() => handleSquareClick(rowIndex, colIndex)}
                                            className={`
                        relative w-12 h-12 border border-gray-700 flex items-center justify-center
                        cursor-pointer hover:bg-amber-200 transition-colors
                        ${isSelected(rowIndex, colIndex) ? 'bg-blue-300' : ''}
                        ${isLegalMove(rowIndex, colIndex) ? 'bg-green-200' : ''}
                        ${selectedDropPiece && isLegalMove(rowIndex, colIndex) ? 'bg-purple-200' : ''}
                        ${isLastMoveSquare ? 'bg-cyan-200/40 ring-2 ring-cyan-400/60' : ''}
                      `}
                                        >
                                            {piece && (
                                                <>
                                                    <div 
                                                        className="shogi-piece relative z-10"
                                                        style={{ 
                                                            transform: boardFlipped 
                                                                ? (isWhitePiece ? 'rotate(180deg)' : 'rotate(0deg)')
                                                                : (isWhitePiece ? 'rotate(180deg)' : 'rotate(0deg)')
                                                        }}
                                                    >
                                                        <span className={`shogi-piece-text ${useWesternNotation ? 'text-xl' : 'text-3xl'} font-bold select-none ${useWesternNotation ? 'font-pixel' : 'font-shogi'} ${isPromoted ? 'text-red-600' : 'text-black'}`}>
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
                                                                    // Knight: curved arrows in corners pointing left and right
                                                                    const isWhite = isWhitePiece;
                                                                    // Position arrows at the forward corners (2 up/down, 1 left/right)
                                                                    const topPosition = isWhite ? '75%' : '25%'; // forward direction
                                                                    
                                                                    return (
                                                                        <>
                                                                            {/* Left corner arrow */}
                                                                            <div 
                                                                                className="absolute text-xl font-bold text-accent-purple opacity-70"
                                                                                style={{ 
                                                                                    top: topPosition, 
                                                                                    left: '25%', 
                                                                                    transform: `translate(-50%, -50%) ${isWhite ? 'rotate(-90deg) scaleX(-1)' : 'rotate(-90deg)'}`
                                                                                }}
                                                                            >
                                                                                ⤴
                                                                            </div>
                                                                            {/* Right corner arrow */}
                                                                            <div 
                                                                                className="absolute text-xl font-bold text-accent-purple opacity-70"
                                                                                style={{ 
                                                                                    top: topPosition, 
                                                                                    left: '75%', 
                                                                                    transform: `translate(-50%, -50%) ${isWhite ? 'rotate(90deg)' : 'rotate(90deg) scaleX(-1)'}`
                                                                                }}
                                                                            >
                                                                                ⤴
                                                                            </div>
                                                                        </>
                                                                    );
                                                                }
                                                                
                                                                // Direction offsets: [dy, dx]
                                                                const directionOffsets = [
                                                                    [-1, 0],  // 0: up
                                                                    [-1, 1],  // 1: up-right
                                                                    [0, 1],   // 2: right
                                                                    [1, 1],   // 3: down-right
                                                                    [1, 0],   // 4: down
                                                                    [1, -1],  // 5: down-left
                                                                    [0, -1],  // 6: left
                                                                    [-1, -1], // 7: up-left
                                                                ];
                                                                
                                                                return Object.entries(movement).map(([dir, type]) => {
                                                                    const direction = parseInt(dir);
                                                                    const [dy, dx] = directionOffsets[direction];
                                                                    
                                                                    // Position: center + direction * distance (closer to edges)
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
                    
                    {/* Right coordinates (Japanese numerals if enabled) */}
                    {useJapaneseCoords && (
                        <div className="flex flex-col justify-center">
                            {JAPANESE_COORDINATES.map((coord, idx) => (
                                <div 
                                    key={idx} 
                                    className="w-8 h-12 flex items-center justify-center text-lg font-semibold text-text-primary font-shogi drop-shadow-lg"
                                    style={{ transform: boardFlipped ? 'rotate(180deg)' : 'none' }}
                                >
                                    {coord}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Reserved space for check notification (bottom) */}
            <div className="h-6 flex items-center justify-center">
                {showCheckNotification && (boardFlipped ? gameState.turn === 'w' : gameState.turn === 'b') && (
                    isGameOver ? (
                        <div className="font-bold text-base font-pixel text-accent-cyan">
                            🏆 Checkmate! {gameState.winner === 'b' ? 'Black' : 'White'} Wins!
                        </div>
                    ) : gameState.in_check ? (
                        <div className="font-semibold text-sm font-pixel animate-color-shift">
                            ⚠️ {attackerColor} put {defenderColor} in Check!
                        </div>
                    ) : null
                )}
            </div>

            {/* Bottom captured pieces - swap based on board orientation */}
            <CapturedPieces
                pieces={boardFlipped ? gameState.pieces_in_hand.w : gameState.pieces_in_hand.b}
                color={boardFlipped ? "w" : "b"}
                onPieceDrop={boardFlipped
                    ? (gameState.turn === 'w' ? handleDropPieceSelect : undefined)
                    : (gameState.turn === 'b' ? handleDropPieceSelect : undefined)
                }
                boardFlipped={boardFlipped}
                isTopPanel={false}
            />

            {/* Board Controls Row */}
            <div className="flex items-center justify-between w-full max-w-[700px]">
                {/* Board Control Buttons Panel - Left Aligned */}
                {showBoardOptionsPanel && (
                    <div className="bg-background-secondary border border-border rounded-lg px-1 py-1 flex items-center gap-2">
                        {/* Japanese Coordinates Toggle */}
                        <button
                            onClick={() => setUseJapaneseCoords(!useJapaneseCoords)}
                            className="w-10 h-10 flex items-center justify-center group transition-colors relative"
                            title="Toggle Japanese coordinates"
                        >
                            {useJapaneseCoords ? (
                                <>
                                    <Languages className="w-6 h-6 transition-opacity group-hover:opacity-0 sound-active" />
                                    <Languages className="w-6 h-6 text-red-500 transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            ) : (
                                <>
                                    <Languages className="w-6 h-6 text-text-secondary transition-opacity group-hover:opacity-0" />
                                    <Languages className="w-6 h-6 text-accent-cyan transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            )}
                        </button>

                        {/* Flip Board Toggle */}
                        <button
                            onClick={() => setBoardFlipped(!boardFlipped)}
                            className="w-10 h-10 flex items-center justify-center group transition-colors relative"
                            title="Flip board orientation"
                        >
                            {boardFlipped ? (
                                <>
                                    <FlipVertical className="w-6 h-6 transition-opacity group-hover:opacity-0 sound-active" />
                                    <FlipVertical className="w-6 h-6 text-red-500 transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            ) : (
                                <>
                                    <FlipVertical className="w-6 h-6 text-text-secondary transition-opacity group-hover:opacity-0" />
                                    <FlipVertical className="w-6 h-6 text-accent-cyan transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            )}
                        </button>

                        {/* Western Notation Toggle */}
                        <button
                            onClick={() => setUseWesternNotation(!useWesternNotation)}
                            className="w-10 h-10 flex items-center justify-center group transition-colors relative"
                            title="Toggle Western piece notation"
                        >
                            {useWesternNotation ? (
                                <>
                                    <Type className="w-6 h-6 transition-opacity group-hover:opacity-0 sound-active" />
                                    <Type className="w-6 h-6 text-red-500 transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            ) : (
                                <>
                                    <Type className="w-6 h-6 text-text-secondary transition-opacity group-hover:opacity-0" />
                                    <Type className="w-6 h-6 text-accent-cyan transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            )}
                        </button>

                        {/* Highlight Last Move Toggle */}
                        <button
                            onClick={() => setHighlightLastMove(!highlightLastMove)}
                            className="w-10 h-10 flex items-center justify-center group transition-colors relative"
                            title="Highlight last move"
                        >
                            {highlightLastMove ? (
                                <>
                                    <Zap className="w-6 h-6 transition-opacity group-hover:opacity-0 sound-active" />
                                    <Zap className="w-6 h-6 text-red-500 transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            ) : (
                                <>
                                    <Zap className="w-6 h-6 text-text-secondary transition-opacity group-hover:opacity-0" />
                                    <Zap className="w-6 h-6 text-accent-cyan transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            )}
                        </button>

                        {/* Movement Overlay Toggle */}
                        <button
                            onClick={() => setShowMovementOverlay(!showMovementOverlay)}
                            className="w-10 h-10 flex items-center justify-center group transition-colors relative"
                            title="Show movement overlay"
                        >
                            {showMovementOverlay ? (
                                <>
                                    <Compass className="w-6 h-6 transition-opacity group-hover:opacity-0 sound-active" />
                                    <Compass className="w-6 h-6 text-red-500 transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            ) : (
                                <>
                                    <Compass className="w-6 h-6 text-text-secondary transition-opacity group-hover:opacity-0" />
                                    <Compass className="w-6 h-6 text-accent-cyan transition-opacity opacity-0 group-hover:opacity-100 absolute" />
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Best Move Button - Right Aligned */}
                {showBestMove && onBestMove && (
                    <button
                        onClick={onBestMove}
                        disabled={isLoading || isGameOver || !currentPlayerHasEngine}
                        className="flex items-center gap-3 px-6 py-3 rounded-lg font-bold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-accent-cyan text-background-primary"
                    >
                        <div 
                            className="shogi-piece-indicator"
                            style={{
                                background: gameState.turn === 'b' ? '#000' : '#fff',
                                transform: gameState.turn === 'w' ? 'rotate(180deg)' : 'none',
                            }}
                        />
                        <span className="font-pixel">Best Move</span>
                    </button>
                )}
            </div>

            {selectedDropPiece && (
                <div className="text-sm text-purple-600 font-semibold">
                    Selected piece to drop: {PIECE_SYMBOLS[selectedDropPiece]} - Click a highlighted square
                </div>
            )}

            {/* Promotion Dialog */}
            {showPromotionDialog && pendingMove && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-background-secondary border-2 border-border rounded-lg p-6 shadow-xl">
                        <h3 className="text-xl font-bold text-text-primary mb-4 font-pixel">
                            Promote {PIECE_SYMBOLS[pendingMove.piece]}?
                        </h3>
                        <div className="flex gap-4">
                            <button
                                onClick={() => handlePromote(true)}
                                className="px-6 py-3 bg-accent-cyan text-background-primary rounded-lg hover:bg-[#0fc9ad] transition-colors font-pixel font-bold"
                            >
                                Yes, Promote
                            </button>
                            <button
                                onClick={() => handlePromote(false)}
                                className="px-6 py-3 bg-background-primary border border-border text-text-primary rounded-lg hover:bg-background-secondary transition-colors font-pixel"
                            >
                                No, Keep
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
