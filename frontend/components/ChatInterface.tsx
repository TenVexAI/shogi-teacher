'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatInterfaceProps {
    messages: Message[];
    onSendMessage: (message: string) => void;
    isLoading?: boolean;
    onGetHint?: () => void;
    onOpenSettings?: () => void;
}

export default function ChatInterface({ messages, onSendMessage, isLoading, onGetHint, onOpenSettings }: ChatInterfaceProps) {
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
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-xl font-bold font-pixel drop-shadow-lg">Shogi Teacher</h2>
                        <p className="text-sm opacity-90">Ask questions about the position or request analysis</p>
                    </div>
                    {onOpenSettings && (
                        <button
                            onClick={onOpenSettings}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                            title="Settings"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-text-secondary mt-8">
                        <p className="text-lg">Welcome to Shogi Teacher!</p>
                        <p className="text-sm mt-2">Make a move or ask a question to get started.</p>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user'
                                    ? 'bg-accent-purple text-white'
                                    : 'bg-background-primary border border-border text-text-primary'
                                }`}
                        >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                    </div>
                ))}

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
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                                <path d="M9 18h6"/>
                                <path d="M10 22h4"/>
                            </svg>
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
