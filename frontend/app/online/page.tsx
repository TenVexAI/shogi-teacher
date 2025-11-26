'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, LogIn, LogOut, Users, Send, Wifi, WifiOff, MessageSquare } from 'lucide-react';

// Server URL - will be configurable later
const SERVER_URL = 'wss://shogi.tenvexai.com/ws';

// OAuth providers
type OAuthProvider = 'twitch' | 'discord' | 'github';

// User status
type UserStatus = 'available' | 'away' | 'in_game';

// User info
interface User {
  id: string;
  username: string;
  provider: OAuthProvider;
  status: UserStatus;
}

// Game request
interface GameRequest {
  id: string;
  sender_id: string;
  sender_username: string;
  recipient_id: string;
  recipient_username: string;
}

// Quick phrases with Japanese and English
const QUICK_PHRASES = [
  { emoji: '🙏', japanese: 'よろしくお願いします', romaji: 'Yoroshiku onegai-shimasu', english: "Let's have a good game" },
  { emoji: '🙇', japanese: 'ありがとうございました', romaji: 'Arigatou gozaimashita', english: 'Thank you very much' },
  { emoji: '🏳️', japanese: '負けました', romaji: 'Makemashita', english: 'I was defeated' },
];

interface ChatMessage {
  id: string;
  sender: string;
  japanese?: string;
  english: string;
  isQuickPhrase: boolean;
  timestamp: Date;
}

export default function OnlinePlayPage() {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [, setAuthToken] = useState<string | null>(null);
  
  // Lobby state
  const [users, setUsers] = useState<User[]>([]);
  const [myStatus, setMyStatus] = useState<UserStatus>('available');
  
  // Game request state
  const [incomingRequests, setIncomingRequests] = useState<GameRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<GameRequest[]>([]);
  
  // Connected opponent (when in game)
  const [opponent, setOpponent] = useState<User | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  
  // Connection quality (ping in ms)
  const [latency, setLatency] = useState<number | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingTimeRef = useRef<number>(0);
  
  // Message handler ref to avoid stale closure issues
  const messageHandlerRef = useRef<(message: Record<string, unknown>) => void>(() => {});

  // Handle server messages - defined first so it can be referenced
  const handleServerMessage = useCallback((message: Record<string, unknown>) => {
    console.log('Server message:', message.type, message);

    switch (message.type) {
      case 'auth_success':
        setIsConnected(true);
        setIsConnecting(false);
        setCurrentUser(message.user as User);
        
        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            lastPingTimeRef.current = Date.now();
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 5000);
        break;

      case 'auth_error':
        setConnectionError(message.message as string);
        setIsConnecting(false);
        break;

      case 'lobby_update':
        setUsers((message.users as User[]) || []);
        const requests = (message.pending_requests as GameRequest[]) || [];
        setIncomingRequests(requests.filter(r => r.recipient_id === currentUser?.id));
        setOutgoingRequests(requests.filter(r => r.sender_id === currentUser?.id));
        break;

      case 'user_joined':
        setUsers(prev => [...prev.filter(u => u.id !== (message.user as User).id), message.user as User]);
        break;

      case 'user_left':
        setUsers(prev => prev.filter(u => u.id !== message.user_id));
        break;

      case 'user_status_changed':
        setUsers(prev => prev.map(u => 
          u.id === message.user_id ? { ...u, status: message.status as UserStatus } : u
        ));
        break;

      case 'request_received':
        setIncomingRequests(prev => [...prev, message.request as GameRequest]);
        break;

      case 'request_accepted':
        setOutgoingRequests(prev => prev.filter(r => r.id !== message.request_id));
        setOpponent(message.opponent as User);
        setMyStatus('in_game');
        break;

      case 'request_declined':
      case 'request_revoked':
      case 'request_canceled':
        setIncomingRequests(prev => prev.filter(r => r.id !== message.request_id));
        setOutgoingRequests(prev => prev.filter(r => r.id !== message.request_id));
        break;

      case 'game_started':
        setOpponent(message.opponent as User);
        setMyStatus('in_game');
        break;

      case 'opponent_disconnected':
        setOpponent(null);
        setMyStatus('available');
        setChatMessages([]);
        break;

      case 'pong':
        if (lastPingTimeRef.current) {
          setLatency(Date.now() - lastPingTimeRef.current);
        }
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;
    }
  }, [currentUser?.id]);

  // Send message to server
  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Keep message handler ref updated
  useEffect(() => {
    messageHandlerRef.current = handleServerMessage;
  }, [handleServerMessage]);

  // Connect to server
  const connectToServer = useCallback((token: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected, sending auth...');
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          messageHandlerRef.current(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('Connection error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionError('Failed to connect to server');
      setIsConnecting(false);
    }
  }, []);

  // OAuth login
  const handleLogin = async (provider: OAuthProvider) => {
    try {
      // Get auth URL from server
      const response = await fetch(`https://shogi.tenvexai.com/auth/${provider}/login?redirect_uri=${encodeURIComponent(window.location.origin + '/online')}`);
      const data = await response.json();
      
      if (data.auth_url) {
        // Redirect current window to OAuth provider
        window.location.href = data.auth_url;
      } else {
        setConnectionError('Failed to get auth URL');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      setConnectionError('Failed to start login');
    }
  };

  // Disconnect
  const handleDisconnect = () => {
    wsRef.current?.close();
    setCurrentUser(null);
    setAuthToken(null);
    setUsers([]);
    setOpponent(null);
    setChatMessages([]);
  };

  // Set status
  const handleSetStatus = (status: UserStatus) => {
    sendMessage({ type: 'set_status', status });
    setMyStatus(status);
  };

  // Request game
  const handleRequestGame = (userId: string) => {
    sendMessage({ type: 'request_game', target_user_id: userId });
  };

  // Accept request
  const handleAcceptRequest = (requestId: string) => {
    sendMessage({ type: 'accept_request', request_id: requestId });
  };

  // Decline request
  const handleDeclineRequest = (requestId: string) => {
    sendMessage({ type: 'decline_request', request_id: requestId });
  };

  // Revoke request
  const handleRevokeRequest = (requestId: string) => {
    sendMessage({ type: 'revoke_request', request_id: requestId });
  };

  // End game
  const handleEndGame = () => {
    sendMessage({ type: 'end_game' });
    setOpponent(null);
    setMyStatus('available');
    setChatMessages([]);
  };

  // Send quick phrase
  const handleSendQuickPhrase = (phrase: typeof QUICK_PHRASES[0]) => {
    if (!opponent) return;
    
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: currentUser?.username || 'You',
      japanese: phrase.japanese,
      english: phrase.english,
      isQuickPhrase: true,
      timestamp: new Date(),
    };
    
    setChatMessages(prev => [...prev, message]);
    
    // TODO: Send via P2P when WebRTC is implemented
  };

  // Send chat message
  const handleSendChat = () => {
    if (!chatInput.trim() || !opponent) return;
    
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: currentUser?.username || 'You',
      english: chatInput.trim(),
      isQuickPhrase: false,
      timestamp: new Date(),
    };
    
    setChatMessages(prev => [...prev, message]);
    setChatInput('');
    
    // TODO: Send via P2P when WebRTC is implemented
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, []);

  // Check for token in URL (OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setAuthToken(token);
      connectToServer(token);
      // Clean URL
      window.history.replaceState({}, '', '/online');
    }
  }, [connectToServer]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black from-40% to-[#2a1a3d] text-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-6 h-6 text-accent-cyan" />
          <h1 className="text-xl font-pixel text-accent-cyan">Online Play</h1>
        </div>
        
        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-[#3cf281]" />
              <span className="text-sm text-[#3cf281]">Connected</span>
              {latency !== null && (
                <span className="text-xs text-gray-400">{latency}ms</span>
              )}
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-500">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {connectionError && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4">
          {connectionError}
        </div>
      )}

      {/* Not logged in */}
      {!currentUser && !isConnecting && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-gray-400 mb-4">Login with your preferred platform:</p>
          
          <button
            onClick={() => handleLogin('twitch')}
            className="w-48 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Login with Twitch
          </button>
          
          <button
            onClick={() => handleLogin('discord')}
            className="w-48 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Login with Discord
          </button>
          
          <button
            onClick={() => handleLogin('github')}
            className="w-48 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Login with GitHub
          </button>
        </div>
      )}

      {/* Connecting */}
      {isConnecting && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Connecting...</div>
        </div>
      )}

      {/* Logged in - Lobby View */}
      {currentUser && !opponent && (
        <div className="flex-1 flex flex-col gap-4">
          {/* User info and status */}
          <div className="flex items-center justify-between bg-[#1a1a1a] rounded p-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{currentUser.username}</span>
              <span className="text-xs text-gray-500">({currentUser.provider})</span>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={myStatus}
                onChange={(e) => handleSetStatus(e.target.value as UserStatus)}
                className="bg-[#252525] border border-gray-700 rounded px-2 py-1 text-sm"
                disabled={myStatus === 'in_game'}
              >
                <option value="available">🟢 Available</option>
                <option value="away">🟡 Away</option>
              </select>
              
              <button
                onClick={handleDisconnect}
                className="text-red-400 hover:text-red-300 p-1"
                title="Disconnect"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Incoming requests */}
          {incomingRequests.length > 0 && (
            <div className="bg-[#3cf281]/10 border border-[#3cf281]/50 rounded p-3">
              <h3 className="text-sm font-medium text-[#3cf281] mb-2">Game Requests</h3>
              {incomingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between py-1">
                  <span>{req.sender_username} wants to play</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptRequest(req.id)}
                      className="bg-[#3cf281] hover:bg-[#2bd96f] text-black px-3 py-1 rounded text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDeclineRequest(req.id)}
                      className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Outgoing requests */}
          {outgoingRequests.length > 0 && (
            <div className="bg-blue-900/30 border border-blue-700 rounded p-3">
              <h3 className="text-sm font-medium text-blue-400 mb-2">Pending Requests</h3>
              {outgoingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between py-1">
                  <span>Waiting for {req.recipient_username}...</span>
                  <button
                    onClick={() => handleRevokeRequest(req.id)}
                    className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Player list */}
          <div className="flex-1 bg-[#1a1a1a] rounded p-3 overflow-auto">
            <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Online Players ({users.filter(u => u.id !== currentUser.id).length})
            </h3>
            
            {users.filter(u => u.id !== currentUser.id).length === 0 ? (
              <p className="text-gray-500 text-sm">No other players online</p>
            ) : (
              <div className="space-y-2">
                {users
                  .filter(u => u.id !== currentUser.id)
                  .map(user => (
                    <div key={user.id} className="flex items-center justify-between py-2 px-2 hover:bg-[#252525] rounded">
                      <div className="flex items-center gap-2">
                        <span className={
                          user.status === 'available' ? 'text-[#3cf281]' :
                          user.status === 'away' ? 'text-yellow-500' : 'text-gray-500'
                        }>●</span>
                        <span>{user.username}</span>
                        <span className="text-xs text-gray-500">({user.provider})</span>
                      </div>
                      
                      {user.status === 'available' && myStatus === 'available' && (
                        <button
                          onClick={() => handleRequestGame(user.id)}
                          disabled={outgoingRequests.length >= 3}
                          className="bg-accent-purple hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm"
                        >
                          Challenge
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* In Game View */}
      {currentUser && opponent && (
        <div className="flex-1 flex flex-col gap-4">
          {/* Opponent info */}
          <div className="flex items-center justify-between bg-[#1a1a1a] rounded p-3">
            <div className="flex items-center gap-2">
              <span className="text-[#3cf281]">●</span>
              <span className="font-medium">Playing with {opponent.username}</span>
            </div>
            
            <button
              onClick={handleEndGame}
              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
            >
              End Game
            </button>
          </div>

          {/* Chat */}
          <div className="flex-1 bg-[#1a1a1a] rounded p-3 flex flex-col">
            <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Chat
            </h3>
            
            {/* Messages */}
            <div className="flex-1 overflow-auto space-y-2 mb-3">
              {chatMessages.map(msg => (
                <div key={msg.id} className={`p-2 rounded ${msg.sender === currentUser.username ? 'bg-accent-purple/20 ml-4' : 'bg-gray-800 mr-4'}`}>
                  <div className="text-xs text-gray-400 mb-1">{msg.sender}</div>
                  {msg.japanese && (
                    <div className="text-sm">{msg.japanese}</div>
                  )}
                  <div className={msg.japanese ? 'text-xs text-gray-400' : 'text-sm'}>{msg.english}</div>
                </div>
              ))}
            </div>

            {/* Quick phrases */}
            <div className="flex gap-2 mb-2">
              {QUICK_PHRASES.map((phrase, i) => (
                <button
                  key={i}
                  onClick={() => handleSendQuickPhrase(phrase)}
                  className="flex-1 bg-[#252525] hover:bg-[#303030] p-2 rounded text-center"
                  title={`${phrase.japanese} - ${phrase.english}`}
                >
                  <span className="text-lg">{phrase.emoji}</span>
                </button>
              ))}
            </div>

            {/* Text input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Type a message..."
                className="flex-1 bg-[#252525] border border-gray-700 rounded px-3 py-2 text-sm"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                className="bg-accent-purple hover:bg-purple-600 disabled:bg-gray-600 p-2 rounded"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
