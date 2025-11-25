export interface Position {
    row: number;
    col: number;
}

export interface GameState {
    sfen: string;
    turn: string;
    legal_moves: string[];
    in_check: boolean;
    is_game_over: boolean;
    winner: string | null;
    pieces_in_hand: {
        b: { [piece: string]: number };
        w: { [piece: string]: number };
    };
    last_move_notation?: string | null;
}

export interface Analysis {
    bestmove: string;
    score_cp: number;
    mate: number | null;
    info: string;
}

export interface Move {
    from: Position;
    to: Position;
    usi: string;
}

// Game modes
export type GameMode = 'human_vs_human' | 'human_vs_computer' | 'computer_vs_computer' | 'casual';

export interface GameModeConfig {
    mode: GameMode;
    humanPlaysAs?: 'black' | 'white';  // For human_vs_computer
    blackEngine?: string;
    whiteEngine?: string;
    blackName?: string;
    whiteName?: string;
}

// Import/Export
export type GameFormat = 'kif' | 'csa' | 'ki2' | 'psn';

export interface GameImportResult {
    success: boolean;
    sessionId?: string;
    message: string;
    moveCount: number;
    detectedFormat?: GameFormat;
}

export interface GameExportResult {
    success: boolean;
    content: string;
    filename: string;
    format: GameFormat;
    message: string;
}

// Computer move
export interface ComputerMoveResult {
    success: boolean;
    moveUsi?: string;
    moveAlgebraic?: string;
    newSfen?: string;
    isGameOver: boolean;
    winner?: string | null;
    engineName?: string;
    thinkingTime: number;
    message: string;
}
