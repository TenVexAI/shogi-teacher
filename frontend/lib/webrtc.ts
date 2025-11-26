/**
 * WebRTC P2P Connection Manager for Shogi Teacher Online Play
 * 
 * Handles peer-to-peer connections for game moves, chat, and action requests.
 * Uses the connection server for signaling only - all game data is P2P.
 */

// =============================================================================
// Types
// =============================================================================

export type P2PMessageType = 
  | 'move'           // Game move
  | 'chat'           // Chat message
  | 'quick_phrase'   // Quick phrase (Japanese)
  | 'action_request' // Request for mutual action (pause, new game, revert)
  | 'action_response'// Response to action request
  | 'game_config'    // Game configuration from initiator
  | 'clock_sync'     // Clock synchronization
  | 'sync_state'     // State synchronization
  | 'heartbeat'      // Keepalive ping
  | 'ack';           // Message acknowledgment

export interface P2PMessage {
  id: string;
  type: P2PMessageType;
  timestamp: number;
  payload: unknown;
}

export interface MovePayload {
  usi: string;           // USI format move
  sfen: string;          // Position after move
  moveNumber: number;
  timeSpent: number;     // Time spent in ms
}

export interface ChatPayload {
  text: string;
  japanese?: string;     // For quick phrases
}

export interface ActionRequestPayload {
  action: 'pause' | 'resume' | 'new_game' | 'revert' | 'toggle_teaching';
  data?: unknown;        // Additional data (e.g., revert to move number)
}

export interface ActionResponsePayload {
  requestId: string;
  accepted: boolean;
}

export interface SyncStatePayload {
  sfen: string;
  moveHistory: string[];  // List of USI moves
  currentMoveNumber: number;
}

export interface GameConfigPayload {
  sfen: string;                    // Starting position
  blackName: string;
  whiteName: string;
  isClockRunning: boolean;
  gameTime: number;                // Current game time in ms
}

export interface ClockSyncPayload {
  isRunning: boolean;
  gameTime: number;                // Current game time in ms
  lastUpdateTime: number;          // Timestamp of last update
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface WebRTCCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onMessage: (message: P2PMessage) => void;
  onError: (error: string) => void;
}

// =============================================================================
// WebRTC Manager
// =============================================================================

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private callbacks: WebRTCCallbacks;
  private pendingAcks: Map<string, { resolve: () => void; timeout: NodeJS.Timeout }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeatReceived: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  
  // Signaling callbacks - set by the online play component
  public onSendSignal: ((type: 'offer' | 'answer' | 'ice_candidate', data: unknown) => void) | null = null;

  constructor(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks;
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * Initialize a new peer connection (as the initiator/caller)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    await this.setupPeerConnection();
    
    // Create data channel (only the caller creates it)
    this.dataChannel = this.peerConnection!.createDataChannel('game', {
      ordered: true,  // Ensure message order
    });
    this.setupDataChannel(this.dataChannel);

    // Create and set local offer
    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    return offer;
  }

  /**
   * Handle an incoming offer (as the callee/receiver)
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.setupPeerConnection();
    
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    return answer;
  }

  /**
   * Handle an incoming answer
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Handle an incoming ICE candidate
   */
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Set up the RTCPeerConnection
   */
  private async setupPeerConnection(): Promise<void> {
    this.setConnectionState('connecting');

    // STUN/TURN servers for NAT traversal
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onSendSignal) {
        this.onSendSignal('ice_candidate', event.candidate.toJSON());
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('WebRTC connection state:', state);

      switch (state) {
        case 'connected':
          this.setConnectionState('connected');
          this.startHeartbeat();
          this.reconnectAttempts = 0;
          break;
        case 'disconnected':
        case 'failed':
          this.setConnectionState('failed');
          this.stopHeartbeat();
          this.attemptReconnect();
          break;
        case 'closed':
          this.setConnectionState('disconnected');
          this.stopHeartbeat();
          break;
      }
    };

    // Handle incoming data channel (for the callee)
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };
  }

  /**
   * Set up the data channel event handlers
   */
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log('Data channel opened');
      this.setConnectionState('connected');
    };

    channel.onclose = () => {
      console.log('Data channel closed');
      this.setConnectionState('disconnected');
    };

    channel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.callbacks.onError('Data channel error');
    };

    channel.onmessage = (event) => {
      try {
        const message: P2PMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (e) {
        console.error('Failed to parse P2P message:', e);
      }
    };
  }

  /**
   * Close the connection
   */
  close(): void {
    this.stopHeartbeat();
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clear pending acks
    for (const [, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
    }
    this.pendingAcks.clear();

    this.setConnectionState('disconnected');
  }

  /**
   * Attempt to reconnect after a failure
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onError('Connection failed after multiple attempts');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    // The actual reconnection will be initiated by the signaling layer
    // This just signals that we should try again
    this.setConnectionState('connecting');
  }

  // ---------------------------------------------------------------------------
  // Message Handling
  // ---------------------------------------------------------------------------

  /**
   * Send a message to the peer
   */
  send(type: P2PMessageType, payload: unknown, requireAck: boolean = false): string {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not open');
    }

    const message: P2PMessage = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      payload,
    };

    this.dataChannel.send(JSON.stringify(message));

    if (requireAck) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingAcks.delete(message.id);
          reject(new Error('Message acknowledgment timeout'));
        }, 5000);

        this.pendingAcks.set(message.id, { resolve: () => resolve(message.id), timeout });
      }) as unknown as string;
    }

    return message.id;
  }

  /**
   * Handle an incoming message
   */
  private handleMessage(message: P2PMessage): void {
    // Handle acks
    if (message.type === 'ack') {
      const ackPayload = message.payload as { messageId: string };
      const pending = this.pendingAcks.get(ackPayload.messageId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve();
        this.pendingAcks.delete(ackPayload.messageId);
      }
      return;
    }

    // Handle heartbeat
    if (message.type === 'heartbeat') {
      this.lastHeartbeatReceived = Date.now();
      // Send ack for heartbeat
      this.sendAck(message.id);
      return;
    }

    // Forward other messages to callback
    this.callbacks.onMessage(message);

    // Send ack for important message types
    if (['move', 'action_request', 'action_response', 'sync_state'].includes(message.type)) {
      this.sendAck(message.id);
    }
  }

  /**
   * Send an acknowledgment
   */
  private sendAck(messageId: string): void {
    if (this.dataChannel?.readyState === 'open') {
      const ack: P2PMessage = {
        id: crypto.randomUUID(),
        type: 'ack',
        timestamp: Date.now(),
        payload: { messageId },
      };
      this.dataChannel.send(JSON.stringify(ack));
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeatReceived = Date.now();

    this.heartbeatInterval = setInterval(() => {
      // Send heartbeat
      if (this.dataChannel?.readyState === 'open') {
        this.send('heartbeat', { timestamp: Date.now() });
      }

      // Check for timeout (no heartbeat received in 15 seconds)
      if (Date.now() - this.lastHeartbeatReceived > 15000) {
        console.warn('Heartbeat timeout, connection may be lost');
        this.callbacks.onError('Connection timeout');
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.callbacks.onConnectionStateChange(state);
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && 
           this.dataChannel?.readyState === 'open';
  }

  // ---------------------------------------------------------------------------
  // Convenience Methods
  // ---------------------------------------------------------------------------

  /**
   * Send a game move
   */
  sendMove(usi: string, sfen: string, moveNumber: number, timeSpent: number): void {
    const payload: MovePayload = { usi, sfen, moveNumber, timeSpent };
    this.send('move', payload, true);
  }

  /**
   * Send a chat message
   */
  sendChat(text: string, japanese?: string): void {
    const payload: ChatPayload = { text, japanese };
    this.send(japanese ? 'quick_phrase' : 'chat', payload);
  }

  /**
   * Send an action request (pause, new game, etc.)
   */
  sendActionRequest(action: ActionRequestPayload['action'], data?: unknown): string {
    const payload: ActionRequestPayload = { action, data };
    return this.send('action_request', payload, true);
  }

  /**
   * Send an action response
   */
  sendActionResponse(requestId: string, accepted: boolean): void {
    const payload: ActionResponsePayload = { requestId, accepted };
    this.send('action_response', payload);
  }

  /**
   * Send state sync
   */
  sendStateSync(sfen: string, moveHistory: string[], currentMoveNumber: number): void {
    const payload: SyncStatePayload = { sfen, moveHistory, currentMoveNumber };
    this.send('sync_state', payload, true);
  }

  /**
   * Send game configuration (initiator -> accepter when starting game)
   */
  sendGameConfig(sfen: string, blackName: string, whiteName: string, isClockRunning: boolean, gameTime: number): void {
    const payload: GameConfigPayload = { sfen, blackName, whiteName, isClockRunning, gameTime };
    this.send('game_config', payload, true);
  }

  /**
   * Send clock synchronization
   */
  sendClockSync(isRunning: boolean, gameTime: number): void {
    const payload: ClockSyncPayload = { isRunning, gameTime, lastUpdateTime: Date.now() };
    this.send('clock_sync', payload);
  }
}
