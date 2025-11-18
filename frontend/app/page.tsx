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

      // Make the move
      const newState = await makeMove(gameState.sfen, move);
      setGameState(newState);

      // Try to get analysis and explanation (optional)
      try {
        const analysis = await analyzePosition(newState.sfen);
        const explanation = await explainPosition(newState.sfen, analysis);

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Move played: ${move}\n\n${explanation.explanation}\n\nBest move: ${analysis.bestmove}\nEvaluation: ${analysis.mate ? `Mate in ${analysis.mate}` : `${analysis.score_cp} centipawns`}`
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
                <ShogiBoard gameState={gameState} onMove={handleMove} />
                <button
                  onClick={handleNewGame}
                  className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  New Game
                </button>
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
