'use client';

import { useState, useEffect, useRef } from 'react';

interface GameClockProps {
    isRunning: boolean;
    onToggle: () => void;
}

export default function GameClock({ isRunning, onToggle }: GameClockProps) {
    const [elapsedTime, setElapsedTime] = useState(0);
    const startTimeRef = useRef<number>(0);
    const accumulatedTimeRef = useRef<number>(0);

    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        if (isRunning) {
            startTimeRef.current = Date.now();
            intervalId = setInterval(() => {
                const now = Date.now();
                const elapsed = now - startTimeRef.current;
                setElapsedTime(accumulatedTimeRef.current + elapsed);
            }, 100);
        } else {
            if (startTimeRef.current > 0) {
                const elapsed = Date.now() - startTimeRef.current;
                accumulatedTimeRef.current += elapsed;
                startTimeRef.current = 0;
            }
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isRunning]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const resetClock = () => {
        setElapsedTime(0);
        accumulatedTimeRef.current = 0;
        startTimeRef.current = 0;
    };

    // Expose reset function via ref if needed
    useEffect(() => {
        (window as any).__resetGameClock = resetClock;
        return () => {
            delete (window as any).__resetGameClock;
        };
    }, []);

    return (
        <div className="flex items-center gap-3 bg-white rounded-lg shadow-md p-4 border border-gray-200">
            <div className="flex-1">
                <div className="text-sm text-gray-600 mb-1">Game Time</div>
                <div className="text-3xl font-bold font-mono text-gray-800">
                    {formatTime(elapsedTime)}
                </div>
            </div>
            <button
                onClick={onToggle}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                    isRunning
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
                {isRunning ? '⏸ Pause' : '▶ Start'}
            </button>
        </div>
    );
}

export function getCurrentGameTime(): number {
    // This will be called to get the current elapsed time for move history
    return 0; // Placeholder - will be managed by parent component
}
