'use client';

import { GameSession } from '@/lib/api';

interface ResumeSessionModalProps {
  isOpen: boolean;
  lastSession: GameSession | null;
  onResume: () => void;
  onNewGame: () => void;
}

export default function ResumeSessionModal({ isOpen, lastSession, onResume, onNewGame }: ResumeSessionModalProps) {
  if (!isOpen || !lastSession) return null;

  const moveCount = lastSession.moves.length;
  const lastMove = lastSession.moves[lastSession.moves.length - 1];
  const createdDate = new Date(lastSession.created_at).toLocaleDateString();
  const createdTime = new Date(lastSession.created_at).toLocaleTimeString();

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <h2 className="text-xl font-bold text-text-primary mb-4">Welcome Back!</h2>
        
        {/* Content */}
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            You have an active game session. Would you like to continue where you left off?
          </p>

          {/* Session Info */}
          <div className="bg-background-primary border border-border rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Started:</span>
              <span className="text-text-primary">{createdDate} at {createdTime}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Moves:</span>
              <span className="text-text-primary">{moveCount}</span>
            </div>
            {lastMove && (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Last Move:</span>
                <span className="text-text-primary font-mono">{lastMove.move_algebraic}</span>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onNewGame}
              className="flex-1 px-4 py-3 bg-background-primary border border-border rounded-lg text-text-primary hover:bg-background-tertiary transition-colors"
            >
              New Game
            </button>
            <button
              onClick={onResume}
              className="flex-1 px-4 py-3 bg-accent-cyan text-black rounded-lg hover:bg-accent-cyan/80 transition-colors font-semibold"
            >
              Resume Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
