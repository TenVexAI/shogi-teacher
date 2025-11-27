'use client';

import { useState, useEffect } from 'react';
import { X, Download, Copy, Check, Save } from 'lucide-react';
import { GameFormat } from '@/types/game';

interface ExportGameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (format: GameFormat, whiteName?: string, blackName?: string, filename?: string) => Promise<{ content: string; filename: string } | null>;
    currentWhiteName: string;
    currentBlackName: string;
}

const FORMATS: { id: GameFormat; name: string; description: string }[] = [
    { id: 'kif', name: 'KIF', description: 'Traditional Japanese format' },
    { id: 'csa', name: 'CSA', description: 'Computer Shogi Association format' },
    { id: 'ki2', name: 'KI2', description: 'Simplified KIF variant' },
    { id: 'psn', name: 'PSN', description: 'Portable Shogi Notation (like PGN)' },
];

export default function ExportGameModal({
    isOpen,
    onClose,
    onExport,
    currentWhiteName,
    currentBlackName,
}: ExportGameModalProps) {
    const [selectedFormat, setSelectedFormat] = useState<GameFormat>('kif');
    const [whiteName, setWhiteName] = useState(currentWhiteName);
    const [blackName, setBlackName] = useState(currentBlackName);
    const [filename, setFilename] = useState('');
    const [exportedContent, setExportedContent] = useState<string | null>(null);
    const [exportedFilename, setExportedFilename] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        setIsElectron(typeof window !== 'undefined' && !!window.electron?.saveFile);
    }, []);

    // Sync player names when modal opens
    useEffect(() => {
        if (isOpen) {
            setWhiteName(currentWhiteName);
            setBlackName(currentBlackName);
        }
    }, [isOpen, currentWhiteName, currentBlackName]);

    if (!isOpen) return null;

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const result = await onExport(
                selectedFormat,
                whiteName || undefined,
                blackName || undefined,
                filename || undefined
            );
            if (result) {
                setExportedContent(result.content);
                setExportedFilename(result.filename);
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownload = async () => {
        if (!exportedContent) return;

        // Use native save dialog in Electron
        if (typeof window !== 'undefined' && window.electron?.saveFile) {
            const extension = exportedFilename.split('.').pop() || 'kif';
            const filters = [
                { name: `${extension.toUpperCase()} Files`, extensions: [extension] },
                { name: 'All Files', extensions: ['*'] }
            ];
            
            const result = await window.electron.saveFile(exportedContent, exportedFilename, filters);
            
            if (result.success) {
                // File saved successfully, close modal
                handleClose();
            } else if (result.error) {
                console.error('Failed to save file:', result.error);
            }
            // If canceled, just do nothing
            return;
        }

        // Fallback for browser
        const blob = new Blob([exportedContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportedFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCopy = async () => {
        if (!exportedContent) return;
        
        try {
            await navigator.clipboard.writeText(exportedContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleClose = () => {
        setExportedContent(null);
        setExportedFilename('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary">Export Game</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-background-primary rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {exportedContent ? (
                        /* Export result */
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-text-primary font-medium">{exportedFilename}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-2 px-3 py-2 bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="w-4 h-4 text-green-500" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-4 h-4" />
                                                Copy
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleDownload}
                                        className="flex items-center gap-2 px-3 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] transition-colors"
                                    >
                                        {isElectron ? (
                                            <>
                                                <Save className="w-4 h-4" />
                                                Save As...
                                            </>
                                        ) : (
                                            <>
                                                <Download className="w-4 h-4" />
                                                Download
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <pre className="w-full h-64 p-4 bg-background-primary border border-border rounded-lg text-text-primary text-sm font-mono overflow-auto whitespace-pre-wrap">
                                {exportedContent}
                            </pre>

                            <button
                                onClick={() => {
                                    setExportedContent(null);
                                    setExportedFilename('');
                                }}
                                className="w-full py-2 bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                            >
                                Export Another Format
                            </button>
                        </div>
                    ) : (
                        /* Export options */
                        <>
                            {/* Format selection */}
                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-3">
                                    Export Format
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    {FORMATS.map((format) => (
                                        <button
                                            key={format.id}
                                            onClick={() => setSelectedFormat(format.id)}
                                            className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                selectedFormat === format.id
                                                    ? 'border-accent-purple bg-accent-purple/10'
                                                    : 'border-border hover:border-text-secondary'
                                            }`}
                                        >
                                            <div className="font-medium text-text-primary">{format.name}</div>
                                            <div className="text-xs text-text-secondary">{format.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Player names */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-text-primary">
                                    Player Names
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-text-secondary mb-1">
                                            ☗ Black (Sente)
                                        </label>
                                        <input
                                            type="text"
                                            value={blackName}
                                            onChange={(e) => setBlackName(e.target.value)}
                                            placeholder="Guest"
                                            className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-text-secondary mb-1">
                                            ☖ White (Gote)
                                        </label>
                                        <input
                                            type="text"
                                            value={whiteName}
                                            onChange={(e) => setWhiteName(e.target.value)}
                                            placeholder="Guest"
                                            className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Custom filename */}
                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">
                                    Filename (optional)
                                </label>
                                <input
                                    type="text"
                                    value={filename}
                                    onChange={(e) => setFilename(e.target.value)}
                                    placeholder={`${blackName || 'Guest'}_vs_${whiteName || 'Guest'}_YYYYMMDD_HHMMSS`}
                                    className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-text-primary placeholder-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-accent-purple"
                                />
                                <p className="text-xs text-text-secondary mt-1">
                                    Leave blank to auto-generate filename with player names and timestamp
                                </p>
                            </div>

                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                className="w-full py-3 bg-accent-purple text-white rounded-lg font-medium hover:bg-[#8a6fd1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isExporting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4" />
                                        Export Game
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
