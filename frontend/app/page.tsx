'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ShogiBoard from '@/components/ShogiBoard';
import ChatInterface from '@/components/ChatInterface';
import ConfigModal from '@/components/ConfigModal';
import SoundSettingsModal, { SoundSettings } from '@/components/SoundSettingsModal';
import EngineManagementModal from '@/components/EngineManagementModal';
import MoveHistory, { MoveRecord } from '@/components/MoveHistory';
import Sidebar from '@/components/Sidebar';
import ResourcesWindow from '@/components/ResourcesWindow';
import ResumeSessionModal from '@/components/ResumeSessionModal';
import NewGameModal, { GameConfig } from '@/components/NewGameModal';
import ExportGameModal from '@/components/ExportGameModal';
import GameModeSettingsModal, { GameModeSettings } from '@/components/GameModeSettingsModal';
import { 
  getGameState, analyzePosition, explainPosition, updateConfig, getConfig,
  createSession, getSession, getHint, recordMove, listSessions,
  importGame, exportGame, requestComputerMove,
  GameSession, HintResponse, MoveRecordBackend, CreateSessionOptions
} from '@/lib/api';
import { GameState, GameFormat } from '@/types/game';
import { audioManager } from '@/lib/audioManager';
import { loadUISettings, saveUISettings } from '@/lib/settings';

interface Alternative {
  move_usi: string;
  move_algebraic: string;
  score_cp: number | null;
  mate: number | null;
  pv_algebraic: string[];
}

interface HintData {
  bestmove: string;
  bestmove_algebraic: string;
  score_cp: number | null;
  mate: number | null;
  pv_algebraic: string[];
  alternatives?: Alternative[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  messageType?: 'system' | 'llm' | 'engine-black' | 'engine-white';
  engineName?: string;
  hintData?: HintData;
  id?: string;  // For tracking and updating messages
  isThinking?: boolean;  // Show animated spinner
}

export default function Home() {
  // NEW: Session state
  const [currentSession, setCurrentSession] = useState<GameSession | null>(null);
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSoundSettingsOpen, setIsSoundSettingsOpen] = useState(false);
  const [isEngineManagementOpen, setIsEngineManagementOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    uiEnabled: false,
    musicEnabled: false,
    ambientEnabled: false,
    uiVolume: 50,
    musicVolume: 10,
    ambientVolumes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
  });
  const [isClockRunning, setIsClockRunning] = useState(false);
  const [useLLM, setUseLLM] = useState(true);
  const [currentApiKey, setCurrentApiKey] = useState<string>('');
  const [showBestMove, setShowBestMove] = useState(false);
  const [showBoardOptionsPanel, setShowBoardOptionsPanel] = useState(true);
  const [allSoundsMuted, setAllSoundsMuted] = useState(false);
  const [uiSoundEnabled, setUiSoundEnabled] = useState(false);
  const [musicSoundEnabled, setMusicSoundEnabled] = useState(false);
  const [ambientSoundEnabled, setAmbientSoundEnabled] = useState(false);
  const [showClockStartModal, setShowClockStartModal] = useState(false);
  const [lastMoveUsi, setLastMoveUsi] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [lastSession, setLastSession] = useState<GameSession | null>(null);
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [gameTime, setGameTime] = useState(0);
  const clockStartTimeRef = useRef<number>(0);
  const lastMoveTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const [engineConfig, setEngineConfig] = useState<{ black: { engineId: string | null; strengthLevel: number }; white: { engineId: string | null; strengthLevel: number } } | null>(null);
  
  // Game mode state
  const [isNewGameModalOpen, setIsNewGameModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGameModeSettingsOpen, setIsGameModeSettingsOpen] = useState(false);
  const [availableEngines, setAvailableEngines] = useState<{ id: string; name: string }[]>([]);
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [returnToNewGameModal, setReturnToNewGameModal] = useState(false);
  const [returnToGameModeSettings, setReturnToGameModeSettings] = useState(false);

  useEffect(() => {
    // Initialize game and load config
    const initializeApp = async () => {
      const hasRecentSession = await checkForRecentSession();
      if (!hasRecentSession) {
        await loadInitialGame();
      }
    };
    
    initializeApp();
    loadConfig();
    loadEngineConfig();
    
    // Load UI settings asynchronously
    loadUISettings().then(uiSettings => {
      setUseLLM(uiSettings.useLLM);
      setShowBestMove(uiSettings.showBestMove);
      setShowBoardOptionsPanel(uiSettings.showBoardOptionsPanel);
      setAllSoundsMuted(uiSettings.allSoundsMuted);
      setUiSoundEnabled(uiSettings.uiSoundEnabled);
      setMusicSoundEnabled(uiSettings.musicSoundEnabled);
      setAmbientSoundEnabled(uiSettings.ambientSoundEnabled);
      
      // Apply sound settings from UI preferences
      // Actual playing state = enabled && !muted
      const newSettings = {
        uiEnabled: uiSettings.uiSoundEnabled && !uiSettings.allSoundsMuted,
        musicEnabled: uiSettings.musicSoundEnabled && !uiSettings.allSoundsMuted,
        ambientEnabled: uiSettings.ambientSoundEnabled && !uiSettings.allSoundsMuted,
        uiVolume: 50,
        musicVolume: 10,
        ambientVolumes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
      };
      
      // Load volume settings from audioManager
      const savedSettings = audioManager.loadSettings();
      newSettings.uiVolume = savedSettings.uiVolume;
      newSettings.musicVolume = savedSettings.musicVolume;
      newSettings.ambientVolumes = savedSettings.ambientVolumes;
      
      setSoundSettings(newSettings);
      audioManager.updateSettings(newSettings);
    });
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

  const loadEngineConfig = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/engines/config');
      if (response.ok) {
        const data = await response.json();
        setEngineConfig(data); // Data is already in the correct format { black: {...}, white: {...} }
      }
    } catch (error) {
      console.error('Failed to load engine config:', error);
    }
  };

  const checkForRecentSession = async () => {
    try {
      const sessions = await listSessions(true, 1);
      if (sessions.length > 0) {
        const recentSession = sessions[0];
        // Only offer to resume if there are moves (not a fresh session)
        if (recentSession.moves.length > 0) {
          setLastSession(recentSession);
          setShowResumeModal(true);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to check for recent session:', error);
      return false;
    }
  };

  const resumeSession = async () => {
    if (!lastSession) return;
    
    try {
      setCurrentSession(lastSession);
      
      // Load game state from session SFEN
      const state = await getGameState(lastSession.current_sfen);
      setGameState(state);
      
      // Calculate cumulative timestamps for move history
      let cumulativeTime = 0;
      setMoveHistory(lastSession.moves.map((m: MoveRecordBackend) => {
        cumulativeTime += m.time_spent * 1000; // Convert to ms and accumulate
        return {
          moveNumber: m.move_number,
          player: (m.player === 'black' ? 'b' : 'w') as 'b' | 'w',
          move: m.move_algebraic,
          timestamp: cumulativeTime,
          timeSinceLastMove: m.time_spent * 1000,
          sfen: m.position_after
        };
      }));
      
      // Set last move highlight to the most recent move
      const lastMoveRecord = lastSession.moves[lastSession.moves.length - 1];
      setLastMoveUsi(lastMoveRecord ? lastMoveRecord.move_usi : null);
      
      setIsClockRunning(false);
      setGameTime(cumulativeTime);
      clockStartTimeRef.current = 0;
      lastMoveTimeRef.current = 0;
      accumulatedTimeRef.current = cumulativeTime;
      
      setMessages([
        {
          role: 'assistant',
          content: `**Game Resumed**\n\nWelcome back! You have ${lastSession.moves.length} moves on the board.\n\nContinue playing or ask me any questions about the game.`,
          messageType: 'system'
        }
      ]);
      
      setShowResumeModal(false);
      audioManager.playUISound('new_game');
    } catch (error) {
      console.error('Failed to resume session:', error);
      setShowResumeModal(false);
      loadInitialGame(); // Fall back to new game
    }
  };

  const loadInitialGame = async (config?: GameConfig) => {
    try {
      // Build session options from config
      const options: CreateSessionOptions = {
        gameMode: config?.mode || 'human_vs_human',
        whitePlayer: 'human',
        blackPlayer: 'human',
        whiteName: config?.whiteName,
        blackName: config?.blackName,
        whiteEngine: config?.whiteEngine || 'yaneuraou',
        blackEngine: config?.blackEngine || 'yaneuraou',
      };
      
      // Configure for human vs computer
      if (config?.mode === 'human_vs_computer') {
        if (config.humanPlaysAs === 'black') {
          options.whitePlayer = config.whiteEngine || 'yaneuraou';
        } else {
          options.blackPlayer = config.blackEngine || 'yaneuraou';
        }
      }
      
      // Configure for computer vs computer
      if (config?.mode === 'computer_vs_computer') {
        options.blackPlayer = config.blackEngine || 'yaneuraou';
        options.whitePlayer = config.whiteEngine || 'yaneuraou';
      }
      
      // Create a new session
      const session = await createSession(options);
      setCurrentSession(session);
      
      // Load game state from session SFEN
      const state = await getGameState(session.current_sfen);
      setGameState(state);
      setMoveHistory([]);
      setLastMoveUsi(null);
      setIsClockRunning(false);
      setGameTime(0);
      clockStartTimeRef.current = 0;
      lastMoveTimeRef.current = 0;
      accumulatedTimeRef.current = 0;
      setMessages([
        {
          role: 'assistant',
          content: `Learn to play Shogi! I'm here to help you learn and improve your shogi skills.\n\n**Game Mode**: ${session.mode}\n\nStart the clock and make a move to begin, or ask me any questions about the game.`,
          messageType: 'system'
        }
      ]);
    } catch (error) {
      console.error('Failed to load game:', error);
      setMessages([
        {
          role: 'assistant',
          content: 'Error: Could not connect to the backend. Please make sure the API server is running on http://localhost:8000',
          messageType: 'system'
        }
      ]);
    }
  };

  const executeMove = async (move: string) => {
    if (!gameState || !currentSession) return;

    try {
      setIsLoading(true);

      // Record move timing
      const currentTime = Date.now();
      const timeSinceLastMove = lastMoveTimeRef.current > 0 ? currentTime - lastMoveTimeRef.current : 0;
      const timeSpent = timeSinceLastMove / 1000; // Convert to seconds
      lastMoveTimeRef.current = currentTime;

      // Initialize clock start time if this is the first move
      if (clockStartTimeRef.current === 0) {
        clockStartTimeRef.current = currentTime;
      }

      // Record the move via session API
      const result = await recordMove(currentSession.session_id, move, timeSpent);
      
      // Update game state from new SFEN
      const newState = await getGameState(result.new_sfen);
      setGameState(newState);
      
      // Track the last move for highlighting
      setLastMoveUsi(move);

      // Play sound effect based on which player moved
      audioManager.playPieceSound(gameState.turn === 'b');

      // Refresh session to get updated move history
      const updatedSession = await getSession(currentSession.session_id);
      setCurrentSession(updatedSession);
      
      // Update move history from backend with cumulative timestamps
      let cumulativeTime = 0;
      setMoveHistory(updatedSession.moves.map((m: MoveRecordBackend) => {
        cumulativeTime += m.time_spent * 1000; // Convert to ms and accumulate
        return {
          moveNumber: m.move_number,
          player: (m.player === 'black' ? 'b' : 'w') as 'b' | 'w',
          move: m.move_algebraic,
          timestamp: cumulativeTime,
          timeSinceLastMove: m.time_spent * 1000, // Convert back to ms
          sfen: m.position_after
        };
      }));

      // Show move confirmation
      const playerName = gameState.turn === 'b' 
        ? (currentSession.black_name || 'Black') 
        : (currentSession.white_name || 'White');
      const lastMove = result.move_record;
      
      let message = `**${playerName}** played **${lastMove.move_algebraic}**`;
      
      // Show move quality if available
      if (lastMove.classification) {
        const emoji = lastMove.classification === 'Excellent' ? '✅' :
                     lastMove.classification === 'Good' ? '👍' :
                     lastMove.classification === 'Inaccuracy' ? '⚠️' :
                     lastMove.classification === 'Mistake' ? '❌' : '💥';
        message += ` ${emoji} ${lastMove.classification}`;
        if (lastMove.cp_loss) {
          message += ` (-${lastMove.cp_loss}cp)`;
        }
      }
      
      // Add game over notification
      if (newState.is_game_over) {
        message += '\n\n**Game Over!**';
      }

      addAssistantMessage(message, 'system');
    } catch (error) {
      console.error('Failed to make move:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAssistantMessage(`❌ Error: ${errorMessage}\n\nSession ID: ${currentSession?.session_id}\nMove: ${move}`, 'system');
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
    if (!gameState || !currentSession) return;

    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);

    try {
      if (useLLM) {
        // Build conversation history from messages (only LLM conversations)
        const conversationHistory = messages
          .filter(m => m.messageType === 'llm' || (m.role === 'user' && messages.some(am => am.messageType === 'llm')))
          .map(m => ({
            role: m.role,
            content: m.content
          }));
        
        // Get LLM explanation with full game context, conversation history, and user's question
        const result = await explainPosition(
          currentSession.session_id, 
          message,
          conversationHistory
        );
        addAssistantMessage(result.explanation, 'llm');
      } else {
        // Show engine analysis only
        const analysis = await analyzePosition(gameState.sfen);
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

        addAssistantMessage(response);
      }
    } catch (error) {
      console.error('Failed to get response:', error);
      addAssistantMessage(useLLM 
        ? '⚠️ AI teacher unavailable. Please configure:\n- YaneuraOu.exe in backend/engine/\n- Claude API key in settings\n\nYou can still play and practice moves!'
        : '⚠️ Engine analysis unavailable. Make sure YaneuraOu.exe is in backend/engine/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewGame = () => {
    setIsNewGameModalOpen(true);
  };

  const handleStartNewGame = (config: GameConfig) => {
    loadInitialGame(config);
    audioManager.playUISound('new_game');
  };

  const handleImportGame = async (content: string, format?: string) => {
    try {
      setIsLoading(true);
      const result = await importGame(content, format);
      
      if (result.success && result.session_id) {
        // Load the imported session
        const session = await getSession(result.session_id);
        setCurrentSession(session);
        
        const state = await getGameState(session.current_sfen);
        setGameState(state);
        
        // Build move history
        let cumulativeTime = 0;
        setMoveHistory(session.moves.map((m: MoveRecordBackend) => {
          cumulativeTime += m.time_spent * 1000;
          return {
            moveNumber: m.move_number,
            player: (m.player === 'black' ? 'b' : 'w') as 'b' | 'w',
            move: m.move_algebraic,
            timestamp: cumulativeTime,
            timeSinceLastMove: m.time_spent * 1000,
            sfen: m.position_after
          };
        }));
        
        // Set last move highlight
        const lastMoveRecord = session.moves[session.moves.length - 1];
        setLastMoveUsi(lastMoveRecord ? lastMoveRecord.move_usi : null);
        
        addAssistantMessage(
          `**Game Imported**\n\n${result.message}\n\nFormat: ${result.detected_format?.toUpperCase() || 'Auto-detected'}`,
          'system'
        );
        audioManager.playUISound('new_game');
      } else {
        addAssistantMessage(`❌ Import failed: ${result.message}`, 'system');
      }
    } catch (error) {
      console.error('Failed to import game:', error);
      addAssistantMessage('❌ Failed to import game. Please check the file format.', 'system');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportGame = async (
    format: GameFormat, 
    whiteName?: string, 
    blackName?: string, 
    filename?: string
  ): Promise<{ content: string; filename: string } | null> => {
    if (!currentSession) return null;
    
    try {
      const result = await exportGame(
        currentSession.session_id,
        format,
        whiteName,
        blackName,
        undefined,
        filename
      );
      
      if (result.success) {
        return { content: result.content, filename: result.filename };
      }
      return null;
    } catch (error) {
      console.error('Failed to export game:', error);
      return null;
    }
  };

  // Check if it's computer's turn and trigger auto-move
  const checkAndTriggerComputerMove = useCallback(async () => {
    if (!currentSession || !gameState || isComputerThinking || isLoading) return;
    if (gameState.is_game_over) return;
    
    // Don't move if clock isn't running
    if (!isClockRunning) return;
    
    const mode = currentSession.mode;
    const currentTurn = gameState.turn; // 'b' or 'w'
    
    // Determine if current player is computer
    let isComputerTurn = false;
    
    if (mode === 'computer_vs_computer') {
      // Both sides are computers - always computer's turn (clock running check is above)
      isComputerTurn = true;
    } else if (mode === 'human_vs_computer') {
      // Check which side is computer
      const blackIsComputer = currentSession.black_player !== 'human';
      const whiteIsComputer = currentSession.white_player !== 'human';
      isComputerTurn = (currentTurn === 'b' && blackIsComputer) || (currentTurn === 'w' && whiteIsComputer);
    }
    
    if (!isComputerTurn) return;
    
    // Add thinking message
    const playerName = currentTurn === 'b' ? currentSession.black_name : currentSession.white_name;
    const thinkingId = Date.now().toString();
    
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `**${playerName}** is thinking...`,
        messageType: 'system',
        id: thinkingId,
        isThinking: true
      }
    ]);
    
    setIsComputerThinking(true);
    
    try {
      const result = await requestComputerMove(currentSession.session_id, 2000);
      
      if (result.success && result.move_usi) {
        // Update game state
        const newState = await getGameState(result.new_sfen || '');
        setGameState(newState);
        setLastMoveUsi(result.move_usi);
        
        // Play sound
        audioManager.playPieceSound(currentTurn === 'b');
        
        // Refresh session
        const updatedSession = await getSession(currentSession.session_id);
        setCurrentSession(updatedSession);
        
        // Update move history
        let cumulativeTime = 0;
        setMoveHistory(updatedSession.moves.map((m: MoveRecordBackend) => {
          cumulativeTime += m.time_spent * 1000;
          return {
            moveNumber: m.move_number,
            player: (m.player === 'black' ? 'b' : 'w') as 'b' | 'w',
            move: m.move_algebraic,
            timestamp: cumulativeTime,
            timeSinceLastMove: m.time_spent * 1000,
            sfen: m.position_after
          };
        }));
        
        // Update thinking message to show the move
        setMessages(prev => prev.map(msg => 
          msg.id === thinkingId 
            ? {
                ...msg,
                content: `**${playerName}** played **${result.move_algebraic}**${result.is_game_over ? '\n\n**Game Over!**' : ''}`,
                isThinking: false
              }
            : msg
        ));
      } else {
        // Update thinking message to show error
        setMessages(prev => prev.map(msg => 
          msg.id === thinkingId 
            ? { ...msg, content: `**${playerName}** failed to make a move`, isThinking: false }
            : msg
        ));
      }
    } catch (error) {
      console.error('Computer move failed:', error);
      // Update thinking message to show error
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingId 
          ? { ...msg, content: `**${playerName}** failed to make a move`, isThinking: false }
          : msg
      ));
    } finally {
      setIsComputerThinking(false);
    }
  }, [currentSession, gameState, isComputerThinking, isLoading, isClockRunning]);

  // Effect to trigger computer moves
  useEffect(() => {
    if (!currentSession || !gameState) return;
    
    const mode = currentSession.mode;
    if (mode !== 'human_vs_computer' && mode !== 'computer_vs_computer') return;
    
    // Don't move if clock isn't running (respects pause)
    if (!isClockRunning) return;
    
    // Small delay before computer moves
    const timeout = setTimeout(() => {
      checkAndTriggerComputerMove();
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [currentSession?.mode, gameState?.turn, currentSession?.is_paused, isClockRunning, checkAndTriggerComputerMove]);

  // Helper to check if user can interact with pieces
  const canUserInteract = (): boolean => {
    if (!currentSession || !gameState) return false;
    if (gameState.is_game_over) return false;
    if (isComputerThinking) return false;
    
    const mode = currentSession.mode;
    const currentTurn = gameState.turn;
    
    if (mode === 'computer_vs_computer') {
      return false; // User never interacts in computer vs computer
    }
    
    if (mode === 'human_vs_computer') {
      const blackIsHuman = currentSession.black_player === 'human';
      const whiteIsHuman = currentSession.white_player === 'human';
      return (currentTurn === 'b' && blackIsHuman) || (currentTurn === 'w' && whiteIsHuman);
    }
    
    return true; // human_vs_human - always can interact
  };

  // Helper to check if hint/best move buttons should be enabled
  const canUseHintButtons = (): boolean => {
    if (!currentSession || !gameState) return false;
    if (gameState.is_game_over) return false;
    if (isComputerThinking) return false;
    
    const mode = currentSession.mode;
    
    if (mode === 'computer_vs_computer') {
      return false; // No hints in computer vs computer
    }
    
    return canUserInteract();
  };

  // Load available engines for the modal
  useEffect(() => {
    const loadEngines = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/engines');
        if (response.ok) {
          const data = await response.json();
          setAvailableEngines(data.engines || []);
        }
      } catch (error) {
        console.error('Failed to load engines:', error);
        // Fallback
        setAvailableEngines([
          { id: 'yaneuraou', name: 'YaneuraOu' },
          { id: 'fairy-stockfish', name: 'Fairy-Stockfish' }
        ]);
      }
    };
    loadEngines();
  }, []);

  const handleGetHint = async () => {
    if (!gameState || !currentSession) return;

    setIsLoading(true);
    try {
      // Get hint from session-based API
      const hintResponse: HintResponse = await getHint(currentSession.session_id);
      const { analysis, side } = hintResponse;
      
      // Determine message type based on side
      const messageType = side === 'black' ? 'engine-black' : 'engine-white';
      const playerColor = side === 'black' ? 'Black' : 'White';

      // Add user question
      setMessages(prev => [
        ...prev,
        {
          role: 'user',
          content: `Give me a hint for ${playerColor}`
        }
      ]);
      
      // Add hint as engine-specific message with structured data
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '', // Content will be rendered from hintData
          messageType: messageType,
          engineName: analysis.engine_name,
          hintData: {
            bestmove: analysis.bestmove,
            bestmove_algebraic: analysis.bestmove_algebraic,
            score_cp: analysis.score_cp,
            mate: analysis.mate,
            pv_algebraic: analysis.pv_algebraic,
            alternatives: analysis.alternatives
          }
        }
      ]);
      // Play sound for hint messages
      audioManager.playUISound('message');
    } catch (error) {
      console.error('Failed to get hint:', error);
      addAssistantMessage('⚠️ Could not get hint. Make sure an engine is assigned to the current player.', 'system');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (apiKey: string, useLLMSetting: boolean, showBestMoveSetting: boolean, showBoardOptionsSetting: boolean) => {
    // Only update API key if a new one was provided
    if (apiKey && apiKey.trim()) {
      await updateConfig(apiKey);
      setCurrentApiKey(apiKey);
    }
    setUseLLM(useLLMSetting);
    setShowBestMove(showBestMoveSetting);
    setShowBoardOptionsPanel(showBoardOptionsSetting);
    
    // Save UI settings to backend file
    await saveUISettings({
      useLLM: useLLMSetting,
      showBestMove: showBestMoveSetting,
      showBoardOptionsPanel: showBoardOptionsSetting,
    });
  };

  const handleSaveSoundSettings = (settings: SoundSettings) => {
    setSoundSettings(settings);
    audioManager.updateSettings(settings);
  };

  const handleSoundToggle = async (category: 'ui' | 'music' | 'ambient', enabled: boolean) => {
    // Update local state
    if (category === 'ui') setUiSoundEnabled(enabled);
    if (category === 'music') setMusicSoundEnabled(enabled);
    if (category === 'ambient') setAmbientSoundEnabled(enabled);
    
    // Save to UI preferences
    const prefUpdate: Partial<{ uiSoundEnabled: boolean; musicSoundEnabled: boolean; ambientSoundEnabled: boolean }> = {};
    if (category === 'ui') prefUpdate.uiSoundEnabled = enabled;
    if (category === 'music') prefUpdate.musicSoundEnabled = enabled;
    if (category === 'ambient') prefUpdate.ambientSoundEnabled = enabled;
    await saveUISettings(prefUpdate);
    
    // Update actual playing state (must check master mute)
    const uiSettings = await loadUISettings();
    const newSettings = { ...soundSettings };
    if (category === 'ui') newSettings.uiEnabled = enabled && !uiSettings.allSoundsMuted;
    if (category === 'music') newSettings.musicEnabled = enabled && !uiSettings.allSoundsMuted;
    if (category === 'ambient') newSettings.ambientEnabled = enabled && !uiSettings.allSoundsMuted;
    setSoundSettings(newSettings);
    audioManager.updateSettings(newSettings);
  };

  const handleToggleAllSounds = async () => {
    // Toggle master mute state
    const newMutedState = !allSoundsMuted;
    setAllSoundsMuted(newMutedState);
    
    // Save master mute state to UI preferences
    await saveUISettings({ allSoundsMuted: newMutedState });
    
    // Get current UI preferences for individual sound settings
    const uiSettings = await loadUISettings();
    
    // Update actual playing state based on enabled settings and new mute state
    const newSettings = {
      ...soundSettings,
      uiEnabled: uiSettings.uiSoundEnabled && !newMutedState,
      musicEnabled: uiSettings.musicSoundEnabled && !newMutedState,
      ambientEnabled: uiSettings.ambientSoundEnabled && !newMutedState
    };
    setSoundSettings(newSettings);
    audioManager.updateSettings(newSettings);
  };

  const handleOpenLearn = async () => {
    // Check if running in Electron
    if (typeof window !== 'undefined' && window.electron) {
      // In Electron, toggle learn window via IPC
      const isOpen = await window.electron.isLearnWindowOpen();
      if (isOpen) {
        await window.electron.closeLearnWindow();
      } else {
        await window.electron.openLearnWindow();
      }
    } else {
      // In browser, open in new tab
      window.open('/learn', '_blank');
    }
  };

  const handleOpenEngineManagement = () => {
    // Auto-pause clock when opening engine management
    if (isClockRunning) {
      setIsClockRunning(false);
      // Save accumulated time
      if (clockStartTimeRef.current) {
        const elapsed = Date.now() - clockStartTimeRef.current;
        accumulatedTimeRef.current += elapsed;
      }
    }
    setIsEngineManagementOpen(true);
  };

  const handleCloseEngineManagement = () => {
    setIsEngineManagementOpen(false);
    // Reload engine config to update best move button availability
    loadEngineConfig();
    
    // Return to new game modal if we came from there
    if (returnToNewGameModal) {
      setReturnToNewGameModal(false);
      setIsNewGameModalOpen(true);
    }
    
    // Return to game mode settings if we came from there
    if (returnToGameModeSettings) {
      setReturnToGameModeSettings(false);
      setIsGameModeSettingsOpen(true);
    }
  };

  // Open Game Mode Settings (pauses the clock)
  const handleOpenGameModeSettings = () => {
    // Pause clock if running
    if (isClockRunning) {
      setIsClockRunning(false);
      // Save accumulated time
      if (clockStartTimeRef.current > 0) {
        const elapsed = Date.now() - clockStartTimeRef.current;
        accumulatedTimeRef.current += elapsed;
      }
    }
    setIsGameModeSettingsOpen(true);
  };

  // Close Game Mode Settings
  const handleCloseGameModeSettings = () => {
    setIsGameModeSettingsOpen(false);
  };

  // Save Game Mode Settings
  const handleSaveGameModeSettings = async (settings: GameModeSettings) => {
    if (!currentSession) return;
    
    try {
      // Determine the new mode
      let newMode: string;
      if (settings.blackPlayer === 'human' && settings.whitePlayer === 'human') {
        newMode = 'human_vs_human';
      } else if (settings.blackPlayer === 'computer' && settings.whitePlayer === 'computer') {
        newMode = 'computer_vs_computer';
      } else {
        newMode = 'human_vs_computer';
      }
      
      // Update the session via API
      const response = await fetch(`http://127.0.0.1:8000/session/${currentSession.session_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          black_player: settings.blackPlayer === 'computer' ? (engineConfig?.black.engineId || 'yaneuraou') : 'human',
          white_player: settings.whitePlayer === 'computer' ? (engineConfig?.white.engineId || 'yaneuraou') : 'human',
          black_name: settings.blackName || undefined,
          white_name: settings.whiteName || undefined,
          mode: newMode,
        }),
      });
      
      if (response.ok) {
        // Refresh session
        const updatedSession = await getSession(currentSession.session_id);
        setCurrentSession(updatedSession);
        
        addAssistantMessage(
          `Game mode updated to **${newMode.replace(/_/g, ' ')}**`,
          'system'
        );
      }
    } catch (error) {
      console.error('Failed to update game mode settings:', error);
    }
  };

  // Helper to add assistant message with sound
  const addAssistantMessage = (content: string, messageType?: 'system' | 'llm' | 'engine-black' | 'engine-white', engineName?: string) => {
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content,
      messageType,
      engineName
    }]);
    // Only play sound for LLM messages
    if (messageType === 'llm') {
      audioManager.playUISound('message');
    }
  };

  const handleClockToggle = () => {
    const willStart = !isClockRunning;
    setIsClockRunning(willStart);
    if (willStart && clockStartTimeRef.current === 0) {
      clockStartTimeRef.current = Date.now();
      lastMoveTimeRef.current = Date.now();
    }
    // Play appropriate sound
    audioManager.playUISound(willStart ? 'start' : 'pause');
  };

  const handleBestMove = async () => {
    if (!gameState || isLoading) return;

    try {
      setIsLoading(true);
      
      // Get hint from session (which gives us the best move)
      if (!currentSession) {
        throw new Error('No active session');
      }
      
      const hintResponse = await getHint(currentSession.session_id);
      const bestMove = hintResponse.analysis.bestmove;
      
      // Execute the best move
      if (!isClockRunning) {
        // If clock not running, need to show modal first
        setPendingMove(bestMove);
        setShowClockStartModal(true);
      } else {
        // Clock is running, execute immediately
        await executeMove(bestMove);
      }
    } catch (error) {
      console.error('Failed to get best move:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to get best move. Please try again.',
        messageType: 'system'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevertToMove = async (moveIndex: number) => {
    try {
      setIsLoading(true);
      
      // Get the target move info BEFORE any operations
      const targetMove = moveHistory[moveIndex];
      if (!targetMove || !currentSession) return;
      
      const targetMoveNumber = targetMove.moveNumber;
      const targetMoveName = targetMove.move;
      const oldMoveCount = moveHistory.length;
      
      // Step 1: Delete moves after the target move from database
      await fetch(`http://localhost:8000/session/${currentSession.session_id}/moves/${targetMoveNumber}`, {
        method: 'DELETE'
      });
      
      // Step 2: Refresh session to get clean data
      const updatedSession = await getSession(currentSession.session_id);
      setCurrentSession(updatedSession);
      
      // Step 3: Get the SFEN from the REFRESHED session's last move
      const lastMove = updatedSession.moves[updatedSession.moves.length - 1];
      const targetSfen = lastMove ? lastMove.position_after : 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
      
      // Step 4: Update session's current_sfen to match
      const updateResponse = await fetch(`http://localhost:8000/session/${currentSession.session_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_sfen: targetSfen })
      });
      
      // Wait for the response to ensure the update is committed
      await updateResponse.json();
      
      // Small delay to ensure database transaction is fully committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const state = await getGameState(targetSfen);
      setGameState(state);
      
      // Calculate cumulative timestamps for move history
      let cumulativeTime = 0;
      setMoveHistory(updatedSession.moves.map((m: MoveRecordBackend) => {
        cumulativeTime += m.time_spent * 1000; // Convert to ms and accumulate
        return {
          moveNumber: m.move_number,
          player: (m.player === 'black' ? 'b' : 'w') as 'b' | 'w',
          move: m.move_algebraic,
          timestamp: cumulativeTime,
          timeSinceLastMove: m.time_spent * 1000,
          sfen: m.position_after
        };
      }));
      
      // Set last move highlight to the move we reverted to (or null if at start)
      const lastMoveRecord = updatedSession.moves[updatedSession.moves.length - 1];
      setLastMoveUsi(lastMoveRecord ? lastMoveRecord.move_usi : null);
      
      const removedCount = oldMoveCount - targetMoveNumber;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🔄 **Reverted to move ${targetMoveNumber}** (${targetMoveName})\n\n${removedCount > 0 ? `Moves ${targetMoveNumber + 1}-${oldMoveCount} removed from board.\n` : ''}Analysis for reverted moves preserved above for review.`,
        messageType: 'system'
      }]);
    } catch (error) {
      console.error('Failed to revert to move:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to revert to the selected move. Please try again.',
        messageType: 'system'
      }]);
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
        content: 'Clock started! Time tracking begins now.',
        messageType: 'system'
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
    <main className="min-h-screen">
      <div className="max-w-full h-screen">
        <ConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          onSave={handleSaveConfig}
          currentUseLLM={useLLM}
          currentApiKey={currentApiKey}
          currentShowBestMove={showBestMove}
          currentShowBoardOptions={showBoardOptionsPanel}
          onOpenSounds={() => setIsSoundSettingsOpen(true)}
          onOpenResources={() => setIsResourcesOpen(true)}
          soundToggles={{
            uiEnabled: uiSoundEnabled,
            musicEnabled: musicSoundEnabled,
            ambientEnabled: ambientSoundEnabled
          }}
          onSoundToggle={handleSoundToggle}
        />

        <SoundSettingsModal
          isOpen={isSoundSettingsOpen}
          onClose={() => setIsSoundSettingsOpen(false)}
          onSave={handleSaveSoundSettings}
          currentSettings={soundSettings}
        />

        <ResumeSessionModal
          isOpen={showResumeModal}
          lastSession={lastSession}
          onResume={resumeSession}
          onNewGame={() => {
            setShowResumeModal(false);
            loadInitialGame();
          }}
        />

        <NewGameModal
          isOpen={isNewGameModalOpen}
          onClose={() => setIsNewGameModalOpen(false)}
          onStartGame={handleStartNewGame}
          onImportGame={handleImportGame}
          currentEngineConfig={engineConfig ? {
            black: { 
              engineId: engineConfig.black.engineId, 
              engineName: availableEngines.find(e => e.id === engineConfig.black.engineId)?.name || engineConfig.black.engineId || 'Not configured'
            },
            white: { 
              engineId: engineConfig.white.engineId, 
              engineName: availableEngines.find(e => e.id === engineConfig.white.engineId)?.name || engineConfig.white.engineId || 'Not configured'
            }
          } : null}
          onOpenEngineManagement={() => {
            setReturnToNewGameModal(true);
            setIsEngineManagementOpen(true);
          }}
        />

        <ExportGameModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          onExport={handleExportGame}
          currentWhiteName={currentSession?.white_name || 'Guest'}
          currentBlackName={currentSession?.black_name || 'Guest'}
        />

        <GameModeSettingsModal
          isOpen={isGameModeSettingsOpen}
          onClose={handleCloseGameModeSettings}
          onSave={handleSaveGameModeSettings}
          currentSettings={{
            blackPlayer: currentSession?.black_player === 'human' ? 'human' : 'computer',
            whitePlayer: currentSession?.white_player === 'human' ? 'human' : 'computer',
            blackName: currentSession?.black_name || '',
            whiteName: currentSession?.white_name || '',
          }}
          currentEngineConfig={engineConfig ? {
            black: { 
              engineId: engineConfig.black.engineId, 
              engineName: availableEngines.find(e => e.id === engineConfig.black.engineId)?.name || engineConfig.black.engineId || 'Not configured'
            },
            white: { 
              engineId: engineConfig.white.engineId, 
              engineName: availableEngines.find(e => e.id === engineConfig.white.engineId)?.name || engineConfig.white.engineId || 'Not configured'
            }
          } : null}
          onOpenEngineManagement={() => {
            setReturnToGameModeSettings(true);
            setIsGameModeSettingsOpen(false);
            setIsEngineManagementOpen(true);
          }}
          onStartNewGame={() => {
            setIsGameModeSettingsOpen(false);
            setIsNewGameModalOpen(true);
          }}
        />

        {/* Clock Start Confirmation Modal */}
        {showClockStartModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
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

        {/* Engine Management Modal */}
        <EngineManagementModal 
          isOpen={isEngineManagementOpen}
          onClose={handleCloseEngineManagement}
        />

        {/* Resources & LLM Window */}
        <ResourcesWindow 
          isOpen={isResourcesOpen}
          onClose={() => setIsResourcesOpen(false)}
          sessionId={currentSession?.session_id}
        />

        <div className="flex h-screen">
          {/* Sidebar */}
          <Sidebar 
            onOpenSettings={() => setIsConfigOpen(true)}
            allSoundsEnabled={!allSoundsMuted}
            onToggleAllSounds={handleToggleAllSounds}
            onOpenLearn={handleOpenLearn}
            onOpenEngineManagement={handleOpenEngineManagement}
            onOpenGameModeSettings={handleOpenGameModeSettings}
          />

          {/* Main Content */}
          <div className="flex gap-3 flex-1 p-4">
            {/* Left Column: Move History with Clock */}
            <div className="w-[300px] shrink-0 h-full">
            <MoveHistory 
              moves={moveHistory} 
              currentTurn={(gameState?.turn as 'b' | 'w') || 'b'}
              isClockRunning={isClockRunning}
              onClockToggle={handleClockToggle}
              gameTime={gameTime}
              onNewGame={handleNewGame}
              isGameOver={gameState?.is_game_over || false}
              onRevertToMove={handleRevertToMove}
            />
          </div>

          {/* Center Column: Board */}
          <div className="shrink-0 flex flex-col items-center gap-4">
            {gameState ? (
              <>
                <ShogiBoard 
                  gameState={gameState} 
                  onMove={canUserInteract() ? handleMove : () => {}}
                  showBestMove={showBestMove && canUseHintButtons()}
                  onBestMove={canUseHintButtons() ? handleBestMove : () => {}}
                  isLoading={isLoading || isComputerThinking}
                  engineConfig={engineConfig || undefined}
                  showBoardOptionsPanel={showBoardOptionsPanel}
                  lastMoveUsi={lastMoveUsi}
                  playerNames={currentSession ? { 
                    black: currentSession.black_name || 'Black', 
                    white: currentSession.white_name || 'White' 
                  } : undefined}
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-text-secondary">Loading game...</div>
              </div>
            )}
          </div>

          {/* Right Column: Chat Interface - Expands to fill remaining space */}
          <div className="flex-1 min-w-[400px] h-full">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onGetHint={handleGetHint}
            />
          </div>
          </div>
        </div>
      </div>
    </main>
  );
}
