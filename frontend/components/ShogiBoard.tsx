'use client';

import { useState, useEffect } from 'react';
import { GameState } from '@/types/game';

interface Position {
    row: number;
    col: number;
}

interface ShogiBoardProps {
    gameState: GameState;
    onMove: (move: string) => void;
}

const PIECE_SYMBOLS: { [key: string]: string } = {
    // Black pieces (lowercase in SFEN)
    'p': '歩', 'l': '香', 'n': '桂', 's': '銀', 'g': '金', 'b': '角', 'r': '飛', 'k': '玉',
    '+p': 'と', '+l': '杏', '+n': '圭', '+s': '全', '+b': '馬', '+r': '龍',
    // White pieces (uppercase in SFEN)
    'P': '歩', 'L': '香', 'N': '桂', 'S': '銀', 'G': '金', 'B': '角', 'R': '飛', 'K': '玉',
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

function positionToUsi(from: Position, to: Position): string {
    const fromCol = 9 - from.col;
    const fromRow = String.fromCharCode('a'.charCodeAt(0) + from.row);
    const toCol = 9 - to.col;
    const toRow = String.fromCharCode('a'.charCodeAt(0) + to.row);

    return `${fromCol}${fromRow}${toCol}${toRow}`;
}

export default function ShogiBoard({ gameState, onMove }: ShogiBoardProps) {
    const [board, setBoard] = useState<(string | null)[][]>([]);
    const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
    const [legalMoves, setLegalMoves] = useState<Position[]>([]);

    useEffect(() => {
        const parsedBoard = parseSfen(gameState.sfen);
        setBoard(parsedBoard);
    }, [gameState.sfen]);

    const handleSquareClick = (row: number, col: number) => {
        if (!selectedSquare) {
            // Select a piece
            if (board[row]?.[col]) {
                setSelectedSquare({ row, col });

                // Calculate legal moves for this piece
                const moves: Position[] = [];
                gameState.legal_moves.forEach(usi => {
                    const positions = usiToPosition(usi);
                    if (positions && positions.from.row === row && positions.from.col === col) {
                        moves.push(positions.to);
                    }
                });
                setLegalMoves(moves);
            }
        } else {
            // Try to move
            const isLegalMove = legalMoves.some(m => m.row === row && m.col === col);

            if (isLegalMove) {
                const usiMove = positionToUsi(selectedSquare, { row, col });
                onMove(usiMove);
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

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="inline-block border-4 border-amber-900 bg-amber-100 p-2">
                {board.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex">
                        {row.map((piece, colIndex) => {
                            const isWhitePiece = piece && piece.toUpperCase() === piece && piece !== '+';
                            const pieceSymbol = piece ? PIECE_SYMBOLS[piece] || piece : '';

                            return (
                                <div
                                    key={`${rowIndex}-${colIndex}`}
                                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                                    className={`
                    w-12 h-12 border border-amber-700 flex items-center justify-center
                    cursor-pointer hover:bg-amber-200 transition-colors
                    ${isSelected(rowIndex, colIndex) ? 'bg-blue-300' : ''}
                    ${isLegalMove(rowIndex, colIndex) ? 'bg-green-200' : ''}
                  `}
                                >
                                    {piece && (
                                        <span
                                            className={`text-2xl font-bold select-none ${isWhitePiece ? 'rotate-180' : ''
                                                }`}
                                        >
                                            {pieceSymbol}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="text-sm text-gray-600">
                Turn: {gameState.turn === 'b' ? 'Black (先手)' : 'White (後手)'}
                {gameState.in_check && <span className="ml-2 text-red-600 font-bold">CHECK!</span>}
                {gameState.is_game_over && (
                    <span className="ml-2 text-green-600 font-bold">
                        Game Over - Winner: {gameState.winner}
                    </span>
                )}
            </div>
        </div>
    );
}
