import React from 'react';
import { Settings, Power } from 'lucide-react';

interface SidebarProps {
  onOpenSettings: () => void;
}

export default function Sidebar({ onOpenSettings }: SidebarProps) {
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
      {/* Top section - can add more buttons here later */}
      <div className="flex-1"></div>

      {/* Bottom section - Settings and Shutdown */}
      <div className="flex flex-col gap-4">
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
