'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, RotateCw, Check, Loader2, AlertCircle, Camera } from 'lucide-react';

interface ImageToBoardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (sfen: string) => void;
    hasLLMConfigured: boolean;
}

interface AnalysisResult {
    sfen: string;
    confidence: string;
    notes?: string;
}

// Standard piece counts in shogi
const STANDARD_PIECE_COUNTS: Record<string, number> = {
    'K': 1, 'k': 1,
    'R': 1, 'r': 1,
    'B': 1, 'b': 1,
    'G': 2, 'g': 2,
    'S': 2, 's': 2,
    'N': 2, 'n': 2,
    'L': 2, 'l': 2,
    'P': 9, 'p': 9,
};

// Piece display names - Black/Sente uses 玉 (challenger), White/Gote uses 王 (higher ranked)
const PIECE_NAMES: Record<string, string> = {
    'K': '玉', 'k': '王',
    'R': '飛', 'r': '飛', '+R': '龍', '+r': '龍',
    'B': '角', 'b': '角', '+B': '馬', '+b': '馬',
    'G': '金', 'g': '金',
    'S': '銀', 's': '銀', '+S': '成銀', '+s': '成銀',
    'N': '桂', 'n': '桂', '+N': '成桂', '+n': '成桂',
    'L': '香', 'l': '香', '+L': '成香', '+l': '成香',
    'P': '歩', 'p': '歩', '+P': 'と', '+p': 'と',
};

type BoardState = (string | null)[][];
type HandPieces = Record<string, number>;

export default function ImageToBoardModal({
    isOpen,
    onClose,
    onConfirm,
    hasLLMConfigured,
}: ImageToBoardModalProps) {
    const [, setImageFile] = useState<File | null>(null);
    const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
    const [rotation, setRotation] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'upload' | 'adjust' | 'preview'>('upload');
    const [selectedTurn, setSelectedTurn] = useState<'b' | 'w'>('b');
    
    // Interactive board state
    const [boardState, setBoardState] = useState<BoardState>(() => 
        Array(9).fill(null).map(() => Array(9).fill(null))
    );
    const [blackHand, setBlackHand] = useState<HandPieces>({});
    const [whiteHand, setWhiteHand] = useState<HandPieces>({});
    const [removedPieces, setRemovedPieces] = useState<HandPieces>({});
    const [draggedPiece, setDraggedPiece] = useState<{
        piece: string;
        source: 'board' | 'blackHand' | 'whiteHand' | 'removed';
        row?: number;
        col?: number;
    } | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setImageFile(null);
            setImageDataUrl(null);
            setRotation(0);
            setAnalysisResult(null);
            setError(null);
            setStep('upload');
            setIsAnalyzing(false);
            setSelectedTurn('b');
            setBoardState(Array(9).fill(null).map(() => Array(9).fill(null)));
            setBlackHand({});
            setWhiteHand({});
            setRemovedPieces({});
            setDraggedPiece(null);
        }
    }, [isOpen]);

    // Parse SFEN into board state, hands, and validate piece counts
    const parseSfenToState = useCallback((sfen: string) => {
        const parts = sfen.split(' ');
        const boardPart = parts[0];
        const handPart = parts[2] || '-';
        
        // Parse board
        const newBoard: BoardState = Array(9).fill(null).map(() => Array(9).fill(null));
        const rows = boardPart.split('/');
        
        for (let rowIdx = 0; rowIdx < rows.length && rowIdx < 9; rowIdx++) {
            let colIdx = 0;
            let i = 0;
            const row = rows[rowIdx];
            
            while (i < row.length && colIdx < 9) {
                const char = row[i];
                if (char >= '1' && char <= '9') {
                    colIdx += parseInt(char);
                } else if (char === '+') {
                    // Promoted piece
                    i++;
                    if (i < row.length) {
                        newBoard[rowIdx][colIdx] = '+' + row[i];
                        colIdx++;
                    }
                } else {
                    newBoard[rowIdx][colIdx] = char;
                    colIdx++;
                }
                i++;
            }
        }
        
        // Parse hands
        const newBlackHand: HandPieces = {};
        const newWhiteHand: HandPieces = {};
        
        if (handPart !== '-') {
            let count = 0;
            for (const char of handPart) {
                if (char >= '0' && char <= '9') {
                    count = count * 10 + parseInt(char);
                } else {
                    const pieceCount = count || 1;
                    if (char === char.toUpperCase()) {
                        newBlackHand[char] = (newBlackHand[char] || 0) + pieceCount;
                    } else {
                        newWhiteHand[char] = (newWhiteHand[char] || 0) + pieceCount;
                    }
                    count = 0;
                }
            }
        }
        
        // Count pieces and find missing ones
        const pieceCounts: Record<string, number> = {};
        
        // Count board pieces
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = newBoard[r][c];
                if (piece) {
                    // Get base piece (remove promotion)
                    const basePiece = piece.startsWith('+') ? piece[1] : piece;
                    pieceCounts[basePiece] = (pieceCounts[basePiece] || 0) + 1;
                }
            }
        }
        
        // Count hand pieces
        for (const [piece, count] of Object.entries(newBlackHand)) {
            pieceCounts[piece] = (pieceCounts[piece] || 0) + count;
        }
        for (const [piece, count] of Object.entries(newWhiteHand)) {
            pieceCounts[piece] = (pieceCounts[piece] || 0) + count;
        }
        
        // Find missing pieces and add to removed (handicap) area
        const newRemoved: HandPieces = {};
        for (const [piece, standardCount] of Object.entries(STANDARD_PIECE_COUNTS)) {
            const currentCount = pieceCounts[piece] || 0;
            if (currentCount < standardCount) {
                newRemoved[piece] = standardCount - currentCount;
            }
        }
        
        setBoardState(newBoard);
        setBlackHand(newBlackHand);
        setWhiteHand(newWhiteHand);
        setRemovedPieces(newRemoved);
        setSelectedTurn(parts[1] === 'w' ? 'w' : 'b');
    }, []);

    // Generate SFEN from current state
    const generateSfen = useCallback((): string => {
        // Generate board part
        const boardRows: string[] = [];
        for (let r = 0; r < 9; r++) {
            let rowStr = '';
            let emptyCount = 0;
            
            for (let c = 0; c < 9; c++) {
                const piece = boardState[r][c];
                if (piece) {
                    if (emptyCount > 0) {
                        rowStr += emptyCount;
                        emptyCount = 0;
                    }
                    rowStr += piece;
                } else {
                    emptyCount++;
                }
            }
            
            if (emptyCount > 0) {
                rowStr += emptyCount;
            }
            boardRows.push(rowStr || '9');
        }
        
        // Generate hand part
        let handStr = '';
        
        // Black's hand (uppercase) - order: R B G S N L P
        const pieceOrder = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
        for (const piece of pieceOrder) {
            const count = blackHand[piece] || 0;
            if (count > 0) {
                handStr += count > 1 ? `${count}${piece}` : piece;
            }
        }
        
        // White's hand (lowercase)
        for (const piece of pieceOrder) {
            const lowerPiece = piece.toLowerCase();
            const count = whiteHand[lowerPiece] || 0;
            if (count > 0) {
                handStr += count > 1 ? `${count}${lowerPiece}` : lowerPiece;
            }
        }
        
        if (!handStr) handStr = '-';
        
        return `${boardRows.join('/')} ${selectedTurn} ${handStr} 1`;
    }, [boardState, blackHand, whiteHand, selectedTurn]);

    // Validate piece counts
    const validatePieceCounts = useCallback((): { valid: boolean; issues: string[] } => {
        const pieceCounts: Record<string, number> = {};
        const issues: string[] = [];
        
        // Count all pieces
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = boardState[r][c];
                if (piece) {
                    const basePiece = piece.startsWith('+') ? piece[1] : piece;
                    pieceCounts[basePiece] = (pieceCounts[basePiece] || 0) + 1;
                }
            }
        }
        
        for (const [piece, count] of Object.entries(blackHand)) {
            pieceCounts[piece] = (pieceCounts[piece] || 0) + count;
        }
        for (const [piece, count] of Object.entries(whiteHand)) {
            pieceCounts[piece] = (pieceCounts[piece] || 0) + count;
        }
        for (const [piece, count] of Object.entries(removedPieces)) {
            pieceCounts[piece] = (pieceCounts[piece] || 0) + count;
        }
        
        // Check counts
        for (const [piece, standardCount] of Object.entries(STANDARD_PIECE_COUNTS)) {
            const currentCount = pieceCounts[piece] || 0;
            if (currentCount !== standardCount) {
                const pieceName = PIECE_NAMES[piece] || piece;
                if (currentCount < standardCount) {
                    issues.push(`Missing ${standardCount - currentCount} ${piece.toUpperCase()} (${pieceName})`);
                } else {
                    issues.push(`Extra ${currentCount - standardCount} ${piece.toUpperCase()} (${pieceName})`);
                }
            }
        }
        
        return { valid: issues.length === 0, issues };
    }, [boardState, blackHand, whiteHand, removedPieces]);

    // Drag and drop handlers
    const handleDragStart = (piece: string, source: 'board' | 'blackHand' | 'whiteHand' | 'removed', row?: number, col?: number) => {
        setDraggedPiece({ piece, source, row, col });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDropOnBoard = (targetRow: number, targetCol: number) => {
        if (!draggedPiece) return;
        
        const { piece, source, row: srcRow, col: srcCol } = draggedPiece;
        
        // Remove from source
        if (source === 'board' && srcRow !== undefined && srcCol !== undefined) {
            setBoardState(prev => {
                const newBoard = prev.map(r => [...r]);
                newBoard[srcRow][srcCol] = null;
                return newBoard;
            });
        } else if (source === 'blackHand') {
            setBlackHand(prev => {
                const newHand = { ...prev };
                if (newHand[piece] > 1) {
                    newHand[piece]--;
                } else {
                    delete newHand[piece];
                }
                return newHand;
            });
        } else if (source === 'whiteHand') {
            setWhiteHand(prev => {
                const newHand = { ...prev };
                if (newHand[piece] > 1) {
                    newHand[piece]--;
                } else {
                    delete newHand[piece];
                }
                return newHand;
            });
        } else if (source === 'removed') {
            setRemovedPieces(prev => {
                const newRemoved = { ...prev };
                if (newRemoved[piece] > 1) {
                    newRemoved[piece]--;
                } else {
                    delete newRemoved[piece];
                }
                return newRemoved;
            });
        }
        
        // Check if target has a piece - if so, move it to appropriate hand
        const existingPiece = boardState[targetRow][targetCol];
        if (existingPiece) {
            const basePiece = existingPiece.startsWith('+') ? existingPiece[1] : existingPiece;
            if (basePiece === basePiece.toUpperCase()) {
                setBlackHand(prev => ({ ...prev, [basePiece]: (prev[basePiece] || 0) + 1 }));
            } else {
                setWhiteHand(prev => ({ ...prev, [basePiece]: (prev[basePiece] || 0) + 1 }));
            }
        }
        
        // Add to board
        setBoardState(prev => {
            const newBoard = prev.map(r => [...r]);
            newBoard[targetRow][targetCol] = piece;
            return newBoard;
        });
        
        setDraggedPiece(null);
    };

    const handleDropOnHand = (hand: 'blackHand' | 'whiteHand') => {
        if (!draggedPiece) return;
        
        const { piece, source, row: srcRow, col: srcCol } = draggedPiece;
        
        // Get base piece (unpromoted)
        const basePiece = piece.startsWith('+') ? piece[1] : piece;
        // Convert to correct case for the hand
        const handPiece = hand === 'blackHand' ? basePiece.toUpperCase() : basePiece.toLowerCase();
        
        // Remove from source
        if (source === 'board' && srcRow !== undefined && srcCol !== undefined) {
            setBoardState(prev => {
                const newBoard = prev.map(r => [...r]);
                newBoard[srcRow][srcCol] = null;
                return newBoard;
            });
        } else if (source === 'blackHand' && hand !== 'blackHand') {
            setBlackHand(prev => {
                const newHand = { ...prev };
                if (newHand[piece] > 1) {
                    newHand[piece]--;
                } else {
                    delete newHand[piece];
                }
                return newHand;
            });
        } else if (source === 'whiteHand' && hand !== 'whiteHand') {
            setWhiteHand(prev => {
                const newHand = { ...prev };
                if (newHand[piece] > 1) {
                    newHand[piece]--;
                } else {
                    delete newHand[piece];
                }
                return newHand;
            });
        } else if (source === 'removed') {
            setRemovedPieces(prev => {
                const newRemoved = { ...prev };
                if (newRemoved[piece] > 1) {
                    newRemoved[piece]--;
                } else {
                    delete newRemoved[piece];
                }
                return newRemoved;
            });
        } else {
            // Same hand, do nothing
            setDraggedPiece(null);
            return;
        }
        
        // Add to hand
        if (hand === 'blackHand') {
            setBlackHand(prev => ({ ...prev, [handPiece]: (prev[handPiece] || 0) + 1 }));
        } else {
            setWhiteHand(prev => ({ ...prev, [handPiece]: (prev[handPiece] || 0) + 1 }));
        }
        
        setDraggedPiece(null);
    };

    const handleDropOnRemoved = () => {
        if (!draggedPiece) return;
        
        const { piece, source, row: srcRow, col: srcCol } = draggedPiece;
        
        // Get base piece (unpromoted, keep original case)
        const basePiece = piece.startsWith('+') ? piece[1] : piece;
        
        // Remove from source
        if (source === 'board' && srcRow !== undefined && srcCol !== undefined) {
            setBoardState(prev => {
                const newBoard = prev.map(r => [...r]);
                newBoard[srcRow][srcCol] = null;
                return newBoard;
            });
        } else if (source === 'blackHand') {
            setBlackHand(prev => {
                const newHand = { ...prev };
                if (newHand[piece] > 1) {
                    newHand[piece]--;
                } else {
                    delete newHand[piece];
                }
                return newHand;
            });
        } else if (source === 'whiteHand') {
            setWhiteHand(prev => {
                const newHand = { ...prev };
                if (newHand[piece] > 1) {
                    newHand[piece]--;
                } else {
                    delete newHand[piece];
                }
                return newHand;
            });
        } else {
            // Already in removed
            setDraggedPiece(null);
            return;
        }
        
        // Add to removed
        setRemovedPieces(prev => ({ ...prev, [basePiece]: (prev[basePiece] || 0) + 1 }));
        
        setDraggedPiece(null);
    };

    // Set turn when analysis completes
    useEffect(() => {
        if (analysisResult?.sfen) {
            parseSfenToState(analysisResult.sfen);
        }
    }, [analysisResult, parseSfenToState]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setError('Please select an image file');
                return;
            }
            
            setImageFile(file);
            setError(null);
            
            const reader = new FileReader();
            reader.onload = (event) => {
                setImageDataUrl(event.target?.result as string);
                setStep('adjust');
            };
            reader.readAsDataURL(file);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            setError(null);
            
            const reader = new FileReader();
            reader.onload = (event) => {
                setImageDataUrl(event.target?.result as string);
                setStep('adjust');
            };
            reader.readAsDataURL(file);
        }
    }, []);

    const handleRotate = () => {
        setRotation((prev) => (prev + 90) % 360);
    };

    const getProcessedImage = useCallback(async (): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!imageDataUrl) {
                reject(new Error('No image loaded'));
                return;
            }

            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) {
                    reject(new Error('Canvas not available'));
                    return;
                }

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }

                // Set canvas size based on rotation
                const isRotated = rotation === 90 || rotation === 270;
                canvas.width = isRotated ? img.height : img.width;
                canvas.height = isRotated ? img.width : img.height;

                // Clear and rotate
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                ctx.restore();

                // Get as base64
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageDataUrl;
        });
    }, [imageDataUrl, rotation]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError(null);

        try {
            const processedImage = await getProcessedImage();
            
            // Call the backend API
            const response = await fetch('http://127.0.0.1:8000/game/analyze-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: processedImage,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to analyze image');
            }

            const result = await response.json();
            
            if (!result.sfen) {
                throw new Error('No valid position detected in the image');
            }

            setAnalysisResult(result);
            setStep('preview');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to analyze image');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleConfirm = () => {
        // Generate SFEN from current edited state
        const finalSfen = generateSfen();
        onConfirm(finalSfen);
        onClose();
    };

    // Render a piece cell for the interactive board
    const renderPieceCell = (piece: string | null, row: number, col: number) => {
        const isBlack = piece && piece.replace('+', '') === piece.replace('+', '').toUpperCase();
        const displayChar = piece ? (PIECE_NAMES[piece] || piece.replace('+', '')) : '';
        const isPromoted = piece?.startsWith('+');
        
        return (
            <div
                key={`${row}-${col}`}
                className={`w-7 h-7 flex items-center justify-center border border-border/50 cursor-pointer
                    ${piece ? 'hover:bg-accent-purple/20' : 'hover:bg-background-secondary'}
                    ${isBlack ? 'text-text-primary' : 'text-accent-cyan'}
                    ${isPromoted ? 'bg-red-500/10' : 'bg-background-primary'}
                `}
                draggable={!!piece}
                onDragStart={() => piece && handleDragStart(piece, 'board', row, col)}
                onDragOver={handleDragOver}
                onDrop={() => handleDropOnBoard(row, col)}
                title={piece ? `${piece} (${displayChar})` : `${9-col}${String.fromCharCode(97+row)}`}
            >
                <span className={`text-xs font-bold ${isPromoted ? 'text-red-400' : ''}`}>
                    {displayChar}
                </span>
            </div>
        );
    };

    // Render hand pieces
    const renderHandPieces = (hand: HandPieces, handType: 'blackHand' | 'whiteHand') => {
        const pieces = Object.entries(hand);
        if (pieces.length === 0) {
            return <span className="text-text-secondary/50 text-xs">Empty</span>;
        }
        return pieces.map(([piece, count]) => (
            <div
                key={piece}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer
                    ${handType === 'blackHand' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}
                    hover:ring-2 hover:ring-accent-purple
                `}
                draggable
                onDragStart={() => handleDragStart(piece, handType)}
                title={`${piece} x${count}`}
            >
                <span className="text-sm font-bold">{PIECE_NAMES[piece] || piece}</span>
                {count > 1 && <span className="text-xs">×{count}</span>}
            </div>
        ));
    };

    // Render removed/handicap pieces
    const renderRemovedPieces = () => {
        const pieces = Object.entries(removedPieces);
        if (pieces.length === 0) {
            return <span className="text-text-secondary/50 text-xs">None</span>;
        }
        return pieces.map(([piece, count]) => (
            <div
                key={piece}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-400 cursor-pointer hover:ring-2 hover:ring-red-500"
                draggable
                onDragStart={() => handleDragStart(piece, 'removed')}
                title={`${piece} x${count} (removed)`}
            >
                <span className="text-sm font-bold">{PIECE_NAMES[piece] || piece}</span>
                {count > 1 && <span className="text-xs">×{count}</span>}
            </div>
        ));
    };

    const validation = validatePieceCounts();

    const handleBack = () => {
        if (step === 'preview') {
            setStep('adjust');
            setAnalysisResult(null);
        } else if (step === 'adjust') {
            setStep('upload');
            setImageFile(null);
            setImageDataUrl(null);
            setRotation(0);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                        <Camera className="w-5 h-5" />
                        Game From Image
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-background-primary rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Hidden canvas for image processing */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <p className="text-text-secondary text-sm">
                                Upload a photo or screenshot of a shogi board position. 
                                The AI will analyze it and recreate the position.
                            </p>

                            {!hasLLMConfigured && (
                                <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="text-yellow-500 font-medium">LLM Not Configured</p>
                                        <p className="text-text-secondary mt-1">
                                            Please configure an LLM API key in Settings → LLM Settings and Resources to use this feature.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div
                                onClick={() => hasLLMConfigured && fileInputRef.current?.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={hasLLMConfigured ? handleDrop : undefined}
                                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                                    hasLLMConfigured 
                                        ? 'border-border cursor-pointer hover:border-accent-purple' 
                                        : 'border-border/50 cursor-not-allowed opacity-50'
                                }`}
                            >
                                <Upload className="w-12 h-12 mx-auto mb-4 text-text-secondary" />
                                <p className="text-text-primary font-medium">
                                    Click to upload or drag and drop
                                </p>
                                <p className="text-text-secondary text-sm mt-1">
                                    PNG, JPG, or other image formats
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    disabled={!hasLLMConfigured}
                                />
                            </div>

                            <div className="text-xs text-text-secondary space-y-1">
                                <p><strong>Tips for best results:</strong></p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>Use a clear, well-lit image of the board</li>
                                    <li>Make sure all pieces are visible</li>
                                    <li>Include any pieces in hand (komadai) if present</li>
                                    <li>You can rotate the image in the next step to ensure White is at the top</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Adjust (rotate) */}
                    {step === 'adjust' && imageDataUrl && (
                        <div className="space-y-4">
                            <p className="text-text-secondary text-sm">
                                Rotate the image if needed so that <strong>White (Gote) is at the top</strong> of the board.
                            </p>

                            <div className="relative bg-background-primary rounded-lg p-4 flex items-center justify-center min-h-[300px]">
                                <img
                                    src={imageDataUrl}
                                    alt="Uploaded board"
                                    className="max-h-[400px] max-w-full object-contain"
                                    style={{ transform: `rotate(${rotation}deg)` }}
                                />
                            </div>

                            <div className="flex justify-center gap-4">
                                <button
                                    onClick={handleRotate}
                                    className="flex items-center gap-2 px-4 py-2 bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-purple transition-colors"
                                >
                                    <RotateCw className="w-4 h-4" />
                                    Rotate 90°
                                </button>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                    <p className="text-red-500 text-sm">{error}</p>
                                </div>
                            )}

                            <div className="flex justify-between gap-3">
                                <button
                                    onClick={handleBack}
                                    className="px-4 py-2 bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing}
                                    className="flex items-center gap-2 px-6 py-2 bg-accent-purple text-white rounded-lg font-medium hover:bg-[#8a6fd1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            Analyze Board
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Preview */}
                    {step === 'preview' && analysisResult && (
                        <div className="space-y-4">
                            <p className="text-text-secondary text-sm">
                                Drag pieces to correct positions. Pieces not on the board go to hands or handicap area.
                            </p>

                            {/* Validation warnings */}
                            {!validation.valid && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                    <p className="text-yellow-500 text-xs font-medium mb-1">Piece Count Issues:</p>
                                    <ul className="text-yellow-500/80 text-xs space-y-0.5">
                                        {validation.issues.map((issue, i) => (
                                            <li key={i}>• {issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* White's Hand */}
                            <div 
                                className="p-3 bg-background-primary rounded-lg border-2 border-dashed border-transparent hover:border-accent-cyan/50"
                                onDragOver={handleDragOver}
                                onDrop={() => handleDropOnHand('whiteHand')}
                            >
                                <p className="text-xs text-accent-cyan mb-2">☖ White&apos;s Hand (Gote):</p>
                                <div className="flex flex-wrap gap-1 min-h-[28px]">
                                    {renderHandPieces(whiteHand, 'whiteHand')}
                                </div>
                            </div>

                            {/* Interactive Board */}
                            <div className="p-4 bg-background-primary rounded-lg">
                                <div className="flex flex-col items-center">
                                    {/* Column headers */}
                                    <div className="flex mb-1">
                                        <div className="w-4" />
                                        {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => (
                                            <div key={n} className="w-7 text-center text-xs text-text-secondary">{n}</div>
                                        ))}
                                    </div>
                                    {/* Board rows */}
                                    {boardState.map((row, rowIdx) => (
                                        <div key={rowIdx} className="flex items-center">
                                            <span className="text-text-secondary text-xs w-4">{String.fromCharCode(97 + rowIdx)}</span>
                                            <div className="flex">
                                                {row.map((cell, colIdx) => renderPieceCell(cell, rowIdx, colIdx))}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="text-xs text-text-secondary mt-2">
                                        <span className="text-text-primary font-bold">Black (☗)</span> | 
                                        <span className="text-accent-cyan ml-1">White (☖)</span> |
                                        <span className="text-red-400 ml-1">Promoted</span>
                                    </div>
                                </div>
                            </div>

                            {/* Black's Hand */}
                            <div 
                                className="p-3 bg-background-primary rounded-lg border-2 border-dashed border-transparent hover:border-text-primary/50"
                                onDragOver={handleDragOver}
                                onDrop={() => handleDropOnHand('blackHand')}
                            >
                                <p className="text-xs text-text-primary mb-2">☗ Black&apos;s Hand (Sente):</p>
                                <div className="flex flex-wrap gap-1 min-h-[28px]">
                                    {renderHandPieces(blackHand, 'blackHand')}
                                </div>
                            </div>

                            {/* Removed/Handicap Pieces */}
                            <div 
                                className="p-3 bg-red-500/5 rounded-lg border-2 border-dashed border-red-500/30 hover:border-red-500/50"
                                onDragOver={handleDragOver}
                                onDrop={handleDropOnRemoved}
                            >
                                <p className="text-xs text-red-400 mb-2">🚫 Removed (Handicap):</p>
                                <div className="flex flex-wrap gap-1 min-h-[28px]">
                                    {renderRemovedPieces()}
                                </div>
                                <p className="text-xs text-text-secondary/50 mt-1">Drag pieces here to exclude from game</p>
                            </div>

                            {/* Turn Selector */}
                            <div className="p-3 bg-background-primary rounded-lg">
                                <p className="text-xs text-text-secondary mb-2">Whose turn?</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSelectedTurn('b')}
                                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                            selectedTurn === 'b'
                                                ? 'bg-gray-800 text-white'
                                                : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                        }`}
                                    >
                                        ☗ Black
                                    </button>
                                    <button
                                        onClick={() => setSelectedTurn('w')}
                                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                            selectedTurn === 'w'
                                                ? 'bg-gray-200 text-gray-800'
                                                : 'bg-background-secondary text-text-secondary hover:text-text-primary'
                                        }`}
                                    >
                                        ☖ White
                                    </button>
                                </div>
                            </div>

                            {/* Confidence & Notes */}
                            {analysisResult.confidence && (
                                <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                                    analysisResult.confidence === 'high' 
                                        ? 'bg-green-500/10 text-green-500' 
                                        : analysisResult.confidence === 'medium'
                                            ? 'bg-yellow-500/10 text-yellow-500'
                                            : 'bg-red-500/10 text-red-500'
                                }`}>
                                    <AlertCircle className="w-3 h-3" />
                                    {analysisResult.confidence} confidence
                                    {analysisResult.notes && ` - ${analysisResult.notes}`}
                                </div>
                            )}

                            <div className="flex justify-between gap-3">
                                <button
                                    onClick={handleBack}
                                    className="px-4 py-2 bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                                >
                                    ← Try Again
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="flex items-center gap-2 px-6 py-2 bg-accent-green text-black rounded-lg font-medium hover:bg-[#2ed970] transition-colors"
                                >
                                    <Check className="w-4 h-4" />
                                    Use This Position
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
