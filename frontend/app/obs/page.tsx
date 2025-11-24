'use client';

import { useState, useEffect } from 'react';
import OBSShogiBoard from '@/components/OBSShogiBoard';
import OBSMoveHistory from '@/components/OBSMoveHistory';
import { getGameState, listSessions, GameSession, MoveRecordBackend } from '@/lib/api';
import { GameState } from '@/types/game';
import { MoveRecord } from '@/components/MoveHistory';
import { loadUISettings, UISettings } from '@/lib/settings';

export default function OBSView() {
  // Set body background to transparent on mount
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.background = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    
    return () => {
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
      document.documentElement.style.background = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, []);
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [currentSession, setCurrentSession] = useState<GameSession | null>(null);
  const [lastMoveUsi, setLastMoveUsi] = useState<string | null>(null);
  const [uiSettings, setUiSettings] = useState<UISettings | null>(null);

  // Load initial settings
  useEffect(() => {
    loadUISettings(true).then(setUiSettings);
  }, []);

  // Poll for settings changes to update board display
  useEffect(() => {
    const interval = setInterval(async () => {
      // Force reload settings from backend to sync with main app (bypass cache)
      const freshSettings = await loadUISettings(true);
      setUiSettings(freshSettings);
    }, 100); // Check every 100ms for near real-time updates

    return () => clearInterval(interval);
  }, []);

  // Poll for the latest active session and update game state
  useEffect(() => {
    const pollSession = async () => {
      try {
        // Get the most recent active session
        const sessions = await listSessions(true, 1);
        if (sessions.length > 0) {
          const session = sessions[0];
          
          // Only update if session changed or moves changed
          if (!currentSession || currentSession.session_id !== session.session_id || 
              currentSession.moves.length !== session.moves.length) {
            setCurrentSession(session);
            
            // Load game state
            const state = await getGameState(session.current_sfen);
            setGameState(state);
            
            // Convert moves to move history format
            let cumulativeTime = 0;
            const moves = session.moves.map((m: MoveRecordBackend) => {
              cumulativeTime += m.time_spent * 1000;
              return {
                moveNumber: m.move_number,
                player: (m.player === 'black' ? 'b' : 'w') as 'b' | 'w',
                move: m.move_algebraic,
                timestamp: cumulativeTime,
                timeSinceLastMove: m.time_spent * 1000,
                sfen: m.position_after
              };
            });
            setMoveHistory(moves);
            
            // Set last move highlight
            const lastMove = session.moves[session.moves.length - 1];
            setLastMoveUsi(lastMove ? lastMove.move_usi : null);
          }
        }
      } catch (error) {
        console.error('Failed to poll session:', error);
      }
    };

    // Poll every 100ms for real-time updates
    pollSession();
    const interval = setInterval(pollSession, 100);

    return () => clearInterval(interval);
  }, [currentSession]);

  if (!gameState || !uiSettings) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent">
        <p className="text-text-primary text-xl">Waiting for game session...</p>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden flex">
      {/* Move History Panel - Left Side */}
      <OBSMoveHistory 
        moves={moveHistory}
        currentTurn={gameState.turn as 'b' | 'w'}
      />

      {/* Board - Center/Right */}
      <div className="flex-1 flex items-center justify-center p-8">
        <OBSShogiBoard
          gameState={gameState}
          lastMoveUsi={lastMoveUsi}
          highlightLastMove={uiSettings.highlightLastMove}
          showJapaneseCoords={uiSettings.useJapaneseCoords}
          useWesternNotation={uiSettings.useWesternNotation}
          boardFlipped={uiSettings.boardFlipped}
        />
      </div>
    </div>
  );
}
