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
