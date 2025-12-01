'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  SkipForward, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Lightbulb, Loader2, Trophy, RotateCcw, Settings
} from 'lucide-react';
import ShogiBoard from '@/components/ShogiBoard';
import { getGameState } from '@/lib/api';
import { GameState } from '@/types/game';

interface MoveRecord {
  move_usi: string;
  move_notation: string;
  sfen_after: string;
  is_player_move: boolean;
}

interface PuzzleState {
  original_sfen: string;
  current_sfen: string;
  moves_to_mate: number;
  side_to_move: 'b' | 'w';
  moves_made: number;
  move_history: MoveRecord[];
  is_complete: boolean;
  is_failed: boolean;
}

interface HintData {
  bestmove: string;
  bestmove_algebraic: string;
  score_cp: number | null;
  mate: number | null;
  pv_algebraic: string[];
  alternatives?: Array<{
    move_usi: string;
    move_algebraic: string;
    score_cp: number | null;
    mate: number | null;
    pv_algebraic: string[];
  }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  messageType?: 'system' | 'hint' | 'success' | 'error';
  hintData?: HintData;
}

interface PuzzleSettings {
  minMoves: number;
  maxMoves: number;
}

export default function EndgameTrainingPage() {
  // Puzzle state
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMoveIndex, setSelectedMoveIndex] = useState<number>(-1);
  
  // Settings
  const [settings, setSettings] = useState<PuzzleSettings>({ minMoves: 3, maxMoves: 11 });
  const [showSettingsModal, setShowSettingsModal] = useState(true);
  
  // Teacher panel
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHintLoading, setIsHintLoading] = useState(false);
  
  // Stats
  const [puzzlesSolved, setPuzzlesSolved] = useState(0);
  const [puzzlesAttempted, setPuzzlesAttempted] = useState(0);
  
  // Refs
  const moveListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Set window title
  useEffect(() => {
    document.title = 'Endgame Training - Tsume Shogi';
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load puzzle settings from electron if available
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const electron = (window as Window & { 
      electron?: { 
        onEndgameSettings: (cb: (settings: PuzzleSettings) => void) => () => void 
      } 
    }).electron;
    
    if (electron?.onEndgameSettings) {
      const unsubscribe = electron.onEndgameSettings((s) => {
        setSettings(s);
        setShowSettingsModal(false);
        loadNewPuzzle(s.minMoves, s.maxMoves);
      });
      return unsubscribe;
    }
  }, []);

  // Fetch game state for board display
  const updateBoardState = useCallback(async (sfen: string) => {
    try {
      const state = await getGameState(sfen);
      setGameState(state);
    } catch (error) {
      console.error('Failed to get game state:', error);
    }
  }, []);

  // Load a new puzzle
  const loadNewPuzzle = async (minMoves?: number, maxMoves?: number) => {
    setIsLoading(true);
    setMessages([]);
    
    const min = minMoves ?? settings.minMoves;
    const max = maxMoves ?? settings.maxMoves;
    
    try {
      const response = await fetch('http://127.0.0.1:8000/puzzle/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_moves: min, max_moves: max }),
      });
      
      if (!response.ok) throw new Error('Failed to load puzzle');
      
      const data = await response.json();
      
      const newPuzzle: PuzzleState = {
        original_sfen: data.sfen,
        current_sfen: data.sfen,
        moves_to_mate: data.moves_to_mate,
        side_to_move: data.side_to_move,
        moves_made: 0,
        move_history: [],
        is_complete: false,
        is_failed: false,
      };
      
      setPuzzle(newPuzzle);
      setSelectedMoveIndex(-1);
      setPuzzlesAttempted(prev => prev + 1);
      await updateBoardState(data.sfen);
      
      // Welcome message
      const playerColor = data.side_to_move === 'b' ? 'Black' : 'White';
      setMessages([{
        role: 'assistant',
        content: `**Mate in ${data.moves_to_mate}**\n\nYou are playing as ${playerColor}. Find the checkmate sequence!`,
        messageType: 'system'
      }]);
      
    } catch (error) {
      console.error('Failed to load puzzle:', error);
      setMessages([{
        role: 'assistant',
        content: 'Failed to load puzzle. Please check that the backend is running.',
        messageType: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle player move (receives USI string from ShogiBoard)
  const handleMove = async (moveUsi: string) => {
    if (!puzzle || puzzle.is_complete || puzzle.is_failed || isLoading) return;
    
    setIsLoading(true);
    
    try {
      // Verify the move
      const response = await fetch('http://127.0.0.1:8000/puzzle/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sfen: puzzle.current_sfen,
          move_usi: moveUsi,
          target_moves: puzzle.moves_to_mate,
          moves_made: puzzle.moves_made,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to verify move');
      
      const result = await response.json();
      
      if (result.is_correct) {
        // Get the notation for the player's move
        const stateAfterMove = await getGameState(puzzle.current_sfen + ' moves ' + moveUsi);
        const playerMoveNotation = moveUsi; // We'll use the move directly for now
        
        // Add player's move to history
        const newMoveHistory = [...puzzle.move_history, {
          move_usi: moveUsi,
          move_notation: playerMoveNotation,
          sfen_after: stateAfterMove?.sfen || puzzle.current_sfen,
          is_player_move: true,
        }];
        
        if (result.is_puzzle_complete) {
          // Puzzle solved!
          setPuzzle({
            ...puzzle,
            current_sfen: stateAfterMove?.sfen || puzzle.current_sfen,
            moves_made: puzzle.moves_made + 1,
            move_history: newMoveHistory,
            is_complete: true,
          });
          setPuzzlesSolved(prev => prev + 1);
          setSelectedMoveIndex(newMoveHistory.length - 1);
          await updateBoardState(stateAfterMove?.sfen || puzzle.current_sfen);
          
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `🎉 **${result.message}**\n\nExcellent work! Click "Next Puzzle" to continue.`,
            messageType: 'success'
          }]);
        } else {
          // Correct move, opponent responds
          if (result.opponent_move && result.new_sfen) {
            newMoveHistory.push({
              move_usi: result.opponent_move,
              move_notation: result.opponent_move_notation || result.opponent_move,
              sfen_after: result.new_sfen,
              is_player_move: false,
            });
            
            setPuzzle({
              ...puzzle,
              current_sfen: result.new_sfen,
              moves_made: puzzle.moves_made + 2, // Player + opponent
              move_history: newMoveHistory,
            });
            setSelectedMoveIndex(newMoveHistory.length - 1);
            await updateBoardState(result.new_sfen);
            
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✓ Correct! Opponent plays: **${result.opponent_move_notation || result.opponent_move}**\n\nContinue the attack...`,
              messageType: 'system'
            }]);
          }
        }
      } else {
        // Wrong move
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✗ **Incorrect move.**\n\n${result.message}`,
          messageType: 'error'
        }]);
      }
      
    } catch (error) {
      console.error('Move verification failed:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to verify move. Please try again.',
        messageType: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Request hint - uses dedicated puzzle hint endpoint for accurate tsume solving
  const requestHint = async () => {
    if (!puzzle || puzzle.is_complete || isHintLoading) return;
    
    setIsHintLoading(true);
    
    try {
      // Use puzzle-specific hint endpoint that uses SeoTsume for accurate mate finding
      const response = await fetch('http://127.0.0.1:8000/puzzle/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sfen: puzzle.current_sfen,
          target_moves: puzzle.moves_to_mate,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get hint');
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis: any = await response.json();
      
      if (analysis && analysis.bestmove) {
        const mateInfo = analysis.mate ? `\nMate in ${Math.abs(analysis.mate)}` : '';
        const warningInfo = analysis.warning ? `\n\n⚠️ ${analysis.warning}` : '';
        const isOptimal = analysis.is_optimal;
        
        // If hint is not optimal, encourage user to find the better solution
        const hintContent = isOptimal 
          ? `💡 **Hint**\n\nBest move: **${analysis.bestmove_notation || analysis.bestmove}**${mateInfo}`
          : `💡 **Hint** (not optimal)\n\nEngine suggests: **${analysis.bestmove_notation || analysis.bestmove}**${mateInfo}${warningInfo}`;
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: hintContent,
          messageType: 'hint',
          hintData: {
            bestmove: analysis.bestmove,
            bestmove_algebraic: analysis.bestmove_notation || analysis.bestmove,
            score_cp: analysis.score_cp,
            mate: analysis.mate,
            pv_algebraic: [],
            alternatives: [],
          },
        }]);
      }
    } catch (error) {
      console.error('Failed to get hint:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Failed to get hint. Please try again.',
        messageType: 'error',
      }]);
    } finally {
      setIsHintLoading(false);
    }
  };

  // Reset current puzzle
  const resetPuzzle = () => {
    if (!puzzle) return;
    
    setPuzzle({
      ...puzzle,
      current_sfen: puzzle.original_sfen,
      moves_made: 0,
      move_history: [],
      is_complete: false,
      is_failed: false,
    });
    setSelectedMoveIndex(-1);
    updateBoardState(puzzle.original_sfen);
    
    const playerColor = puzzle.side_to_move === 'b' ? 'Black' : 'White';
    setMessages([{
      role: 'assistant',
      content: `**Puzzle Reset - Mate in ${puzzle.moves_to_mate}**\n\nYou are playing as ${playerColor}. Find the checkmate sequence!`,
      messageType: 'system'
    }]);
  };

  // Navigate move history
  const goToMove = (index: number) => {
    if (!puzzle) return;
    
    if (index === -1) {
      setSelectedMoveIndex(-1);
      updateBoardState(puzzle.original_sfen);
    } else if (puzzle.move_history[index]) {
      setSelectedMoveIndex(index);
      updateBoardState(puzzle.move_history[index].sfen_after);
    }
  };

  // Handle settings confirm
  const handleSettingsConfirm = () => {
    setShowSettingsModal(false);
    loadNewPuzzle();
  };

  // Render settings modal
  if (showSettingsModal) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="bg-background-secondary border border-border rounded-xl p-8 max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold text-text-primary mb-2 text-center">
            Endgame Training
          </h1>
          <p className="text-text-secondary mb-6 text-center">
            Tsume Shogi - Checkmate Puzzles
          </p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Puzzle Difficulty Range
              </label>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-text-secondary">Min Moves</label>
                  <select
                    value={settings.minMoves}
                    onChange={(e) => setSettings(s => ({ 
                      ...s, 
                      minMoves: Number(e.target.value),
                      maxMoves: Math.max(Number(e.target.value), s.maxMoves)
                    }))}
                    className="w-full mt-1 p-2 bg-background-primary border border-border rounded-lg text-text-primary"
                  >
                    {[3, 5, 7, 9, 11].map(n => (
                      <option key={n} value={n}>Mate in {n}</option>
                    ))}
                  </select>
                </div>
                <div className="text-text-secondary pt-5">to</div>
                <div className="flex-1">
                  <label className="text-xs text-text-secondary">Max Moves</label>
                  <select
                    value={settings.maxMoves}
                    onChange={(e) => setSettings(s => ({ 
                      ...s, 
                      maxMoves: Number(e.target.value),
                      minMoves: Math.min(s.minMoves, Number(e.target.value))
                    }))}
                    className="w-full mt-1 p-2 bg-background-primary border border-border rounded-lg text-text-primary"
                  >
                    {[3, 5, 7, 9, 11].map(n => (
                      <option key={n} value={n}>Mate in {n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Select the range of puzzle difficulties you want to practice.
              </p>
            </div>
            
            <button
              onClick={handleSettingsConfirm}
              className="w-full py-3 px-4 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-lg font-medium transition-colors"
            >
              Start Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main training view
  return (
    <div className="h-screen bg-background-primary flex overflow-hidden">
      {/* Left Panel - Move History */}
      <div className="w-64 bg-background-secondary border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">Move History</h2>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 rounded-lg hover:bg-background-primary transition-colors group"
              title="Puzzle Settings"
            >
              <Settings className="w-4 h-4 text-text-secondary group-hover:text-accent-cyan transition-colors" />
            </button>
          </div>
          {puzzle && (
            <div className="text-sm text-text-secondary mt-1">
              Mate in {puzzle.moves_to_mate} • {puzzle.side_to_move === 'b' ? 'Black' : 'White'} to move
            </div>
          )}
        </div>
        
        {/* Move List */}
        <div ref={moveListRef} className="flex-1 overflow-y-auto p-2">
          {/* Starting position */}
          <button
            onClick={() => goToMove(-1)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedMoveIndex === -1
                ? 'bg-accent-purple/20 text-accent-purple'
                : 'hover:bg-background-primary text-text-secondary'
            }`}
          >
            Start Position
          </button>
          
          {/* Moves */}
          {puzzle?.move_history.map((move, i) => (
            <button
              key={i}
              onClick={() => goToMove(i)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                selectedMoveIndex === i
                  ? 'bg-accent-purple/20 text-accent-purple'
                  : 'hover:bg-background-primary text-text-primary'
              }`}
            >
              <span className="w-6 text-text-secondary">{i + 1}.</span>
              <span className={move.is_player_move ? 'text-accent-cyan' : 'text-text-secondary'}>
                {move.move_notation}
              </span>
              {move.is_player_move && <span className="text-xs text-accent-cyan">★</span>}
            </button>
          ))}
        </div>
        
        {/* Navigation & Actions */}
        <div className="p-3 border-t border-border space-y-2">
          {/* Navigation buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => goToMove(-1)}
              className="flex-1 p-2 bg-background-primary hover:bg-border rounded-lg transition-colors"
              title="Go to start"
            >
              <ChevronsLeft className="w-4 h-4 mx-auto text-text-secondary" />
            </button>
            <button
              onClick={() => goToMove(Math.max(-1, selectedMoveIndex - 1))}
              className="flex-1 p-2 bg-background-primary hover:bg-border rounded-lg transition-colors"
              title="Previous move"
            >
              <ChevronLeft className="w-4 h-4 mx-auto text-text-secondary" />
            </button>
            <button
              onClick={() => goToMove(Math.min((puzzle?.move_history.length || 0) - 1, selectedMoveIndex + 1))}
              className="flex-1 p-2 bg-background-primary hover:bg-border rounded-lg transition-colors"
              title="Next move"
            >
              <ChevronRight className="w-4 h-4 mx-auto text-text-secondary" />
            </button>
            <button
              onClick={() => goToMove((puzzle?.move_history.length || 0) - 1)}
              className="flex-1 p-2 bg-background-primary hover:bg-border rounded-lg transition-colors"
              title="Go to end"
            >
              <ChevronsRight className="w-4 h-4 mx-auto text-text-secondary" />
            </button>
          </div>
          
          {/* Reset button */}
          <button
            onClick={resetPuzzle}
            disabled={!puzzle || puzzle.move_history.length === 0}
            className="w-full py-2 px-4 bg-background-primary hover:bg-border text-text-primary rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Puzzle
          </button>
          
          {/* Next Puzzle button */}
          <button
            onClick={() => loadNewPuzzle()}
            disabled={isLoading}
            className="w-full py-2 px-4 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <SkipForward className="w-4 h-4" />
            )}
            Next Puzzle
          </button>
        </div>
      </div>
      
      {/* Center - Board (same layout as analysis page) */}
      <div className="flex flex-col p-4 pt-2">
        <div className="max-w-[550px] w-full">
          {gameState ? (
            <ShogiBoard
              gameState={gameState}
              onMove={(!puzzle?.is_complete && !puzzle?.is_failed && !isLoading) ? handleMove : () => {}}
            />
          ) : (
            <div className="aspect-square bg-background-secondary rounded-lg flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-text-secondary" />
            </div>
          )}
          
          {/* Stats bar */}
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-text-secondary">Solved:</span>
              <span className="text-text-primary font-medium">{puzzlesSolved}</span>
            </div>
            <div className="text-text-secondary">
              Attempted: {puzzlesAttempted}
            </div>
            {puzzlesAttempted > 0 && (
              <div className="text-text-secondary">
                Rate: {Math.round((puzzlesSolved / puzzlesAttempted) * 100)}%
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Right Panel - Teacher (expands to fill remaining space) */}
      <div className="flex-1 bg-background-secondary border-l border-border flex flex-col h-screen">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Shogi Teacher</h2>
          <button
            onClick={requestHint}
            disabled={!puzzle || puzzle.is_complete || isHintLoading}
            className="px-3 py-1.5 bg-accent-cyan hover:bg-accent-cyan/80 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isHintLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lightbulb className="w-4 h-4" />
            )}
            Hint
          </button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg ${
                msg.messageType === 'success'
                  ? 'bg-green-500/10 border border-green-500/30'
                  : msg.messageType === 'error'
                  ? 'bg-red-500/10 border border-red-500/30'
                  : msg.messageType === 'hint'
                  ? 'bg-accent-cyan/10 border border-accent-cyan/30'
                  : 'bg-background-primary'
              }`}
            >
              <div 
                className="text-sm text-text-primary prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ 
                  __html: msg.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br/>') 
                }}
              />
              
              {/* Hint details */}
              {msg.hintData && msg.hintData.alternatives && msg.hintData.alternatives.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs text-text-secondary mb-2">Alternative moves:</div>
                  <div className="space-y-1">
                    {msg.hintData.alternatives.slice(0, 3).map((alt, j) => (
                      <div key={j} className="text-xs text-text-secondary flex justify-between">
                        <span>{alt.move_algebraic}</span>
                        <span>{alt.mate ? `M${alt.mate}` : alt.score_cp ? `${alt.score_cp}cp` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Puzzle complete overlay */}
        {puzzle?.is_complete && (
          <div className="p-4 border-t border-border bg-green-500/10">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <Trophy className="w-5 h-5" />
              <span className="font-semibold">Puzzle Solved!</span>
            </div>
            <button
              onClick={() => loadNewPuzzle()}
              className="w-full py-2 px-4 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-lg font-medium transition-colors"
            >
              Next Puzzle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
