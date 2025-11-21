'use client';

import { useState, useMemo } from 'react';
import { GameState } from '@/types/game';
import CapturedPieces from './CapturedPieces';

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
}

const PIECE_SYMBOLS: { [key: string]: string } = {
    // White pieces (lowercase in SFEN)
    'p': '歩', 'l': '香', 'n': '桂', 's': '銀', 'g': '金', 'b': '角', 'r': '飛', 'k': '玉',
    '+p': 'と', '+l': '杏', '+n': '圭', '+s': '全', '+b': '馬', '+r': '龍',
    // Black pieces (uppercase in SFEN)
    'P': '歩', 'L': '香', 'N': '桂', 'S': '銀', 'G': '金', 'B': '角', 'R': '飛', 'K': '王',
    '+P': 'と', '+L': '杏', '+N': '圭', '+S': '全', '+B': '馬', '+R': '龍',
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

export default function ShogiBoard({ gameState, onMove, showBestMove = false, onBestMove, isLoading = false, showCheckNotification = true, engineConfig }: ShogiBoardProps) {
    const board = useMemo(() => parseSfen(gameState.sfen), [gameState.sfen]);
    const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
    const [selectedDropPiece, setSelectedDropPiece] = useState<string | null>(null);
    
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
            {/* White's captured pieces (top) */}
            <CapturedPieces
                pieces={gameState.pieces_in_hand.w}
                color="w"
                onPieceDrop={gameState.turn === 'w' ? handleDropPieceSelect : undefined}
            />

            {/* Reserved space for check notification (top - White's side) */}
            <div className="h-6 flex items-center justify-center">
                {showCheckNotification && gameState.turn === 'w' && (
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

            <div className="inline-block">
                {/* Column numbers (9 to 1) */}
                <div className="flex" style={{ marginLeft: '44px' }}>
                    {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(num => (
                        <div key={num} className="w-12 h-8 flex items-center justify-center text-sm font-semibold text-text-primary font-pixel drop-shadow-lg">
                            {num}
                        </div>
                    ))}
                </div>

                {/* Board with row letters */}
                <div className="flex">
                    {/* Row letters (a to i) */}
                    <div className="flex flex-col justify-center">
                        {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(letter => (
                            <div key={letter} className="w-8 h-12 flex items-center justify-center text-sm font-semibold text-text-primary font-pixel drop-shadow-lg">
                                {letter}
                            </div>
                        ))}
                    </div>

                    {/* The actual board */}
                    <div className="border-4 border-gray-700 bg-amber-100 p-2">
                        {board.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex">
                                {row.map((piece, colIndex) => {
                                    // In this SFEN: uppercase = Black (bottom), lowercase = White (top)
                                    // Black pieces should be right-side up, White pieces should be upside down
                                    const isWhitePiece = piece && piece.toLowerCase() === piece && piece !== '+';
                                    const pieceSymbol = piece ? PIECE_SYMBOLS[piece] || piece : '';

                                    const isPromoted = piece && piece.startsWith('+');
                                    
                                    return (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            onClick={() => handleSquareClick(rowIndex, colIndex)}
                                            className={`
                        w-12 h-12 border border-gray-700 flex items-center justify-center
                        cursor-pointer hover:bg-amber-200 transition-colors
                        ${isSelected(rowIndex, colIndex) ? 'bg-blue-300' : ''}
                        ${isLegalMove(rowIndex, colIndex) ? 'bg-green-200' : ''}
                        ${selectedDropPiece && isLegalMove(rowIndex, colIndex) ? 'bg-purple-200' : ''}
                      `}
                                        >
                                            {piece && (
                                                <div className={`shogi-piece ${isWhitePiece ? 'rotate-180' : ''}`}>
                                                    <span className={`shogi-piece-text text-3xl font-bold select-none font-shogi ${isPromoted ? 'text-red-600' : 'text-black'}`}>
                                                        {pieceSymbol}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Reserved space for check notification (bottom - Black's side) */}
            <div className="h-6 flex items-center justify-center">
                {showCheckNotification && gameState.turn === 'b' && (
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

            {/* Black's captured pieces (bottom) */}
            <CapturedPieces
                pieces={gameState.pieces_in_hand.b}
                color="b"
                onPieceDrop={gameState.turn === 'b' ? handleDropPieceSelect : undefined}
            />

            {/* Best Move Button (centered below black's captured pieces) */}
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
