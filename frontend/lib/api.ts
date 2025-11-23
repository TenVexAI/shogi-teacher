const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
    white_engine: string | null;
    black_engine: string | null;
    analyst_engine: string | null;
    analyst_enabled: boolean;
    analyst_movetime: number;
    mode: string;
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

export async function createSession(white_player: string = 'human', black_player: string = 'human') {
    const response = await fetch(`${API_BASE_URL}/session/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            white_player,
            black_player,
            white_engine: 'yaneuraou',  // Default, can be changed
            black_engine: 'yaneuraou',  // Default, can be changed
            analyst_enabled: false,
            analyst_movetime: 3000,
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
    selected_model?: string
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

