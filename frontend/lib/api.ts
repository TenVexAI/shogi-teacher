const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function getGameState(sfen?: string) {
    const url = sfen ? `${API_BASE_URL}/game/state?sfen=${encodeURIComponent(sfen)}` : `${API_BASE_URL}/game/state`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch game state');
    }
    return response.json();
}

export async function makeMove(sfen: string, move: string) {
    const response = await fetch(`${API_BASE_URL}/game/move`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sfen, move }),
    });
    if (!response.ok) {
        throw new Error('Failed to make move');
    }
    return response.json();
}

export async function analyzePosition(sfen: string) {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sfen }),
    });
    if (!response.ok) {
        throw new Error('Failed to analyze position');
    }
    return response.json();
}

export async function explainPosition(
    sessionId: string, 
    userQuestion?: string,
    conversationHistory?: Array<{role: string, content: string}>
) {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}/explain`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            user_question: userQuestion,
            conversation_history: conversationHistory || []
        }),
    });
    
    if (!response.ok) {
        throw new Error('Failed to get explanation');
    }
    
    return response.json();
}

export async function getConfig() {
    const response = await fetch(`${API_BASE_URL}/config`);
    if (!response.ok) {
        throw new Error('Failed to get configuration');
    }
    return response.json();
}

export async function updateConfig(apiKey: string) {
    const response = await fetch(`${API_BASE_URL}/config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ claude_api_key: apiKey }),
    });
    if (!response.ok) {
        throw new Error('Failed to update configuration');
    }
    return response.json();
}

// ===== NEW: Session-Based API =====

export interface MoveRecordBackend {
    move_number: number;
    player: string;
    move_usi: string;
    move_algebraic: string;
    position_before: string;
    position_after: string;
    time_spent: number;
    classification: string | null;
    cp_loss: number | null;
}

export interface GameSession {
    session_id: string;
    white_player: string;
    black_player: string;
    white_name: string;
    black_name: string;
    white_engine: string | null;
    black_engine: string | null;
    analyst_engine: string | null;
    analyst_enabled: boolean;
    analyst_movetime: number;
    mode: string;
    is_paused: boolean;
    current_sfen: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    user_notes: string;
    moves: MoveRecordBackend[];
}

export interface Alternative {
    move_usi: string;
    move_algebraic: string;
    score_cp: number | null;
    mate: number | null;
    pv_algebraic: string[];
}

export interface MoveAnalysis {
    engine_id: string;
    engine_name: string;
    bestmove: string;
    bestmove_algebraic: string;
    score_cp: number | null;
    mate: number | null;
    depth: number;
    nodes: number;
    pv: string[];
    pv_algebraic: string[];
    alternatives?: Alternative[];
}

export interface HintResponse {
    analysis: MoveAnalysis;
    side: string;
    expandable: boolean;
}

export interface CreateSessionOptions {
    gameMode?: string;
    whitePlayer?: string;
    blackPlayer?: string;
    whiteName?: string;
    blackName?: string;
    whiteEngine?: string;
    blackEngine?: string;
    analystEnabled?: boolean;
    analystMovetime?: number;
    startingSfen?: string;
}

export async function createSession(options: CreateSessionOptions = {}) {
    const {
        gameMode = 'human_vs_human',
        whitePlayer = 'human',
        blackPlayer = 'human',
        whiteName,
        blackName,
        whiteEngine = 'yaneuraou',
        blackEngine = 'yaneuraou',
        analystEnabled = false,
        analystMovetime = 3000,
        startingSfen,
    } = options;
    
    const response = await fetch(`${API_BASE_URL}/session/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            game_mode: gameMode,
            white_player: whitePlayer,
            black_player: blackPlayer,
            white_name: whiteName,
            black_name: blackName,
            white_engine: whiteEngine,
            black_engine: blackEngine,
            analyst_enabled: analystEnabled,
            analyst_movetime: analystMovetime,
            starting_sfen: startingSfen,
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to create session');
    }
    return response.json() as Promise<GameSession>;
}

export async function getSession(sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}`);
    if (!response.ok) {
        throw new Error('Failed to get session');
    }
    return response.json() as Promise<GameSession>;
}

export async function listSessions(activeOnly: boolean = true, limit: number = 50) {
    const response = await fetch(`${API_BASE_URL}/session/list?active_only=${activeOnly}&limit=${limit}`);
    if (!response.ok) {
        throw new Error('Failed to list sessions');
    }
    return response.json() as Promise<GameSession[]>;
}

export async function getHint(sessionId: string, side?: string) {
    const response = await fetch(`${API_BASE_URL}/hint`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId, side }),
    });
    if (!response.ok) {
        throw new Error('Failed to get hint');
    }
    return response.json() as Promise<HintResponse>;
}

// Get hint directly from SFEN position (for puzzles/analysis without a session)
export async function getHintFromPosition(sfen: string, movetime: number = 2000) {
    const response = await fetch(`${API_BASE_URL}/game/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sfen, movetime }),
    });
    if (!response.ok) {
        throw new Error('Failed to get hint from position');
    }
    return response.json();
}

export async function recordMove(sessionId: string, moveUsi: string, timeSpent: number = 0) {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}/move`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            move_usi: moveUsi,
            time_spent: timeSpent
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to record move');
    }
    return response.json();
}

export async function triggerAnalysis(sessionId: string, background: boolean = true) {
    const response = await fetch(`${API_BASE_URL}/analyze-move`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            session_id: sessionId,
            background
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to trigger analysis');
    }
    return response.json();
}

// ===== Reference File API =====

export async function uploadReferenceFile(name: string, description: string, fileType: string, content: string) {
    const response = await fetch(`${API_BASE_URL}/reference-files`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name,
            description,
            file_type: fileType,
            content
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to upload reference file');
    }
    return response.json();
}

export async function listReferenceFiles() {
    const response = await fetch(`${API_BASE_URL}/reference-files`);
    if (!response.ok) {
        throw new Error('Failed to list reference files');
    }
    return response.json();
}

export async function deleteReferenceFile(fileId: number) {
    const response = await fetch(`${API_BASE_URL}/reference-files/${fileId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error('Failed to delete reference file');
    }
    return response.json();
}

export async function getSessionReferences(sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/reference-files`);
    if (!response.ok) {
        throw new Error('Failed to get session references');
    }
    return response.json();
}

export async function toggleSessionReference(sessionId: string, fileId: number, enabled: boolean) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/reference-files/${fileId}/toggle?enabled=${enabled}`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to toggle reference');
    }
    return response.json();
}

// ===== LLM Config API =====

export async function getLLMConfig() {
    const response = await fetch(`${API_BASE_URL}/llm-config`);
    if (!response.ok) {
        throw new Error('Failed to get LLM configuration');
    }
    return response.json();
}

export async function updateLLMConfig(config: {
    api_keys?: Record<string, string>,
    selected_provider?: string,
    selected_model?: string,
    claude_thinking?: boolean,
    openai_reasoning_effort?: string,
    verbosity?: string
}) {
    const response = await fetch(`${API_BASE_URL}/llm-config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
    });
    if (!response.ok) {
        throw new Error('Failed to update LLM configuration');
    }
    return response.json();
}


// ===== Image Analysis =====

export interface ImageAnalysisResponse {
    sfen: string;
    confidence: 'high' | 'medium' | 'low';
    notes?: string;
}

export async function analyzeShogiBoardImage(imageBase64: string): Promise<ImageAnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/game/analyze-image`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageBase64 }),
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to analyze image');
    }
    
    return response.json();
}

export async function checkLLMConfigured(): Promise<boolean> {
    try {
        const config = await getLLMConfig();
        const selectedProvider = config.selected_provider;
        const apiKey = config.api_keys?.[selectedProvider];
        return !!apiKey && apiKey.length > 0;
    } catch {
        return false;
    }
}

// ===== Game Import/Export =====

export interface GameImportResponse {
    success: boolean;
    session_id?: string;
    message: string;
    move_count: number;
    detected_format?: string;
}

export interface GameExportResponse {
    success: boolean;
    content: string;
    filename: string;
    format: string;
    message: string;
}

export async function importGame(
    content: string,
    format?: string,
    whiteName?: string,
    blackName?: string,
    gameMode: string = 'human_vs_human'
): Promise<GameImportResponse> {
    const response = await fetch(`${API_BASE_URL}/game/import`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content,
            format,
            white_name: whiteName,
            black_name: blackName,
            game_mode: gameMode,
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to import game');
    }
    return response.json();
}

export async function exportGame(
    sessionId: string,
    format: string,
    whiteName?: string,
    blackName?: string,
    eventName?: string,
    filename?: string
): Promise<GameExportResponse> {
    const response = await fetch(`${API_BASE_URL}/game/export`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            format,
            white_name: whiteName,
            black_name: blackName,
            event_name: eventName,
            filename,
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to export game');
    }
    return response.json();
}


// ===== Computer Move =====

export interface ComputerMoveResponse {
    success: boolean;
    move_usi?: string;
    move_algebraic?: string;
    new_sfen?: string;
    is_game_over: boolean;
    winner?: string | null;
    engine_name?: string;
    thinking_time: number;
    message: string;
}

export async function requestComputerMove(
    sessionId: string,
    movetime: number = 3000
): Promise<ComputerMoveResponse> {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}/computer-move`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            movetime,
        }),
    });
    if (!response.ok) {
        throw new Error('Failed to get computer move');
    }
    return response.json();
}

export async function pauseGame(sessionId: string): Promise<{ success: boolean; is_paused: boolean }> {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}/pause`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to pause game');
    }
    return response.json();
}

export async function resumeGame(sessionId: string): Promise<{ success: boolean; is_paused: boolean }> {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}/resume`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to resume game');
    }
    return response.json();
}

export async function updateSession(
    sessionId: string,
    updates: {
        white_name?: string;
        black_name?: string;
        is_paused?: boolean;
    }
): Promise<GameSession> {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
    });
    if (!response.ok) {
        throw new Error('Failed to update session');
    }
    return response.json();
}

