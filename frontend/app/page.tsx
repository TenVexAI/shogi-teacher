'use client';

import { useState, useEffect, useRef } from 'react';
import ShogiBoard from '@/components/ShogiBoard';
import ChatInterface from '@/components/ChatInterface';
import ConfigModal from '@/components/ConfigModal';
import MoveHistory, { MoveRecord } from '@/components/MoveHistory';
import { getGameState, makeMove, analyzePosition, explainPosition, updateConfig, getConfig } from '@/lib/api';
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
  const [useLLM, setUseLLM] = useState(true);
  const [currentApiKey, setCurrentApiKey] = useState<string>('');
  const [showBestMove, setShowBestMove] = useState(false);
  const [showClockStartModal, setShowClockStartModal] = useState(false);
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [cachedHintAnalysis, setCachedHintAnalysis] = useState<{ bestmove: string; score_cp: number; mate: number | null; info: string } | null>(null);
  const [cachedHintSfen, setCachedHintSfen] = useState<string | null>(null);
  const [cachedHintTurn, setCachedHintTurn] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [moveCount, setMoveCount] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const clockStartTimeRef = useRef<number>(0);
  const lastMoveTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);

  useEffect(() => {
    // Initialize game and load config
    loadInitialGame();
    loadConfig();
  }, []);

  // Stop clock when game ends
  useEffect(() => {
    if (gameState?.is_game_over && isClockRunning) {
      setIsClockRunning(false);
    }
  }, [gameState?.is_game_over, isClockRunning]);

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

  const loadConfig = async () => {
    try {
      const config = await getConfig();
      if (config.claude_api_key) {
        setCurrentApiKey(config.claude_api_key);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      // Don't block the app if config loading fails
      // User can still configure via the settings modal
    }
  };

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

  const executeMove = async (move: string) => {
    if (!gameState) return;

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

      // Use cached hint analysis if available for this position AND same turn, otherwise analyze
      let preMoveAnalysis = null;
      if (cachedHintSfen === gameState.sfen && cachedHintTurn === gameState.turn && cachedHintAnalysis) {
        preMoveAnalysis = cachedHintAnalysis;
        // Clear cache after use
        setCachedHintAnalysis(null);
        setCachedHintSfen(null);
        setCachedHintTurn(null);
      } else {
        try {
          preMoveAnalysis = await analyzePosition(gameState.sfen);
        } catch (e) {
          console.error('Pre-move analysis failed:', e);
        }
      }

      // Make the move
      const newState = await makeMove(gameState.sfen, move);
      setGameState(newState);

      // Play sound effect based on which player moved
      const soundFile = gameState.turn === 'b' ? '/sounds/shogi_sound_black.mp3' : '/sounds/shogi_sound_white.mp3';
      const audio = new Audio(soundFile);
      audio.volume = 0.5; // Set volume to 50%
      audio.play().catch(err => console.log('Audio play failed:', err));

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
        const playerColor = gameState.turn === 'b' ? 'Black' : 'White';
        const nextColor = newState.turn === 'b' ? 'Black' : 'White';

        let message = `**${playerColor} played: ${move}**\n\n`;

        // Compare player's move with engine suggestion
        if (preMoveAnalysis && preMoveAnalysis.bestmove !== move) {
          message += `💡 Engine suggested: ${preMoveAnalysis.bestmove}\n\n`;
        } else if (preMoveAnalysis && preMoveAnalysis.bestmove === move) {
          message += `✓ Excellent! You played the engine's top choice!\n\n`;
        }

        // Add LLM explanation if enabled
        if (useLLM) {
          try {
            const explanation = await explainPosition(newState.sfen, {
              ...postMoveAnalysis,
              player_move: move,
              engine_suggestion: preMoveAnalysis?.bestmove,
              pre_move_score: preMoveAnalysis?.score_cp
            });
            message += `${explanation.explanation}\n\n`;
          } catch (llmError) {
            console.error('LLM explanation failed:', llmError);
            // Continue with engine-only analysis
          }
        }

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
            content: `Move played: ${move}\n\n⚠️ Engine analysis unavailable. Make sure YaneuraOu.exe is in backend/engine/\n\nYou can still play without analysis!`
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

  const handleMove = async (move: string) => {
    if (!gameState) return;

    // Show modal if clock is not running
    if (!isClockRunning) {
      setPendingMove(move);
      setShowClockStartModal(true);
      return;
    }

    await executeMove(move);
  };

  const handleSendMessage = async (message: string) => {
    if (!gameState) return;

    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);

    try {
      // Get analysis for current position
      const analysis = await analyzePosition(gameState.sfen);

      if (useLLM) {
        // Get LLM explanation with user's question as context
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
      } else {
        // Show engine analysis only
        const currentColor = gameState.turn === 'b' ? 'Black' : 'White';
        let response = `**Current Position Analysis**\n\n`;
        response += `Turn: ${currentColor}\n`;
        response += `Best move: ${analysis.bestmove}\n`;
        response += `Evaluation: ${analysis.mate ? `Mate in ${analysis.mate}` : `${analysis.score_cp} centipawns`}\n`;
        
        if (analysis.info) {
          const pvMatch = analysis.info.match(/pv (.+)$/);
          if (pvMatch) {
            const allTokens = pvMatch[1].split(' ');
            const moves = allTokens.filter((token: string) =>
              token.length >= 4 && token.length <= 5 && /^\d[a-i]\d[a-i]\+?$/.test(token)
            );
            if (moves.length > 0) {
              response += `\nExpected continuation: ${moves.join(' ')}`;
            }
          }
        }

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: response
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to get response:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: useLLM 
            ? '⚠️ AI teacher unavailable. Please configure:\n- YaneuraOu.exe in backend/engine/\n- Claude API key in settings\n\nYou can still play and practice moves!'
            : '⚠️ Engine analysis unavailable. Make sure YaneuraOu.exe is in backend/engine/'
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
      
      // Cache this analysis for use when the move is made
      setCachedHintAnalysis(analysis);
      setCachedHintSfen(gameState.sfen);
      setCachedHintTurn(gameState.turn);
      
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

  const handleSaveConfig = async (apiKey: string, useLLMSetting: boolean, showBestMoveSetting: boolean) => {
    // Only update API key if a new one was provided
    if (apiKey && apiKey.trim()) {
      await updateConfig(apiKey);
      setCurrentApiKey(apiKey);
    }
    setUseLLM(useLLMSetting);
    setShowBestMove(showBestMoveSetting);
  };

  const handleClockToggle = () => {
    setIsClockRunning(!isClockRunning);
    if (!isClockRunning && clockStartTimeRef.current === 0) {
      clockStartTimeRef.current = Date.now();
      lastMoveTimeRef.current = Date.now();
    }
  };

  const handleBestMove = async () => {
    if (!gameState || isLoading) return;

    try {
      setIsLoading(true);
      // Get the best move from engine
      const analysis = await analyzePosition(gameState.sfen);
      
      // Cache it for the move execution
      setCachedHintAnalysis(analysis);
      setCachedHintSfen(gameState.sfen);
      setCachedHintTurn(gameState.turn);
      
      // Execute the best move
      await handleMove(analysis.bestmove);
    } catch (error) {
      console.error('Failed to get best move:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Could not get best move. Engine analysis unavailable.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartClockAndMove = async () => {
    setShowClockStartModal(false);
    setIsClockRunning(true);
    clockStartTimeRef.current = Date.now();
    lastMoveTimeRef.current = Date.now();
    
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: 'Clock started!'
      }
    ]);
    
    if (pendingMove) {
      await executeMove(pendingMove);
      setPendingMove(null);
    }
  };

  const handleDeclineClockStart = () => {
    setShowClockStartModal(false);
    setPendingMove(null);
    
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: 'When you\'re ready, start the clock to make your next move.'
      }
    ]);
  };

  return (
    <main className="min-h-screen bg-background-primary p-8">
      <div className="max-w-7xl mx-auto">
        <ConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          onSave={handleSaveConfig}
          currentUseLLM={useLLM}
          currentApiKey={currentApiKey}
          currentShowBestMove={showBestMove}
        />

        {/* Clock Start Confirmation Modal */}
        {showClockStartModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-text-primary mb-4">Start the Clock?</h2>
              <p className="text-text-secondary mb-6">
                Would you like to start the clock to make this move?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleDeclineClockStart}
                  className="px-4 py-2 bg-background-primary border border-border text-text-primary rounded-lg hover:bg-background-secondary transition-colors"
                >
                  No
                </button>
                <button
                  onClick={handleStartClockAndMove}
                  className="px-4 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] transition-colors"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-6 h-[max(700px,calc(100vh-4rem))]">
          {/* Left Column: Move History with Clock */}
          <div className="w-[300px] flex-shrink-0 h-full">
            <MoveHistory 
              moves={moveHistory} 
              currentTurn={(gameState?.turn as 'b' | 'w') || 'b'}
              isClockRunning={isClockRunning}
              onClockToggle={handleClockToggle}
              gameTime={gameTime}
              onNewGame={handleNewGame}
              isGameOver={gameState?.is_game_over || false}
            />
          </div>

          {/* Center Column: Board */}
          <div className="flex-1 flex flex-col items-center gap-4">
            {gameState ? (
              <ShogiBoard 
                gameState={gameState} 
                onMove={handleMove}
                showBestMove={showBestMove}
                onBestMove={handleBestMove}
                isLoading={isLoading}
              />
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-text-secondary">Loading game...</div>
              </div>
            )}
          </div>

          {/* Right Column: Chat Interface */}
          <div className="w-[500px] flex-shrink-0 h-full">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onGetHint={handleGetHint}
              onOpenSettings={() => setIsConfigOpen(true)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
