'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Upload, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  TrendingUp, Loader2
} from 'lucide-react';
import ShogiBoard from '@/components/ShogiBoard';
import { getGameState } from '@/lib/api';
import { GameState } from '@/types/game';

// Move quality indicators
type MoveQuality = 'brilliant' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book' | 'unknown';

interface MoveAnalysis {
  move_usi: string;
  move_notation: string;
  sfen_after: string;
  quality: MoveQuality;
  eval_before: number | null; // centipawns from side to move's perspective
  eval_after: number | null;  // centipawns from opponent's perspective (needs flip)
  cp_loss: number | null;     // centipawn loss (positive = worse than engine)
  best_move?: string;
  best_move_notation?: string;
  played_best_move?: boolean;
  alternatives?: Array<{
    move_usi: string;
    move_notation: string;
    eval: number;
    continuation?: string[];  // Full PV line
  }>;
  analyzed: boolean;
}

interface GameData {
  moves: MoveAnalysis[];
  startingSfen: string;
  blackName: string;
  whiteName: string;
}

const QUALITY_CONFIG: Record<MoveQuality, { symbol: string; color: string; label: string }> = {
  brilliant: { symbol: '!!', color: 'text-cyan-400', label: 'Brilliant' },   // Better than engine (≤0cp loss)
  excellent: { symbol: '!', color: 'text-green-400', label: 'Excellent' },   // Engine\'s choice (≤10cp loss)
  good: { symbol: '✓', color: 'text-green-300', label: 'Good' },             // Minor difference (≤30cp loss)
  inaccuracy: { symbol: '?!', color: 'text-yellow-400', label: 'Inaccuracy' }, // Small mistake (≤100cp loss)
  mistake: { symbol: '?', color: 'text-orange-400', label: 'Mistake' },      // Significant error (≤300cp loss)
  blunder: { symbol: '??', color: 'text-red-400', label: 'Blunder' },        // Major error (>300cp loss)
  book: { symbol: '📖', color: 'text-blue-400', label: 'Book' },
  unknown: { symbol: '', color: 'text-text-secondary', label: 'Not analyzed' },
};

export default function AnalysisPage() {
  // Game state
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [selectedMoveIndex, setSelectedMoveIndex] = useState<number>(-1); // -1 = starting position
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [evalToggle, setEvalToggle] = useState<'centipawn' | 'winrate'>('centipawn');
  
  // UI state
  const [showLoadDialog, setShowLoadDialog] = useState(true);
  const [pendingCurrentGame, setPendingCurrentGame] = useState<{
    moves: Array<{ move_usi: string; move_notation: string; sfen_after: string }>;
    startingSfen?: string;
    blackName?: string;
    whiteName?: string;
  } | null>(null);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moveListRef = useRef<HTMLDivElement>(null);
  const moveRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const shouldStartAnalysis = useRef(false);

  // Set window title
  useEffect(() => {
    document.title = 'Game Record Analysis';
  }, []);
  
  // Update board state helper
  const updateBoardState = useCallback(async (sfen: string) => {
    try {
      const state = await getGameState(sfen);
      setGameState(state);
    } catch (error) {
      console.error('Failed to get game state:', error);
    }
  }, []);

  // Load game from moves
  const loadGameFromMoves = useCallback((
    moves: Array<{ move_usi: string; move_notation: string; sfen_after: string }>,
    startingSfen?: string,
    blackName?: string,
    whiteName?: string
  ) => {
    const starting = startingSfen || 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
    const analyzedMoves: MoveAnalysis[] = moves.map(m => ({
      move_usi: m.move_usi,
      move_notation: m.move_notation,
      sfen_after: m.sfen_after,
      quality: 'unknown' as MoveQuality,
      eval_before: null,
      eval_after: null,
      cp_loss: null,
      played_best_move: false,
      analyzed: false,
    }));
    
    setGameData({
      moves: analyzedMoves,
      startingSfen: starting,
      blackName: blackName || 'Black',
      whiteName: whiteName || 'White',
    });
    setSelectedMoveIndex(-1);
    updateBoardState(starting);
    
    // Flag to start analysis after state update
    shouldStartAnalysis.current = true;
  }, [updateBoardState]);

  // Listen for initial data from main window
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const electron = (window as Window & { electron?: { onAnalysisInitialData: (cb: (data: { type: string; moves?: Array<{ move_usi: string; move_notation: string; sfen_after: string }>; startingSfen?: string; blackName?: string; whiteName?: string }) => void) => () => void } }).electron;
    if (!electron) return;
    
    const unsubscribe = electron.onAnalysisInitialData((data) => {
      // Store current game data if available, but don't auto-load
      // User will choose whether to analyze current game or load from file
      if (data.type === 'current_game' && data.moves && data.moves.length > 0) {
        setPendingCurrentGame({
          moves: data.moves,
          startingSfen: data.startingSfen,
          blackName: data.blackName,
          whiteName: data.whiteName,
        });
      }
      // Always show load dialog so user can choose
    });
    
    return unsubscribe;
  }, [loadGameFromMoves]);

  // Update board when selected move changes
  useEffect(() => {
    if (!gameData) return;
    
    let sfen: string;
    if (selectedMoveIndex === -1) {
      sfen = gameData.startingSfen;
    } else if (gameData.moves[selectedMoveIndex]) {
      sfen = gameData.moves[selectedMoveIndex].sfen_after;
    } else {
      return;
    }
    
    updateBoardState(sfen);
    
    // Auto-scroll to selected move
    const moveButton = moveRefs.current.get(selectedMoveIndex);
    if (moveButton && moveListRef.current) {
      moveButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedMoveIndex, gameData, updateBoardState]);

  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const content = await file.text();
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    let format = 'kif';
    if (extension === 'csa') format = 'csa';
    else if (extension === 'ki2') format = 'ki2';
    else if (extension === 'psn') format = 'psn';
    
    try {
      // Call backend to parse the game file
      const response = await fetch('http://127.0.0.1:8000/game/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to parse game file');
      }
      
      const result = await response.json();
      loadGameFromMoves(
        result.moves.map((m: { move_usi: string; move_notation?: string; sfen_after: string }) => ({
          move_usi: m.move_usi,
          move_notation: m.move_notation || m.move_usi,
          sfen_after: m.sfen_after,
        })),
        result.starting_sfen,
        result.black_name,
        result.white_name
      );
      setShowLoadDialog(false);
    } catch (error) {
      console.error('Failed to import game:', error);
      alert('Failed to import game file. Please check the format.');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLoadCurrentGame = () => {
    if (pendingCurrentGame && pendingCurrentGame.moves.length > 0) {
      loadGameFromMoves(
        pendingCurrentGame.moves,
        pendingCurrentGame.startingSfen,
        pendingCurrentGame.blackName,
        pendingCurrentGame.whiteName
      );
      setShowLoadDialog(false);
    } else {
      alert('No current game available. Please load a game file instead.');
    }
  };

  // Effect to start analysis when game data is loaded
  useEffect(() => {
    if (shouldStartAnalysis.current && gameData && gameData.moves.length > 0 && !isAnalyzing) {
      shouldStartAnalysis.current = false;
      startAnalysisForGame();
    }
  }, [gameData]);

  const startAnalysisForGame = async () => {
    if (!gameData) return;
    const moves = gameData.moves;
    const startingSfen = gameData.startingSfen;
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    // Analyze each position
    const positions: string[] = [startingSfen];
    for (const move of moves) {
      positions.push(move.sfen_after);
    }
    
    const analyzedMoves = [...moves];
    
    for (let i = 0; i < moves.length; i++) {
      try {
        // Request analysis from backend using the ANALYSIS engine (not black/white engines)
        const response = await fetch('http://127.0.0.1:8000/game/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sfen: positions[i],
            movetime: 1000,
          }),
        });
        
        if (response.ok) {
          const analysis = await response.json();
          const evalBefore = analysis.score_cp || 0;
          
          // Get eval after this move
          const afterResponse = await fetch('http://127.0.0.1:8000/game/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sfen: moves[i].sfen_after,
              movetime: 1000,
            }),
          });
          
          let evalAfter = 0;
          if (afterResponse.ok) {
            const afterAnalysis = await afterResponse.json();
            evalAfter = afterAnalysis.score_cp || 0;
          }
          
          // Calculate centipawn loss following the test script algorithm:
          // eval_after is from opponent's perspective, so flip it
          // cp_loss = eval_before - (-eval_after) = eval_before + eval_after
          const evalAfterOurPov = -evalAfter;
          const cpLoss = evalBefore - evalAfterOurPov;
          
          // Check if played move matches engine's best move
          const playedBestMove = analysis.bestmove === moves[i].move_usi;
          
          // Classify based on cp_loss thresholds from test script:
          // Brilliant: ≤0cp loss (better than engine)
          // Excellent: ≤10cp loss (engine's choice)
          // Good: ≤30cp loss (minor difference)
          // Inaccuracy: ≤100cp loss (small mistake)
          // Mistake: ≤300cp loss (significant error)
          // Blunder: >300cp loss (major error)
          let quality: MoveQuality = 'unknown';
          if (cpLoss <= 0) quality = 'brilliant';
          else if (cpLoss <= 10) quality = 'excellent';
          else if (cpLoss <= 30) quality = 'good';
          else if (cpLoss <= 100) quality = 'inaccuracy';
          else if (cpLoss <= 300) quality = 'mistake';
          else quality = 'blunder';
          
          analyzedMoves[i] = {
            ...analyzedMoves[i],
            quality,
            eval_before: evalBefore,
            eval_after: evalAfter, // Store raw engine value (from opponent's POV after move)
            cp_loss: cpLoss,
            played_best_move: playedBestMove,
            best_move: analysis.bestmove,
            best_move_notation: analysis.bestmove_notation || analysis.bestmove,
            alternatives: analysis.alternatives?.slice(0, 5).map((alt: { move_usi: string; move_notation: string; score_cp: number; continuation?: string[] }) => ({
              move_usi: alt.move_usi,
              move_notation: alt.move_notation,
              eval: alt.score_cp,
              continuation: alt.continuation,
            })),
            analyzed: true,
          };
          
          // Update state progressively
          setGameData(prev => prev ? { ...prev, moves: [...analyzedMoves] } : null);
        }
      } catch (error) {
        console.error(`Failed to analyze move ${i + 1}:`, error);
        analyzedMoves[i].analyzed = true; // Mark as analyzed even on error
      }
      
      setAnalysisProgress(((i + 1) / moves.length) * 100);
    }
    
    setIsAnalyzing(false);
    setGameData(prev => prev ? { ...prev, moves: analyzedMoves } : null);
  };

  // Navigation handlers
  const goToStart = () => setSelectedMoveIndex(-1);
  const goToEnd = () => {
    if (gameData) setSelectedMoveIndex(gameData.moves.length - 1);
  };
  const goBack = () => setSelectedMoveIndex(prev => Math.max(-1, prev - 1));
  const goForward = () => {
    if (gameData) setSelectedMoveIndex(prev => Math.min(gameData.moves.length - 1, prev + 1));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'ArrowRight') goForward();
      else if (e.key === 'Home') goToStart();
      else if (e.key === 'End') goToEnd();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Convert centipawns to win rate (approximate)
  const cpToWinRate = (cp: number): number => {
    return 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
  };

  // Get evaluation for graph
  const getEvalForGraph = (evalCp: number | null): number => {
    if (evalCp === null) return 50;
    if (evalToggle === 'winrate') {
      return cpToWinRate(evalCp);
    }
    // Clamp centipawns to reasonable range and convert to percentage
    const clamped = Math.max(-1000, Math.min(1000, evalCp));
    return 50 + (clamped / 20); // Scale: 1000cp = 100%
  };

  // Render load dialog
  if (showLoadDialog) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="bg-background-secondary border border-border rounded-xl p-8 max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold text-text-primary mb-6 text-center">
            Game Record Analysis
          </h1>
          
          <p className="text-text-secondary mb-6 text-center">
            Choose how to load a game for analysis:
          </p>
          
          <div className="space-y-4">
            <button
              onClick={handleLoadCurrentGame}
              disabled={!pendingCurrentGame}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                pendingCurrentGame
                  ? 'bg-accent-purple hover:bg-accent-purple/80 text-white'
                  : 'bg-background-primary border border-border text-text-secondary cursor-not-allowed'
              }`}
            >
              {pendingCurrentGame 
                ? `Analyze Current Game (${pendingCurrentGame.moves.length} moves)`
                : 'No Current Game Available'}
            </button>
            
            <div className="relative">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-background-primary border border-border hover:border-accent-purple text-text-primary rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Load from File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".kif,.ki2,.csa,.psn"
                onChange={handleFileLoad}
                className="hidden"
              />
            </div>
          </div>
          
          <p className="text-xs text-text-secondary mt-6 text-center">
            Supported formats: KIF, KI2, CSA, PSN
          </p>
        </div>
      </div>
    );
  }

  // Main analysis view
  return (
    <div className="h-screen bg-background-primary flex overflow-hidden">
      {/* Left Panel - Move History */}
      <div className="w-64 bg-background-secondary border-r border-border flex flex-col h-screen">
        {/* Header - Fixed at top */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Move History</h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-text-secondary hover:text-accent-purple transition-colors"
            title="Load new game"
          >
            <Upload className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".kif,.ki2,.csa,.psn"
            onChange={handleFileLoad}
            className="hidden"
          />
        </div>
        
        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="px-4 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-2 text-sm text-text-secondary mb-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing... {Math.round(analysisProgress)}%
            </div>
            <div className="w-full h-1 bg-background-primary rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent-purple transition-all duration-300"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Move List */}
        <div className="flex-1 overflow-y-auto" ref={moveListRef}>
          {/* Moves */}
          {gameData?.moves.map((move, index) => {
            const quality = QUALITY_CONFIG[move.quality];
            
            return (
              <button
                key={index}
                ref={(el) => {
                  if (el) moveRefs.current.set(index, el);
                  else moveRefs.current.delete(index);
                }}
                onClick={() => setSelectedMoveIndex(index)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                  selectedMoveIndex === index
                    ? 'bg-accent-purple/20 text-accent-purple'
                    : move.analyzed 
                      ? 'text-text-primary hover:bg-background-primary'
                      : 'text-text-secondary hover:bg-background-primary'
                }`}
              >
                <span className="w-8 text-text-secondary">
                  {index + 1}.
                </span>
                <span className="flex-1">{move.move_notation}</span>
                {move.analyzed && (
                  <span className={`font-mono text-xs ${quality.color}`}>
                    {quality.symbol}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        
        {/* Navigation Footer - Fixed at bottom */}
        <div className="p-4 border-t border-border flex items-center justify-center gap-2 shrink-0">
          <button
            onClick={goToStart}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Go to start"
          >
            <ChevronsLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goBack}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Previous move"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goForward}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Next move"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={goToEnd}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Go to end"
          >
            <ChevronsRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Center - Game Board */}
      <div className="flex flex-col p-4 pt-2">
        <div className="max-w-[550px] w-full">
          {gameState && (
            <ShogiBoard
              gameState={gameState}
              onMove={() => {}} // Read-only
              showBestMove={false}
              lastMoveUsi={selectedMoveIndex >= 0 ? gameData?.moves[selectedMoveIndex].move_usi : null}
            />
          )}
        </div>
      </div>
      
      {/* Right Panel - Analysis */}
      <div className="flex-1 bg-background-secondary border-l border-border flex flex-col h-screen">
        {/* Evaluation Graph - Fixed at top */}
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Evaluation
            </h3>
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setEvalToggle('centipawn')}
                className={`px-2 py-1 rounded ${
                  evalToggle === 'centipawn'
                    ? 'bg-accent-purple text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                CP
              </button>
              <button
                onClick={() => setEvalToggle('winrate')}
                className={`px-2 py-1 rounded ${
                  evalToggle === 'winrate'
                    ? 'bg-accent-purple text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Win%
              </button>
            </div>
          </div>
          
          {/* Graph */}
          <div className="h-32 bg-background-primary rounded-lg relative overflow-hidden">
            {/* Center line (equal position) */}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
            
            {/* Evaluation line - show only selected player's moves that have been analyzed */}
            {gameData && gameData.moves.length > 0 && (() => {
              const isBlackSelected = selectedMoveIndex === -1 || selectedMoveIndex % 2 === 0;
              // Get all analyzed moves with their indices
              const allMoves = gameData.moves
                .map((m, i) => ({ ...m, originalIndex: i }))
                .filter(m => m.analyzed && m.eval_after !== null);
              
              // Filter to selected player's moves
              const playerMoves = allMoves.filter(m => 
                isBlackSelected ? m.originalIndex % 2 === 0 : m.originalIndex % 2 === 1
              );
              
              if (playerMoves.length === 0) return null;
              
              // Build points, using last known value for any gaps
              const points: string[] = [];
              playerMoves.forEach((m, i) => {
                // eval_after is raw engine value (from side-to-move after this move)
                // For Black's move: engine returned from White's POV, flip to get Black's
                // For White's move: engine returned from Black's POV, already Black's
                const eval_cp = m.eval_after!;
                const isBlackMove = m.originalIndex % 2 === 0;
                // Normalize to Black's perspective
                const blackPovEval = isBlackMove ? -eval_cp : eval_cp;
                // Then flip to selected player's perspective for display
                const displayEval = isBlackSelected ? blackPovEval : -blackPovEval;
                points.push(`${i},${100 - getEvalForGraph(displayEval)}`);
              });
              
              return (
                <svg 
                  className="absolute inset-0 w-full h-full"
                  viewBox={`0 0 ${playerMoves.length} 100`}
                  preserveAspectRatio="none"
                >
                  <polyline
                    fill="none"
                    stroke={isBlackSelected ? '#a78bfa' : '#60a5fa'}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    points={points.join(' ')}
                  />
                </svg>
              );
            })()}
            
            {/* Current position indicator */}
            {gameData && selectedMoveIndex >= 0 && (() => {
              const isBlackSelected = selectedMoveIndex % 2 === 0;
              // Use same filter as the graph line - only analyzed moves with eval data
              const analyzedPlayerMoves = gameData.moves
                .map((m, i) => ({ ...m, originalIndex: i }))
                .filter(m => m.analyzed && m.eval_after !== null)
                .filter(m => isBlackSelected ? m.originalIndex % 2 === 0 : m.originalIndex % 2 === 1);
              
              if (analyzedPlayerMoves.length === 0) return null;
              
              // Find position of current move in the filtered list
              const currentPosInFiltered = analyzedPlayerMoves.findIndex(m => m.originalIndex === selectedMoveIndex);
              if (currentPosInFiltered === -1) return null;
              
              return (
                <div 
                  className="absolute top-0 bottom-0 w-px bg-accent-cyan"
                  style={{ 
                    left: `${((currentPosInFiltered + 0.5) / analyzedPlayerMoves.length) * 100}%` 
                  }}
                />
              );
            })()}
            
            {/* Labels - highlight selected player */}
            <div className={`absolute top-1 left-2 text-xs ${
              selectedMoveIndex === -1 || selectedMoveIndex % 2 === 0 
                ? 'text-accent-purple font-semibold' 
                : 'text-text-secondary'
            }`}>
              {gameData?.blackName || 'Black'} ↑
            </div>
            <div className={`absolute bottom-1 left-2 text-xs ${
              selectedMoveIndex >= 0 && selectedMoveIndex % 2 === 1 
                ? 'text-blue-400 font-semibold' 
                : 'text-text-secondary'
            }`}>
              {gameData?.whiteName || 'White'} ↓
            </div>
          </div>
        </div>
        
        {/* Move Analysis */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedMoveIndex >= 0 && gameData?.moves[selectedMoveIndex] ? (
            <div className="space-y-4">
              {/* Selected Move */}
              <div>
                <h4 className="text-sm font-semibold text-text-primary mb-2">
                  Move {Math.floor(selectedMoveIndex / 2) + 1}
                  {selectedMoveIndex % 2 === 0 ? ' (Black)' : ' (White)'}
                </h4>
                
                <div className="bg-background-primary rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono">
                      {gameData.moves[selectedMoveIndex].move_notation}
                    </span>
                    {gameData.moves[selectedMoveIndex].analyzed && (
                      <span className={`text-lg font-mono ${
                        QUALITY_CONFIG[gameData.moves[selectedMoveIndex].quality].color
                      }`}>
                        {QUALITY_CONFIG[gameData.moves[selectedMoveIndex].quality].symbol}
                      </span>
                    )}
                  </div>
                  
                  {gameData.moves[selectedMoveIndex].analyzed && (
                    <p className={`text-sm mt-1 ${
                      QUALITY_CONFIG[gameData.moves[selectedMoveIndex].quality].color
                    }`}>
                      {QUALITY_CONFIG[gameData.moves[selectedMoveIndex].quality].label}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Evaluation & Centipawn Loss */}
              {gameData.moves[selectedMoveIndex].analyzed && (() => {
                const move = gameData.moves[selectedMoveIndex];
                const cpLoss = move.cp_loss;
                
                return (
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary mb-2">
                      Analysis
                    </h4>
                    <div className="bg-background-primary rounded-lg p-3 text-sm space-y-2">
                      {/* Played best move indicator */}
                      {move.played_best_move ? (
                        <div className="flex items-center gap-2 text-green-400">
                          <span>✅</span>
                          <span>Played engine&apos;s top choice!</span>
                        </div>
                      ) : move.best_move_notation && (
                        <div className="flex items-center gap-2 text-yellow-400">
                          <span>💡</span>
                          <span>Different from engine (wanted: {move.best_move_notation})</span>
                        </div>
                      )}
                      
                      {/* Centipawn change */}
                      {cpLoss !== null && (
                        <div className="flex justify-between">
                          <span className="text-text-secondary">
                            {cpLoss <= 0 ? 'Centipawn gain:' : 'Centipawn loss:'}
                          </span>
                          <span className={`font-mono ${
                            cpLoss <= 0 ? 'text-cyan-400' :
                            cpLoss <= 10 ? 'text-green-400' :
                            cpLoss <= 30 ? 'text-green-300' :
                            cpLoss <= 100 ? 'text-yellow-400' :
                            cpLoss <= 300 ? 'text-orange-400' :
                            'text-red-400'
                          }`}>
                            {Math.abs(cpLoss)}cp
                          </span>
                        </div>
                      )}
                      
                      {/* Position eval before/after - both normalized to Black's perspective */}
                      <div className="border-t border-border pt-2 mt-2">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Position before (Black POV):</span>
                          <span className="text-text-primary font-mono">
                            {move.eval_before !== null
                              ? `${move.eval_before > 0 ? '+' : ''}${move.eval_before}cp`
                              : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-text-secondary">Position after (Black POV):</span>
                          <span className="text-text-primary font-mono">
                            {move.eval_after !== null
                              ? `${-move.eval_after > 0 ? '+' : ''}${-move.eval_after}cp`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              
              {/* Alternatives */}
              {gameData.moves[selectedMoveIndex].analyzed && (
                <div>
                  <h4 className="text-sm font-semibold text-text-primary mb-2">
                    Top Moves
                  </h4>
                  <div className="space-y-2">
                    {gameData.moves[selectedMoveIndex].alternatives && 
                     gameData.moves[selectedMoveIndex].alternatives!.length > 0 ? (
                      gameData.moves[selectedMoveIndex].alternatives!.map((alt, i) => {
                        // Scores are from the moving player's perspective (how they see the position)
                        const evalScore = alt.eval;
                        const continuation = alt.continuation || [];
                        return (
                          <div key={i} className="bg-background-primary rounded-lg p-2">
                            <div className="flex justify-between items-center">
                              <span className="font-mono font-semibold">{alt.move_notation || alt.move_usi}</span>
                              <span className={`text-sm font-mono ${evalScore > 0 ? 'text-green-400' : evalScore < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                                {evalScore > 0 ? '+' : ''}{evalScore}cp
                              </span>
                            </div>
                            {continuation.length > 1 && (
                              <div className="text-xs text-text-secondary mt-1 font-mono truncate">
                                → {continuation.slice(1).join(' ')}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-text-secondary text-sm">No alternatives available</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-text-secondary py-8">
              <p>Select a move to see analysis</p>
            </div>
          )}
        </div>
        
        {/* Game Info Footer - Fixed at bottom */}
        {gameData && (
          <div className="p-4 border-t border-border text-sm text-text-secondary shrink-0">
            <div className="flex justify-between">
              <span>☗ {gameData.blackName}</span>
              <span>vs</span>
              <span>☖ {gameData.whiteName}</span>
            </div>
            <div className="text-center mt-1">
              {gameData.moves.length} moves
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
