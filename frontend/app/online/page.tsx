'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, LogIn, LogOut, Users, Send, Wifi, WifiOff, MessageSquare, Radio, AlertCircle, Check, X } from 'lucide-react';
import { WebRTCManager, ConnectionState, P2PMessage, ChatPayload, ActionRequestPayload, ActionResponsePayload } from '@/lib/webrtc';
import type { ActionType, OnlineStateUpdate, ActionRequest, MainToOnlinePlayMessage } from '@/types/online-play';

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
  
  // WebRTC P2P state
  const [p2pState, setP2pState] = useState<ConnectionState>('disconnected');
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const isInitiatorRef = useRef<boolean>(false);
  
  // Action request state (for mutual game actions)
  const [pendingActionRequest, setPendingActionRequest] = useState<{
    id: string;
    action: ActionType;
    fromOpponent: boolean;
    timestamp: number;
    data?: unknown;  // Store request data (e.g., moveIndex for revert)
  } | null>(null);
  const [actionCountdown, setActionCountdown] = useState(30);
  const actionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track pending action request data (avoids stale closure issues)
  const pendingActionRequestRef = useRef<{ action: ActionType; data?: unknown } | null>(null);
  
  // Message handler ref to avoid stale closure issues
  const messageHandlerRef = useRef<(message: Record<string, unknown>) => void>(() => {});
  
  // WebRTC handler refs (to avoid declaration order issues)
  const initializeWebRTCRef = useRef<(isInitiator: boolean, opponentId?: string) => Promise<void>>(async () => {});
  const handleWebRTCOfferRef = useRef<(offer: RTCSessionDescriptionInit) => Promise<void>>(async () => {});
  const handleWebRTCAnswerRef = useRef<(answer: RTCSessionDescriptionInit) => Promise<void>>(async () => {});
  const handleWebRTCIceCandidateRef = useRef<(candidate: RTCIceCandidateInit) => Promise<void>>(async () => {});

  // Handle server messages - defined first so it can be referenced
  const handleServerMessage = useCallback((message: Record<string, unknown>) => {
    console.log('Server message:', message.type, message);

    switch (message.type) {
      case 'auth_success':
        setIsConnected(true);
        setIsConnecting(false);
        setCurrentUser(message.user as User);
        
        // Clear stale state from any previous session
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setOpponent(null);
        setChatMessages([]);
        setMyStatus('available');
        
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

      case 'request_sent':
        // Our request was successfully sent - add to outgoing requests
        setOutgoingRequests(prev => [...prev, message.request as GameRequest]);
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
        const opponentUser = message.opponent as User;
        setOpponent(opponentUser);
        setMyStatus('in_game');
        isInitiatorRef.current = message.is_initiator as boolean;
        // Clear any pending game requests since we're now in a game
        setIncomingRequests([]);
        setOutgoingRequests([]);
        // Initialize WebRTC - initiator creates offer (pass opponent ID directly)
        initializeWebRTCRef.current(message.is_initiator as boolean, opponentUser.id);
        break;

      case 'opponent_disconnected':
        setOpponent(null);
        setMyStatus('available');
        setChatMessages([]);
        // Close WebRTC connection
        webrtcRef.current?.close();
        webrtcRef.current = null;
        setP2pState('disconnected');
        break;

      // WebRTC Signaling (relayed from opponent)
      case 'rtc_offer':
        handleWebRTCOfferRef.current({ type: 'offer', sdp: message.sdp as string });
        break;

      case 'rtc_answer':
        handleWebRTCAnswerRef.current({ type: 'answer', sdp: message.sdp as string });
        break;

      case 'rtc_ice':
        handleWebRTCIceCandidateRef.current(message.candidate as RTCIceCandidateInit);
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

  // Handle P2P messages from WebRTC
  const handleP2PMessage = useCallback((message: P2PMessage) => {
    console.log('P2P message:', message.type, message);

    switch (message.type) {
      case 'chat':
      case 'quick_phrase': {
        const payload = message.payload as ChatPayload;
        setChatMessages(prev => [...prev, {
          id: message.id,
          sender: opponent?.username || 'Opponent',
          japanese: payload.japanese,
          english: payload.text,
          isQuickPhrase: message.type === 'quick_phrase',
          timestamp: new Date(message.timestamp),
        }]);
        break;
      }
      case 'move': {
        // Forward move to main window
        const movePayload = message.payload as { usi: string; sfen: string; moveNumber: number };
        console.log('Received move:', movePayload);
        if (window.electron) {
          window.electron.sendToMainWindow({
            type: 'move_received',
            usi: movePayload.usi,
            sfen: movePayload.sfen,
            moveNumber: movePayload.moveNumber,
          });
        }
        break;
      }
      case 'action_request': {
        // Opponent is requesting a mutual action
        const actionPayload = message.payload as ActionRequestPayload;
        console.log('Received action request:', actionPayload);
        
        // Clear any existing timeout
        if (actionTimeoutRef.current) {
          clearTimeout(actionTimeoutRef.current);
        }
        
        // Set pending request (include data for actions like revert that need it)
        setPendingActionRequest({
          id: message.id,
          action: actionPayload.action as ActionType,
          fromOpponent: true,
          timestamp: Date.now(),
          data: actionPayload.data,  // Store the request data (e.g., moveIndex for revert)
        });
        
        // Auto-decline after 2 minutes
        actionTimeoutRef.current = setTimeout(() => {
          if (webrtcRef.current?.isConnected()) {
            webrtcRef.current.sendActionResponse(message.id, false, actionPayload.action);
          }
          setPendingActionRequest(null);
        }, 120000); // 2 minutes
        
        // Notify main window
        if (window.electron) {
          window.electron.sendToMainWindow({
            type: 'action_request_received',
            requestId: message.id,
            action: actionPayload.action,
            requestedBy: 'opponent',
          } as ActionRequest);
        }
        break;
      }
      case 'action_response': {
        // Opponent responded to our action request
        const responsePayload = message.payload as ActionResponsePayload;
        console.log('Received action response:', responsePayload);
        
        // Clear timeout
        if (actionTimeoutRef.current) {
          clearTimeout(actionTimeoutRef.current);
          actionTimeoutRef.current = null;
        }
        
        // Capture the request data from ref before clearing
        const requestData = pendingActionRequestRef.current?.data;
        pendingActionRequestRef.current = null;
        
        // Always clear pending request when we receive a response
        // (we can only have one pending request at a time, so any response clears it)
        setPendingActionRequest(null);
        
        // Notify main window (include data for actions like revert that need it)
        if (window.electron) {
          window.electron.sendToMainWindow({
            type: 'action_response_received',
            requestId: responsePayload.requestId,
            accepted: responsePayload.accepted,
            action: responsePayload.action,
            data: requestData,  // Include original request data
          });
        }
        break;
      }
      case 'sync_state':
        // TODO: Handle state sync
        console.log('Received state sync:', message.payload);
        break;
      case 'game_config': {
        // Initiator sent game configuration - forward to main window (accepter)
        const configPayload = message.payload as { sfen: string; blackName: string; whiteName: string; isClockRunning: boolean; gameTime: number; initiatorColor: 'b' | 'w' };
        console.log('Received game config:', configPayload);
        if (window.electron) {
          window.electron.sendToMainWindow({
            type: 'game_config_received',
            sfen: configPayload.sfen,
            blackName: configPayload.blackName,
            whiteName: configPayload.whiteName,
            isClockRunning: configPayload.isClockRunning,
            gameTime: configPayload.gameTime,
            initiatorColor: configPayload.initiatorColor,
          });
        }
        break;
      }
      case 'clock_sync': {
        // Opponent sent clock sync - forward to main window
        const clockPayload = message.payload as { isRunning: boolean; gameTime: number };
        console.log('Received clock sync:', clockPayload);
        if (window.electron) {
          window.electron.sendToMainWindow({
            type: 'clock_sync_received',
            isRunning: clockPayload.isRunning,
            gameTime: clockPayload.gameTime,
          });
        }
        break;
      }
    }
  }, [opponent?.username]);

  // Initialize WebRTC connection
  const initializeWebRTC = useCallback(async (isInitiator: boolean, opponentId?: string) => {
    // Clean up existing connection
    if (webrtcRef.current) {
      webrtcRef.current.close();
    }

    // Create new WebRTC manager
    const rtc = new WebRTCManager({
      onConnectionStateChange: (state) => {
        console.log('P2P connection state:', state);
        setP2pState(state);
      },
      onMessage: handleP2PMessage,
      onError: (error) => {
        console.error('P2P error:', error);
      },
    });

    // Set up signaling - send to opponent via server relay
    // Use the opponentId passed to this function, not the closure's opponent state
    const targetId = opponentId || opponent?.id;
    rtc.onSendSignal = (type, data) => {
      if (!targetId) {
        console.error('No opponent ID for signaling');
        return;
      }

      switch (type) {
        case 'offer':
          sendMessage({ 
            type: 'rtc_offer', 
            target_user_id: targetId, 
            sdp: (data as RTCSessionDescriptionInit).sdp 
          });
          break;
        case 'answer':
          sendMessage({ 
            type: 'rtc_answer', 
            target_user_id: targetId, 
            sdp: (data as RTCSessionDescriptionInit).sdp 
          });
          break;
        case 'ice_candidate':
          sendMessage({ 
            type: 'rtc_ice', 
            target_user_id: targetId, 
            candidate: data 
          });
          break;
      }
    };

    webrtcRef.current = rtc;

    // If initiator, create and send offer
    const targetOpponentId = opponentId || opponent?.id;
    if (isInitiator && targetOpponentId) {
      try {
        const offer = await rtc.createOffer();
        sendMessage({ 
          type: 'rtc_offer', 
          target_user_id: targetOpponentId, 
          sdp: offer.sdp 
        });
      } catch (error) {
        console.error('Failed to create offer:', error);
      }
    }
  }, [handleP2PMessage, sendMessage, opponent?.id]);

  // Handle incoming WebRTC offer
  const handleWebRTCOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!webrtcRef.current) {
      // Initialize WebRTC if not already done (receiver side)
      await initializeWebRTC(false, opponent?.id);
    }
    
    try {
      const answer = await webrtcRef.current!.handleOffer(offer);
      // Send answer back through server signaling
      if (opponent?.id) {
        sendMessage({ 
          type: 'rtc_answer', 
          target_user_id: opponent.id, 
          sdp: answer.sdp 
        });
      }
    } catch (error) {
      console.error('Failed to handle offer:', error);
    }
  }, [initializeWebRTC, sendMessage, opponent?.id]);

  // Handle incoming WebRTC answer
  const handleWebRTCAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!webrtcRef.current) return;
    
    try {
      await webrtcRef.current.handleAnswer(answer);
    } catch (error) {
      console.error('Failed to handle answer:', error);
    }
  }, []);

  // Handle incoming ICE candidate
  const handleWebRTCIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!webrtcRef.current) return;
    
    try {
      await webrtcRef.current.handleIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error);
    }
  }, []);

  // Keep message handler ref updated
  useEffect(() => {
    messageHandlerRef.current = handleServerMessage;
  }, [handleServerMessage]);

  // Keep WebRTC handler refs updated
  useEffect(() => {
    initializeWebRTCRef.current = initializeWebRTC;
    handleWebRTCOfferRef.current = handleWebRTCOffer;
    handleWebRTCAnswerRef.current = handleWebRTCAnswer;
    handleWebRTCIceCandidateRef.current = handleWebRTCIceCandidate;
  }, [initializeWebRTC, handleWebRTCOffer, handleWebRTCAnswer, handleWebRTCIceCandidate]);

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
    
    // Send via P2P
    if (webrtcRef.current?.isConnected()) {
      webrtcRef.current.sendChat(phrase.english, phrase.japanese);
    }
  };

  // Accept action request from opponent
  const handleAcceptActionRequest = () => {
    if (!pendingActionRequest || !pendingActionRequest.fromOpponent) return;
    
    if (webrtcRef.current?.isConnected()) {
      webrtcRef.current.sendActionResponse(pendingActionRequest.id, true, pendingActionRequest.action);
    }
    
    // Clear timeout
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    
    // For most actions, notify main window to execute the action locally too
    // Exception: 'new_game' - accepter just waits for game config from requester
    if (window.electron && pendingActionRequest.action !== 'new_game') {
      window.electron.sendToMainWindow({
        type: 'action_response_received',
        requestId: pendingActionRequest.id,
        accepted: true,
        action: pendingActionRequest.action,
        data: pendingActionRequest.data,  // Include data so main window can execute the action
      });
    }
    
    setPendingActionRequest(null);
  };

  // Decline action request from opponent
  const handleDeclineActionRequest = () => {
    if (!pendingActionRequest || !pendingActionRequest.fromOpponent) return;
    
    if (webrtcRef.current?.isConnected()) {
      webrtcRef.current.sendActionResponse(pendingActionRequest.id, false, pendingActionRequest.action);
    }
    
    // Clear timeout
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    
    setPendingActionRequest(null);
  };

  // Send chat message
  const handleSendChat = () => {
    if (!chatInput.trim() || !opponent) return;
    
    const text = chatInput.trim();
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: currentUser?.username || 'You',
      english: text,
      isQuickPhrase: false,
      timestamp: new Date(),
    };
    
    setChatMessages(prev => [...prev, message]);
    setChatInput('');
    
    // Send via P2P
    if (webrtcRef.current?.isConnected()) {
      webrtcRef.current.sendChat(text);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      webrtcRef.current?.close();
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Action request countdown timer
  useEffect(() => {
    if (pendingActionRequest) {
      setActionCountdown(120); // 2 minutes
      countdownIntervalRef.current = setInterval(() => {
        setActionCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setActionCountdown(120);
    }
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [pendingActionRequest]);

  // Send online state updates to main window
  useEffect(() => {
    if (window.electron) {
      const stateUpdate: OnlineStateUpdate = {
        type: 'online_state_update',
        isInGame: opponent !== null,
        isP2PConnected: p2pState === 'connected',
        opponentName: opponent?.username || null,
        currentUserName: currentUser?.username || null,
        isInitiator: isInitiatorRef.current,
      };
      window.electron.sendToMainWindow(stateUpdate);
      
      // When P2P connects and user is initiator, tell main window to open new game modal
      if (p2pState === 'connected' && isInitiatorRef.current && opponent) {
        window.electron.sendToMainWindow({
          type: 'open_new_game_modal',
          opponentName: opponent.username,
        });
      }
    }
  }, [opponent, p2pState, currentUser]);

  // Listen for messages from main window
  useEffect(() => {
    if (!window.electron) return;

    const unsubscribe = window.electron.onMainWindowMessage((message) => {
      const msg = message as MainToOnlinePlayMessage;
      console.log('Message from main window:', msg);

      switch (msg.type) {
        case 'request_action':
          // Main window wants to request an action
          if (webrtcRef.current?.isConnected() && !pendingActionRequest) {
            const requestId = webrtcRef.current.sendActionRequest(msg.action, msg.data);
            // Store in ref for use in response handler (avoids stale closure)
            pendingActionRequestRef.current = { action: msg.action, data: msg.data };
            setPendingActionRequest({
              id: requestId,
              action: msg.action,
              fromOpponent: false,
              timestamp: Date.now(),
              data: msg.data,  // Store the data for when response comes back
            });
            
            // Auto-cancel after 30 seconds
            actionTimeoutRef.current = setTimeout(() => {
              setPendingActionRequest(null);
              if (window.electron) {
                window.electron.sendToMainWindow({
                  type: 'action_response_received',
                  requestId,
                  accepted: false,
                  action: msg.action,
                });
              }
            }, 120000); // 2 minutes
          }
          break;

        case 'send_move':
          // Main window wants to send a move
          if (webrtcRef.current?.isConnected()) {
            webrtcRef.current.sendMove(msg.usi, msg.sfen, msg.moveNumber, 0);
          }
          break;

        case 'cancel_action_request':
          // Main window wants to cancel a pending action request
          if (pendingActionRequest?.id === msg.requestId) {
            if (actionTimeoutRef.current) {
              clearTimeout(actionTimeoutRef.current);
              actionTimeoutRef.current = null;
            }
            setPendingActionRequest(null);
          }
          break;

        case 'send_game_config': {
          // Main window (initiator) wants to send game config to opponent
          const configMsg = msg as { type: string; sfen: string; blackName: string; whiteName: string; isClockRunning: boolean; gameTime: number; initiatorColor: 'b' | 'w' };
          if (webrtcRef.current?.isConnected()) {
            webrtcRef.current.sendGameConfig(
              configMsg.sfen,
              configMsg.blackName,
              configMsg.whiteName,
              configMsg.isClockRunning,
              configMsg.gameTime,
              configMsg.initiatorColor
            );
          }
          break;
        }

        case 'send_clock_sync': {
          // Main window wants to sync clock with opponent
          const clockMsg = msg as { type: string; isRunning: boolean; gameTime: number };
          if (webrtcRef.current?.isConnected()) {
            webrtcRef.current.sendClockSync(clockMsg.isRunning, clockMsg.gameTime);
          }
          break;
        }
      }
    });

    return unsubscribe;
  }, [pendingActionRequest]);

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
                        (() => {
                          const hasPendingOutgoing = outgoingRequests.some(req => req.recipient_id === user.id);
                          const hasPendingIncoming = incomingRequests.some(req => req.sender_id === user.id);
                          return hasPendingOutgoing ? (
                            <span className="text-yellow-500 text-sm">Pending...</span>
                          ) : hasPendingIncoming ? (
                            <span className="text-[#3cf281] text-sm">Accept above ↑</span>
                          ) : (
                            <button
                              onClick={() => handleRequestGame(user.id)}
                              disabled={outgoingRequests.length >= 3}
                              className="bg-accent-purple hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm"
                            >
                              Challenge
                            </button>
                          );
                        })()
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
              {/* P2P Status */}
              <div className="flex items-center gap-1 ml-2">
                <Radio className={`w-3 h-3 ${
                  p2pState === 'connected' ? 'text-[#3cf281]' :
                  p2pState === 'connecting' ? 'text-yellow-500 animate-pulse' :
                  'text-gray-500'
                }`} />
                <span className={`text-xs ${
                  p2pState === 'connected' ? 'text-[#3cf281]' :
                  p2pState === 'connecting' ? 'text-yellow-500' :
                  'text-gray-500'
                }`}>
                  {p2pState === 'connected' ? 'P2P' : 
                   p2pState === 'connecting' ? 'Connecting...' : 'No P2P'}
                </span>
              </div>
            </div>
            
            <button
              onClick={handleEndGame}
              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
            >
              End Game
            </button>
          </div>

          {/* Pending Action Request */}
          {pendingActionRequest && (
            <div className={`rounded p-3 ${
              pendingActionRequest.fromOpponent 
                ? 'bg-yellow-900/30 border border-yellow-600' 
                : 'bg-blue-900/30 border border-blue-600'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className={`w-5 h-5 ${
                    pendingActionRequest.fromOpponent ? 'text-yellow-500' : 'text-blue-400'
                  }`} />
                  <div>
                    <div className="font-medium">
                      {pendingActionRequest.fromOpponent 
                        ? `${opponent.username} requests: ` 
                        : 'Waiting for approval: '}
                      <span className="text-accent-cyan">
                        {pendingActionRequest.action === 'pause' ? 'Pause Game' :
                         pendingActionRequest.action === 'resume' ? 'Resume Game' :
                         pendingActionRequest.action === 'new_game' ? 'New Game' :
                         pendingActionRequest.action === 'revert' ? 'Revert Move' :
                         pendingActionRequest.action === 'toggle_teaching' ? 'Toggle Teaching Assistant' :
                         pendingActionRequest.action}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {actionCountdown}s remaining
                    </div>
                  </div>
                </div>
                
                {pendingActionRequest.fromOpponent ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleAcceptActionRequest}
                      className="bg-[#3cf281] hover:bg-[#2bd96f] text-black p-2 rounded"
                      title="Accept"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDeclineActionRequest}
                      className="bg-red-600 hover:bg-red-700 p-2 rounded"
                      title="Decline"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 animate-pulse">
                    Waiting...
                  </div>
                )}
              </div>
            </div>
          )}

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
