'use client';

import { useState, useEffect } from 'react';
import ShogiBoard from '@/components/ShogiBoard';
import ChatInterface from '@/components/ChatInterface';
import { getGameState, makeMove, analyzePosition, explainPosition } from '@/lib/api';
import { GameState } from '@/types/game';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize game
    loadInitialGame();
  }, []);

  const loadInitialGame = async () => {
    try {
      const state = await getGameState();
      setGameState(state);
      setMessages([
        {
          role: 'assistant',
          content: 'Welcome to Shogi Teacher! I\'m here to help you learn and improve your shogi skills. Make a move to begin, or ask me any questions about the game.'
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

    try {
      setIsLoading(true);

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
            content: `Move played: ${move}\n\n⚠️ Analysis unavailable. Make sure:\n- YaneuraOu.exe is in backend/engine/\n- Gemini API key is set in backend/.env\n\nYou can still play without analysis!`
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
          content: '⚠️ AI teacher unavailable. Please configure:\n- YaneuraOu.exe in backend/engine/\n- GEMINI_API_KEY in backend/.env\n\nYou can still play and practice moves!'
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Shogi Teaching Assistant</h1>
          <p className="text-gray-600">Learn and improve your shogi with AI-powered guidance</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex flex-col items-center">
            {gameState ? (
              <>
                <div className="mb-4 text-center">
                  <div className="text-2xl font-bold text-gray-700">
                    {gameState.turn === 'b' ? '⚫ Black' : '⚪ White'} to move
                  </div>
                  {gameState.in_check && (
                    <div className="text-red-600 font-semibold mt-1">Check!</div>
                  )}
                </div>
                <ShogiBoard gameState={gameState} onMove={handleMove} />
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleNewGame}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    New Game
                  </button>
                  <button
                    onClick={handleGetHint}
                    disabled={isLoading || gameState.is_game_over}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    💡 Get Hint
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-gray-400">Loading game...</div>
              </div>
            )}
          </div>

          <div className="h-[600px]">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
