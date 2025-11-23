'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';

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
}

interface ChatInterfaceProps {
    messages: Message[];
    onSendMessage: (message: string) => void;
    isLoading?: boolean;
    onGetHint?: () => void;
}

// Component to render hint with collapsible alternatives
function HintRenderer({ hint }: { hint: HintData }) {
    const [showAlternatives, setShowAlternatives] = useState(false);
    
    const formatEval = (score_cp: number | null, mate: number | null) => {
        if (mate !== null) {
            const fullMoves = Math.ceil(Math.abs(mate) / 2);
            if (mate > 0) {
                return `⚔️ Mate in ${fullMoves}`;
            } else {
                return `🛡️ Opponent has mate in ${fullMoves}`;
            }
        } else if (score_cp !== null) {
            const scoreIcon = score_cp > 100 ? '⬆️' : score_cp < -100 ? '⬇️' : '➡️';
            return `${scoreIcon} ${score_cp > 0 ? '+' : ''}${score_cp}cp`;
        }
        return '';
    };
    
    return (
        <div className="space-y-3">
            {/* Best Move Section */}
            <div>
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                    Best Move
                </h3>
                <div className="text-base">
                    <span className="font-bold">{hint.bestmove_algebraic}</span>
                    <span className="opacity-75 ml-2">({hint.bestmove})</span>
                    {(hint.score_cp !== null || hint.mate !== null) && (
                        <span className="ml-2">{formatEval(hint.score_cp, hint.mate)}</span>
                    )}
                </div>
                {hint.pv_algebraic && hint.pv_algebraic.length > 0 && (
                    <div className="mt-2 text-sm opacity-90">
                        <span className="font-semibold">Expected continuation: </span>
                        {hint.pv_algebraic.slice(0, 4).join(' → ')}
                    </div>
                )}
                <p className="mt-3 text-sm italic opacity-80">
                    Try to figure out why this move is strong!
                </p>
            </div>
            
            {/* Alternatives Section (Collapsible) */}
            {hint.alternatives && hint.alternatives.length > 0 && (
                <div className="border-t border-current opacity-50 pt-3">
                    <button
                        onClick={() => setShowAlternatives(!showAlternatives)}
                        className="flex items-center gap-2 font-bold text-sm hover:opacity-80 transition-opacity w-full text-left"
                    >
                        {showAlternatives ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        Alternative Moves ({hint.alternatives.length} found)
                    </button>
                    
                    {showAlternatives && (
                        <div className="mt-3 space-y-2 pl-6">
                            {hint.alternatives.map((alt, index) => (
                                <div key={index} className="text-sm">
                                    <div>
                                        <span className="font-bold">{index + 2}. {alt.move_algebraic}</span>
                                        <span className="opacity-75 ml-2">({alt.move_usi})</span>
                                        {(alt.score_cp !== null || alt.mate !== null) && (
                                            <span className="ml-2 text-xs">{formatEval(alt.score_cp, alt.mate)}</span>
                                        )}
                                    </div>
                                    {alt.pv_algebraic && alt.pv_algebraic.length > 0 && (
                                        <div className="mt-1 text-xs opacity-75 italic pl-4">
                                            {alt.pv_algebraic.slice(0, 3).join(' → ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ChatInterface({ messages, onSendMessage, isLoading, onGetHint }: ChatInterfaceProps) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input);
            setInput('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-background-secondary rounded-lg shadow-lg border border-border">
            <div className="bg-linear-to-r from-accent-purple to-accent-cyan text-white p-4 rounded-t-lg">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-4xl font-shogi drop-shadow-lg">先生</span>
                        <div>
                            <h2 className="text-xl font-bold font-pixel drop-shadow-lg mb-1">Shogi Teacher</h2>
                            <p className="text-sm opacity-90">Ask questions about the position or request analysis</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-text-secondary mt-8">
                        <p className="text-lg">Welcome to Shogi Teacher!</p>
                        <p className="text-sm mt-2">Make a move or ask a question to get started.</p>
                    </div>
                )}

                {messages.map((message, index) => {
                    // Determine background color based on message type
                    let bgColor = 'bg-background-primary';
                    let borderColor = 'border-border';
                    let textColor = 'text-text-primary';
                    
                    if (message.role === 'user') {
                        // User messages: Cyan
                        bgColor = 'bg-accent-cyan';
                        textColor = 'text-white';
                    } else if (message.messageType === 'engine-black') {
                        // Black engine: Black background
                        bgColor = 'bg-black';
                        borderColor = 'border-gray-700';
                        textColor = 'text-white';
                    } else if (message.messageType === 'engine-white') {
                        // White engine: White background
                        bgColor = 'bg-white';
                        borderColor = 'border-gray-300';
                        textColor = 'text-gray-900';
                    } else if (message.messageType === 'llm') {
                        // LLM messages: Gradient purple→black→cyan
                        bgColor = 'bg-gradient-to-r from-accent-purple to-accent-cyan';
                        textColor = 'text-white';
                    } else if (message.messageType === 'system') {
                        // System messages: Solid purple
                        bgColor = 'bg-accent-purple';
                        textColor = 'text-white';
                    }
                    
                    return (
                        <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`${message.role === 'user' ? 'max-w-[80%]' : 'max-w-[95%]'} rounded-lg p-3 border ${bgColor} ${borderColor} ${textColor}`}
                            >
                                {/* Show engine name if present */}
                                {message.engineName && (
                                    <div className="text-xs font-semibold mb-2 opacity-75">
                                        {message.engineName}
                                    </div>
                                )}
                                
                                {message.role === 'assistant' ? (
                                    message.hintData ? (
                                        <HintRenderer hint={message.hintData} />
                                    ) : (
                                        <div className={`prose prose-sm max-w-none ${textColor === 'text-white' ? 'prose-invert' : ''}`}>
                                            <ReactMarkdown>{message.content}</ReactMarkdown>
                                        </div>
                                    )
                                ) : (
                                    <p className="whitespace-pre-wrap">{message.content}</p>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-background-primary border border-border text-text-primary rounded-lg p-3">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-accent-purple rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-accent-purple rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-accent-purple rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-border">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about the position..."
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 bg-background-primary border border-border text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-purple disabled:opacity-50 placeholder:text-text-secondary"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-6 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-pixel drop-shadow-lg"
                    >
                        Send
                    </button>
                    {onGetHint && (
                        <button
                            type="button"
                            onClick={onGetHint}
                            disabled={isLoading}
                            className="p-2 bg-accent-cyan text-white rounded-lg hover:bg-[#0fc9ad] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Get Hint"
                        >
                            <Lightbulb className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
