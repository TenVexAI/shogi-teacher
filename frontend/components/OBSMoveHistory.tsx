'use client';

import { useEffect, useRef } from 'react';
import { MoveRecord } from './MoveHistory';

interface OBSMoveHistoryProps {
  moves: MoveRecord[];
  currentTurn: 'b' | 'w';
}

export default function OBSMoveHistory({ moves }: OBSMoveHistoryProps) {
  const moveListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when moves change
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves]);

  return (
    <div className="h-screen p-6 flex">
      <div className="w-[200px] h-full bg-black/85 rounded-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-linear-to-r from-accent-purple to-black px-6 py-4 opacity-85">
          <h3 className="text-lg font-pixel text-white text-center">
            Move History
          </h3>
        </div>
        
        {/* Move List */}
        <div ref={moveListRef} className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
          {moves.length === 0 ? (
            <p className="text-xs text-text-secondary italic">No moves yet</p>
          ) : (
            <div className="space-y-0.5">
              {moves.map((move, index) => (
                <div
                  key={index}
                  className={`text-m py-1 rounded flex text-white ${
                    index === moves.length - 1
                      ? 'bg-accent-cyan/20 font-semibold'
                      : ''
                  }`}
                >
                  <span className="w-10 font-mono text-right pr-2">
                    {move.moveNumber}:
                  </span>
                  <span className="flex-1 font-mono">
                    <span className="mr-1">{move.player === 'b' ? '☗' : '☖'}</span>
                    {move.move}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
