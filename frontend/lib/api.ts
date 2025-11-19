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

export async function explainPosition(sfen: string, analysis: Record<string, unknown>) {
    const response = await fetch(`${API_BASE_URL}/explain?sfen=${encodeURIComponent(sfen)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(analysis),
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
