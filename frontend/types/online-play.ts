/**
 * Inter-window message types for Online Play
 * Used for communication between main window and online play window
 */

// =============================================================================
// Message Types
// =============================================================================

export type OnlinePlayMessageType =
  // From Online Play window to Main window
  | 'online_state_update'      // P2P connection state changed
  | 'action_request_received'  // Opponent sent an action request
  | 'action_response_received' // Opponent responded to our action request
  | 'move_received'            // Opponent made a move
  
  // From Main window to Online Play window
  | 'request_action'           // Request mutual action (pause, new game, etc.)
  | 'send_move'                // Send our move to opponent
  | 'cancel_action_request';   // Cancel pending action request

// =============================================================================
// Online State (sent from Online Play to Main)
// =============================================================================

export interface OnlineStateUpdate {
  type: 'online_state_update';
  isInGame: boolean;
  isP2PConnected: boolean;
  opponentName: string | null;
  currentUserName: string | null;
}

// =============================================================================
// Action Request Types
// =============================================================================

export type ActionType = 
  | 'pause'
  | 'resume'
  | 'new_game'
  | 'revert'
  | 'toggle_teaching';

export interface ActionRequest {
  type: 'action_request_received';
  requestId: string;
  action: ActionType;
  requestedBy: 'self' | 'opponent';
  data?: unknown;
}

export interface ActionResponse {
  type: 'action_response_received';
  requestId: string;
  accepted: boolean;
  action: ActionType;
}

// =============================================================================
// Move Messages
// =============================================================================

export interface MoveMessage {
  type: 'move_received' | 'send_move';
  usi: string;
  sfen: string;
  moveNumber: number;
}

// =============================================================================
// Request Action (from Main to Online Play)
// =============================================================================

export interface RequestActionMessage {
  type: 'request_action';
  action: ActionType;
  data?: unknown;
}

export interface CancelActionMessage {
  type: 'cancel_action_request';
  requestId: string;
}

// =============================================================================
// Union Types
// =============================================================================

export type OnlinePlayToMainMessage =
  | OnlineStateUpdate
  | ActionRequest
  | ActionResponse
  | MoveMessage;

export type MainToOnlinePlayMessage =
  | RequestActionMessage
  | CancelActionMessage
  | MoveMessage;
