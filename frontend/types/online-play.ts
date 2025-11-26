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
  | 'open_new_game_modal'      // Initiator should open new game modal
  | 'game_config_received'     // Accepter received game config from initiator
  | 'clock_sync_received'      // Clock sync received from opponent
  
  // From Main window to Online Play window
  | 'request_action'           // Request mutual action (pause, new game, etc.)
  | 'send_move'                // Send our move to opponent
  | 'send_game_config'         // Initiator sends game config to opponent
  | 'send_clock_sync'          // Send clock sync to opponent
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
  isInitiator?: boolean;
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
// Game Config Messages
// =============================================================================

export interface OpenNewGameModalMessage {
  type: 'open_new_game_modal';
  opponentName: string;
}

export interface GameConfigMessage {
  type: 'send_game_config' | 'game_config_received';
  sfen: string;
  blackName: string;
  whiteName: string;
  isClockRunning: boolean;
  gameTime: number;
  initiatorColor: 'b' | 'w'; // Which side the initiator (sender) is playing
}

export interface ClockSyncMessage {
  type: 'send_clock_sync' | 'clock_sync_received';
  isRunning: boolean;
  gameTime: number;
}

// =============================================================================
// Union Types
// =============================================================================

export type OnlinePlayToMainMessage =
  | OnlineStateUpdate
  | ActionRequest
  | ActionResponse
  | MoveMessage
  | OpenNewGameModalMessage
  | GameConfigMessage
  | ClockSyncMessage;

export type MainToOnlinePlayMessage =
  | RequestActionMessage
  | CancelActionMessage
  | MoveMessage
  | GameConfigMessage
  | ClockSyncMessage;
