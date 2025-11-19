'use client';

import { useState, useEffect, useRef } from 'react';
import ShogiBoard from '@/components/ShogiBoard';
import ChatInterface from '@/components/ChatInterface';
import ConfigModal from '@/components/ConfigModal';
import MoveHistory, { MoveRecord } from '@/components/MoveHistory';
import { getGameState, makeMove, analyzePosition, explainPosition, updateConfig } from '@/lib/api';
import { GameState } from '@/types/game';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [moveCount, setMoveCount] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const clockStartTimeRef = useRef<number>(0);
  const lastMoveTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);

  useEffect(() => {
    // Initialize game
    loadInitialGame();
  }, []);

  // Update game time when clock is running
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isClockRunning) {
      clockStartTimeRef.current = Date.now();
      intervalId = setInterval(() => {
        const now = Date.now();
        const elapsed = now - clockStartTimeRef.current;
        setGameTime(accumulatedTimeRef.current + elapsed);
      }, 100);
    } else {
      if (clockStartTimeRef.current > 0) {
        const elapsed = Date.now() - clockStartTimeRef.current;
        accumulatedTimeRef.current += elapsed;
        clockStartTimeRef.current = 0;
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isClockRunning]);

  const loadInitialGame = async () => {
    try {
      const state = await getGameState();
      setGameState(state);
      setMoveHistory([]);
      setMoveCount(0);
      setIsClockRunning(false);
      setGameTime(0);
      clockStartTimeRef.current = 0;
      lastMoveTimeRef.current = 0;
      accumulatedTimeRef.current = 0;
      setMessages([
        {
          role: 'assistant',
          content: 'Welcome to Shogi Teacher! I\'m here to help you learn and improve your shogi skills. Start the clock and make a move to begin, or ask me any questions about the game.'
        }
      ]);
    } catch (error) {
      console.error('Failed to load game:', error);
      setMessages([
        {
          role: 'assistant',
          content: 'Error: Could not connect to the backend. Please make sure the API server is running on http://localhost:8000'
        }
      ]);
    }
  };

  const handleMove = async (move: string) => {
    if (!gameState) return;

    // Prevent moves if clock is not running
    if (!isClockRunning) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⏸️ Please start the clock before making a move!'
        }
      ]);
      return;
    }

    try {
      setIsLoading(true);

      // Record move timing
      const currentTime = Date.now();
      const timeSinceStart = clockStartTimeRef.current > 0 ? currentTime - clockStartTimeRef.current : 0;
      const timeSinceLastMove = lastMoveTimeRef.current > 0 ? currentTime - lastMoveTimeRef.current : timeSinceStart;
      lastMoveTimeRef.current = currentTime;

      // Initialize clock start time if this is the first move
      if (clockStartTimeRef.current === 0) {
        clockStartTimeRef.current = currentTime;
      }

      // Analyze BEFORE the move to compare with what player chose
      let preMoveAnalysis = null;
      try {
        preMoveAnalysis = await analyzePosition(gameState.sfen);
      } catch (e) {
        console.error('Pre-move analysis failed:', e);
      }

      // Make the move
      const newState = await makeMove(gameState.sfen, move);
      setGameState(newState);

      // Add move to history using standard notation from backend
      const newMoveCount = moveCount + 1;
      setMoveCount(newMoveCount);
      const moveRecord: MoveRecord = {
        moveNumber: newMoveCount,
        player: gameState.turn as 'b' | 'w',
        move: newState.last_move_notation || move, // Use standard notation if available, fallback to USI
        timestamp: timeSinceStart,
        timeSinceLastMove: timeSinceLastMove
      };
      setMoveHistory(prev => [...prev, moveRecord]);

      // Try to get analysis and explanation for the new position
      try {
        const postMoveAnalysis = await analyzePosition(newState.sfen);
        const explanation = await explainPosition(newState.sfen, {
          ...postMoveAnalysis,
          player_move: move,
          engine_suggestion: preMoveAnalysis?.bestmove,
          pre_move_score: preMoveAnalysis?.score_cp
        });

        const playerColor = gameState.turn === 'b' ? 'Black' : 'White';
        const nextColor = newState.turn === 'b' ? 'Black' : 'White';

        let message = `**${playerColor} played: ${move}**\n\n`;

        // Compare player's move with engine suggestion
        if (preMoveAnalysis && preMoveAnalysis.bestmove !== move) {
          message += `💡 Engine suggested: ${preMoveAnalysis.bestmove}\n\n`;
        } else if (preMoveAnalysis && preMoveAnalysis.bestmove === move) {
          message += `✓ Excellent! You played the engine's top choice!\n\n`;
        }

        message += `${explanation.explanation}\n\n`;
        message += `**Now it's ${nextColor}'s turn**\n`;
        message += `Best move for ${nextColor}: ${postMoveAnalysis.bestmove}\n`;
        message += `Position evaluation: ${postMoveAnalysis.mate ? `Mate in ${postMoveAnalysis.mate}` : `${postMoveAnalysis.score_cp} centipawns`}\n`;

        // Add principal variation if available
        if (postMoveAnalysis.info) {
          const pvMatch = postMoveAnalysis.info.match(/pv (.+)$/);
          if (pvMatch) {
            // Extract only the actual moves (USI format: digit+letter+digit+letter, e.g., "7g7f")
            const allTokens = pvMatch[1].split(' ');
            const moves = allTokens.filter((token: string) =>
              token.length >= 4 && token.length <= 5 && /^\d[a-i]\d[a-i]\+?$/.test(token)
            );
            if (moves.length > 0) {
              message += `\nExpected continuation: ${moves.join(' ')}`;
            }
          }
        }

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: message
          }
        ]);
      } catch (analysisError) {
        console.error('Analysis failed:', analysisError);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Move played: ${move}\n\n⚠️ Analysis unavailable. Make sure:\n- YaneuraOu.exe is in backend/engine/\n- Claude API key is configured in settings\n\nYou can still play without analysis!`
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to make move:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error: Failed to process move. Please try again.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!gameState) return;

    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);

    try {
      // Get analysis for current position
      const analysis = await analyzePosition(gameState.sfen);

      // Get explanation with user's question as context
      const explanation = await explainPosition(
        gameState.sfen,
        { ...analysis, user_question: message }
      );

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: explanation.explanation
        }
      ]);
    } catch (error) {
      console.error('Failed to get response:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ AI teacher unavailable. Please configure:\n- YaneuraOu.exe in backend/engine/\n- Claude API key in settings\n\nYou can still play and practice moves!'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewGame = () => {
    loadInitialGame();
  };

  const handleGetHint = async () => {
    if (!gameState) return;

    setIsLoading(true);
    try {
      const analysis = await analyzePosition(gameState.sfen);
      const playerColor = gameState.turn === 'b' ? 'Black' : 'White';

      let hintMessage = `💡 **Hint for ${playerColor}:**\n\nEngine suggests: **${analysis.bestmove}**\n\nEvaluation: ${analysis.mate ? `Mate in ${analysis.mate}` : `${analysis.score_cp} centipawns`}\n`;

      // Add principal variation
      if (analysis.info) {
        const pvMatch = analysis.info.match(/pv (.+)$/);
        if (pvMatch) {
          const allTokens = pvMatch[1].split(' ');
          const moves = allTokens.filter((token: string) =>
            token.length >= 4 && token.length <= 5 && /^\d[a-i]\d[a-i]\+?$/.test(token)
          ).slice(0, 5);
          if (moves.length > 0) {
            hintMessage += `\nExpected line: ${moves.join(' ')}\n`;
          }
        }
      }

      hintMessage += `\nTry to figure out why this move is strong!`;

      setMessages(prev => [
        ...prev,
        {
          role: 'user',
          content: 'Give me a hint for the best move'
        },
        {
          role: 'assistant',
          content: hintMessage
        }
      ]);
    } catch (error) {
      console.error('Failed to get hint:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Could not get hint. Engine analysis unavailable.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (apiKey: string) => {
    await updateConfig(apiKey);
  };

  const handleClockToggle = () => {
    setIsClockRunning(!isClockRunning);
    if (!isClockRunning && clockStartTimeRef.current === 0) {
      clockStartTimeRef.current = Date.now();
      lastMoveTimeRef.current = Date.now();
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Settings button in top-left */}
        <div className="mb-4">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>

        <ConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          onSave={handleSaveConfig}
        />

        <div className="flex gap-6">
          {/* Left Column: Move History with Clock */}
          <div className="w-80 h-[700px]">
            <MoveHistory 
              moves={moveHistory} 
              currentTurn={(gameState?.turn as 'b' | 'w') || 'b'}
              isClockRunning={isClockRunning}
              onClockToggle={handleClockToggle}
              gameTime={gameTime}
              onNewGame={handleNewGame}
            />
          </div>

          {/* Center Column: Board */}
          <div className="flex-1 flex flex-col items-center gap-4">
            {gameState ? (
              <>
                {gameState.in_check && (
                  <div className="text-red-600 font-semibold text-xl">⚠️ Check!</div>
                )}
                <ShogiBoard gameState={gameState} onMove={handleMove} />
              </>
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-gray-400">Loading game...</div>
              </div>
            )}
          </div>

          {/* Right Column: Chat Interface */}
          <div className="flex-1 h-[700px]">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onGetHint={handleGetHint}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
