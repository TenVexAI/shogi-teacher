import React, { useState, useEffect } from 'react';
import { Settings, Power, Volume2, VolumeX, BookOpen } from 'lucide-react';

interface SidebarProps {
  onOpenSettings: () => void;
  allSoundsEnabled: boolean;
  onToggleAllSounds: () => void;
  onOpenLearn: () => void;
}

export default function Sidebar({ onOpenSettings, allSoundsEnabled, onToggleAllSounds, onOpenLearn }: SidebarProps) {
  const [isLearnWindowOpen, setIsLearnWindowOpen] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    const isElectron = typeof window !== 'undefined' && 'electron' in window && (window as any).electron;
    
    if (isElectron) {
      // Check initial state
      (window as any).electron.isLearnWindowOpen().then(setIsLearnWindowOpen);
      
      // Listen for state changes
      const cleanup = (window as any).electron.onLearnWindowStateChange((isOpen: boolean) => {
        setIsLearnWindowOpen(isOpen);
      });
      
      return cleanup;
    }
  }, []);
  const handleShutdown = () => {
    // Check if running in Electron
    const isElectron = typeof window !== 'undefined' && 'electron' in window;
    
    if (isElectron) {
      // In Electron, close the window
      if (confirm('Are you sure you want to close Shogi Teacher?')) {
        window.close();
      }
    } else {
      // In browser, just show a message
      alert('Close the browser tab to exit.');
    }
  };

  return (
    <div className="w-12 h-full bg-background-secondary flex flex-col items-center py-4 shrink-0 border-r border-border">
      {/* Top section - Learn button */}
      <div className="flex flex-col gap-4">
        <button
          onClick={onOpenLearn}
          className="w-10 h-10 flex items-center justify-center group transition-colors"
          title={isLearnWindowOpen ? "Close Learn Window" : "Learn to Play"}
        >
          <BookOpen className={`w-6 h-6 transition-colors ${
            isLearnWindowOpen 
              ? 'sound-active group-hover:!text-red-500' 
              : 'text-text-secondary group-hover:text-accent-cyan'
          }`} />
        </button>
      </div>

      <div className="flex-1"></div>

      {/* Bottom section - Sound, Settings and Shutdown */}
      <div className="flex flex-col gap-4">
        {/* Sound Toggle Button */}
        <button
          onClick={onToggleAllSounds}
          className="w-10 h-10 flex items-center justify-center group transition-colors relative"
          title={allSoundsEnabled ? "Mute All Sounds" : "Enable All Sounds"}
        >
          {allSoundsEnabled ? (
            <>
              <Volume2 className="w-6 h-6 transition-opacity group-hover:opacity-0 sound-active" />
              <VolumeX className="w-6 h-6 text-red-500 transition-opacity opacity-0 group-hover:opacity-100 absolute" />
            </>
          ) : (
            <>
              <VolumeX className="w-6 h-6 text-text-secondary transition-opacity group-hover:opacity-0" />
              <Volume2 className="w-6 h-6 text-accent-cyan transition-opacity opacity-0 group-hover:opacity-100 absolute" />
            </>
          )}
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 flex items-center justify-center group transition-colors"
          title="Settings"
        >
          <Settings className="w-6 h-6 text-text-secondary group-hover:text-accent-cyan transition-colors" />
        </button>

        {/* Shutdown Button */}
        <button
          onClick={handleShutdown}
          className="w-10 h-10 flex items-center justify-center group transition-colors"
          title="Exit"
        >
          <Power className="w-6 h-6 text-text-secondary group-hover:text-red-500 transition-colors" />
        </button>
      </div>
    </div>
  );
}
