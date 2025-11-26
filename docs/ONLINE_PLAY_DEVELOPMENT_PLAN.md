# Online Play Development Plan

## Overview

This document outlines the development plan for adding online multiplayer functionality to Shogi Teacher. The system uses a lightweight relay server for matchmaking and WebRTC for peer-to-peer gameplay.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Shogi Teacher App                             │
│  ┌──────────────────┐          ┌──────────────────────────────────┐ │
│  │   Main Window    │◄────────►│      Online Play Window          │ │
│  │  (Game Board)    │   IPC    │  (Lobby, Chat, Connection Mgmt)  │ │
│  └────────┬─────────┘          └──────────────┬───────────────────┘ │
│           │                                    │                     │
│           │         ┌─────────────────────────►│ WebSocket           │
│           │         │                          │                     │
└───────────┼─────────┼──────────────────────────┼─────────────────────┘
            │         │                          │
            │   P2P   │                          ▼
            │ WebRTC  │              ┌───────────────────────┐
            │         │              │   Connection Server    │
            │         │              │  (DigitalOcean Droplet)│
            ▼         │              │  - OAuth Gateway       │
     ┌────────────────┴───┐          │  - Lobby Management    │
     │   Opponent's App   │◄────────►│  - WebRTC Signaling    │
     └────────────────────┘          └───────────────────────┘
```

---

## Repository Decision

**Recommendation: Create a separate folder within this repository**

Rationale:
- The connection server is tightly coupled to this application (same WebSocket protocol, same message types)
- Shared type definitions and documentation
- Easier to maintain version compatibility
- Single source of truth for the protocol
- Simpler deployment pipeline (can reference same version)

Structure:
```
shogi-teacher/
├── backend/           # Existing Python backend (local)
├── frontend/          # Existing Electron/Next.js app
├── server/            # NEW: Connection server for DigitalOcean
│   ├── main.py
│   ├── auth.py
│   ├── lobby.py
│   ├── signaling.py
│   ├── models.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
└── docs/
    ├── ONLINE_PLAY_DEVELOPMENT_PLAN.md  # This file
    └── ONLINE_PLAY_DEPLOYMENT.md        # Deployment guide
```

---

## Development Phases

### Phase 1: Connection Server (Backend) ✅ COMPLETE
**Estimated: 3-4 days**

#### 1.1 Project Setup ✅
- [x] Create `server/` directory structure
- [x] Set up FastAPI with WebSocket support
- [x] Configure environment variables for OAuth credentials
- [x] Create Dockerfile for deployment
- [x] Set up basic health check endpoint

#### 1.2 OAuth Authentication ✅
- [x] Implement Twitch OAuth flow
- [x] Implement Discord OAuth flow
- [x] Implement GitHub OAuth flow
- [x] Token verification and user info retrieval
- [x] Session token generation for WebSocket auth

#### 1.3 Lobby Management ✅
- [x] WebSocket connection handling
- [x] In-memory user registry (connected users)
- [x] Status management (Available, Away, In-Game)
- [x] Presence broadcasts to all connected clients
- [x] Automatic cleanup on disconnect

#### 1.4 Game Request System ✅
- [x] Send game request (with 3 outgoing limit)
- [x] Accept/decline game request
- [x] Revoke outgoing request
- [x] Request cancellation on disconnect/away (no timeout needed per requirements)
- [x] Status update on game start

#### 1.5 WebRTC Signaling ✅
- [x] SDP offer/answer relay
- [x] ICE candidate exchange
- [x] Connection state tracking
- [x] Graceful disconnect handling

### Phase 2: Electron Integration ✅ COMPLETE
**Estimated: 2-3 days**

#### 2.1 Online Play Window ✅
- [x] Create new Electron child window (like Learn window)
- [x] Add IPC handlers for window management
- [x] Window state synchronization with main window
- [x] Add "Online Play" button to Sidebar

#### 2.2 Preload Script Extensions ✅
- [x] Add online play window management APIs
- [x] Add inter-window communication APIs
- [ ] Add P2P communication bridge (Phase 4)

### Phase 3: Online Play UI (Frontend) - IN PROGRESS
**Estimated: 4-5 days**

#### 3.1 Authentication UI ✅
- [x] OAuth provider selection buttons
- [x] Login state display
- [x] Logout functionality
- [x] Error handling for auth failures

#### 3.2 Lobby UI ✅
- [x] Status dropdown (Available/Away)
- [x] Connected players list with status indicators
- [x] "Request Game" buttons
- [x] Player count display

#### 3.3 Request Management UI ✅
- [x] Outgoing requests panel (max 3)
- [x] Revoke request buttons
- [x] Incoming request notifications
- [x] Accept/Decline buttons
- [ ] Countdown timers (not needed per requirements)

#### 3.4 Connection Panel UI ✅
- [x] Connected opponent display
- [ ] Connection duration timer
- [x] Connection quality indicator (latency display)
- [x] Disconnect button

#### 3.5 Chat Interface ✅
- [x] Quick phrase buttons (Japanese with translations)
- [x] Freeform text input
- [x] Message history display
- [ ] P2P message sending (Phase 4)

### Phase 4: WebRTC P2P Layer
**Estimated: 3-4 days**

#### 4.1 Connection Management
- [ ] RTCPeerConnection setup
- [ ] ICE candidate handling
- [ ] Data channel creation
- [ ] Connection state monitoring
- [ ] Automatic reconnection attempt

#### 4.2 P2P Message Protocol
- [ ] Define message types (move, chat, action-request, etc.)
- [ ] Serialization/deserialization
- [ ] Message acknowledgment system
- [ ] Heartbeat/keepalive

#### 4.3 Game Synchronization
- [ ] Move transmission
- [ ] Move validation (local python-shogi)
- [ ] State reconciliation
- [ ] Desync detection

### Phase 5: Main Window Integration
**Estimated: 3-4 days**

#### 5.1 Online Mode Detection
- [ ] Track when P2P connection is active
- [ ] Modify control behavior for online play
- [ ] IPC communication between windows

#### 5.2 Mutual Action System
- [ ] Intercept pause/new game/revert actions
- [ ] Send action requests via P2P
- [ ] Show approval UI in Online Play window
- [ ] 30-second timeout handling
- [ ] Execute action on mutual agreement

#### 5.3 Teaching Assistant Toggle
- [ ] Request to enable/disable
- [ ] Mutual agreement requirement
- [ ] State synchronization

### Phase 6: Testing & Polish
**Estimated: 2-3 days**

#### 6.1 Testing
- [ ] Unit tests for server
- [ ] Integration tests for WebSocket flows
- [ ] P2P connection testing
- [ ] Cross-platform testing (Windows focus)

#### 6.2 Error Handling
- [ ] Network disconnect recovery
- [ ] Server unavailable handling
- [ ] OAuth failure handling
- [ ] P2P connection failure handling

#### 6.3 UI Polish
- [ ] Loading states
- [ ] Error messages
- [ ] Animations/transitions
- [ ] Sound effects for notifications

---

## Technical Specifications

### Server WebSocket Protocol

#### Client → Server Messages

```typescript
// Authentication
{ type: "auth", token: string }

// Status
{ type: "set_status", status: "available" | "away" }

// Game Requests
{ type: "request_game", target_user_id: string }
{ type: "accept_request", request_id: string }
{ type: "decline_request", request_id: string }
{ type: "revoke_request", request_id: string }

// WebRTC Signaling
{ type: "rtc_offer", target_user_id: string, sdp: string }
{ type: "rtc_answer", target_user_id: string, sdp: string }
{ type: "rtc_ice", target_user_id: string, candidate: object }

// Disconnect
{ type: "end_game" }
```

#### Server → Client Messages

```typescript
// Auth Response
{ type: "auth_success", user: { id, username, provider } }
{ type: "auth_error", message: string }

// Lobby Updates
{ type: "lobby_update", users: User[] }
{ type: "user_joined", user: User }
{ type: "user_left", user_id: string }
{ type: "user_status_changed", user_id: string, status: string }

// Game Requests
{ type: "request_received", request: GameRequest }
{ type: "request_accepted", request_id: string, opponent: User }
{ type: "request_declined", request_id: string }
{ type: "request_revoked", request_id: string }

// WebRTC Signaling
{ type: "rtc_offer", from_user_id: string, sdp: string }
{ type: "rtc_answer", from_user_id: string, sdp: string }
{ type: "rtc_ice", from_user_id: string, candidate: object }

// Connection Events
{ type: "game_started", opponent: User }
{ type: "opponent_disconnected" }
```

### P2P Data Channel Protocol

```typescript
// Game Moves
{ type: "move", move_usi: string, sfen_after: string, timestamp: number }
{ type: "move_ack", move_usi: string }

// Chat
{ type: "chat", message: string, is_quick_phrase: boolean }

// Mutual Actions
{ type: "action_request", action: "pause" | "new_game" | "revert", params?: object }
{ type: "action_response", request_id: string, accepted: boolean }
{ type: "action_execute", action: string, params?: object }

// Teaching Assistant
{ type: "ta_toggle_request", enabled: boolean }
{ type: "ta_toggle_response", accepted: boolean }

// Connection
{ type: "ping" }
{ type: "pong" }
```

### OAuth Configuration

Required environment variables for server:

```env
# Twitch
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=

# Discord
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=

# GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=

# Server
SERVER_SECRET_KEY=  # For JWT signing
CORS_ORIGINS=       # Allowed origins
```

---

## File Structure Details

### Server Files (`server/`)

```
server/
├── main.py              # FastAPI app, WebSocket endpoints
├── auth.py              # OAuth handlers (Twitch, Discord, GitHub)
├── lobby.py             # Lobby state management, user tracking
├── signaling.py         # WebRTC signaling logic
├── models.py            # Pydantic models for messages
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container definition
├── docker-compose.yml   # For local development
├── .env.example         # Environment template
└── tests/
    ├── test_auth.py
    ├── test_lobby.py
    └── test_signaling.py
```

### Frontend Files

```
frontend/
├── electron/
│   ├── main.js          # Add onlinePlayWindow handling
│   └── preload.js       # Add online play APIs
├── app/
│   ├── page.tsx         # Add online connection state
│   └── online/
│       └── page.tsx     # Online Play window page
├── components/
│   ├── Sidebar.tsx      # Add Online Play button
│   ├── OnlineLobby.tsx          # NEW
│   ├── OnlineChat.tsx           # NEW
│   ├── OnlineRequestPanel.tsx   # NEW
│   ├── OnlineConnectionPanel.tsx # NEW
│   └── MutualActionModal.tsx    # NEW
├── lib/
│   ├── onlineApi.ts     # NEW: Server WebSocket client
│   ├── webrtc.ts        # NEW: WebRTC connection manager
│   └── p2pProtocol.ts   # NEW: P2P message handling
└── types/
    └── online.ts        # NEW: Online play types
```

---

## Integration Points with Existing Code

### 1. Sidebar.tsx
Add new "Online Play" button between "Game Mode Settings" and "Learn to Play":
```tsx
<button onClick={onOpenOnlinePlay} title="Online Play">
  <Globe className="w-6 h-6" />
</button>
```

### 2. electron/main.js
Add `onlinePlayWindow` management similar to `learnWindow`:
- `createOnlinePlayWindow()`
- IPC handlers for window management
- Communicate connection state to main window

### 3. electron/preload.js
Expose online play APIs:
- `openOnlinePlayWindow()`
- `closeOnlinePlayWindow()`
- `isOnlinePlayWindowOpen()`
- `onOnlineConnectionStateChange(callback)`
- `sendToOnlineWindow(message)`
- `onMainWindowMessage(callback)`

### 4. page.tsx (Main Window)
- Track `isOnlineConnected` state
- Modify `handleMove` to send via P2P when online
- Intercept pause/new game/revert for mutual action flow
- Listen for opponent moves via IPC

### 5. Move Validation
Both clients validate moves locally using existing `getGameState()` API with python-shogi. This ensures:
- No cheating via invalid moves
- Instant feedback
- Works offline for move legality checking

---

## Questions for Clarification

1. **OAuth App Registration**: Do you already have OAuth apps registered with Twitch, Discord, and GitHub, or should I include instructions for registering them? -  A: I don't yet, but I can get this done with out any instructions

2. **Server Domain/SSL**: Will the DigitalOcean droplet have a domain name (e.g., `online.shogi-teacher.com`) and SSL certificate? WebRTC requires HTTPS for production. - A: sure I can set this up. we'll probably use shogi.tenvexai.com

3. **Maximum Concurrent Users**: What's the expected maximum number of concurrent users? - A: It will be small, likely no more than 10-100 ever connected
This affects:
   - Server instance size
   - In-memory data structure choices
   - Whether to add Redis for horizontal scaling later

4. **Game Request Timeout**: The proposal mentions 30-second timeout for mutual actions. Should game requests (to start a game) also have a timeout? If so, how long? - A: no, keep game request as long as the user(s) is makred as available, if either disconnects or changes status to away then the request should be denied/canceled

5. **Quick Phrases**: Should the Japanese quick phrases be configurable, or is a fixed set acceptable? - A: use these three phrases, use an emogi/logo for the button, send the japanese and english translation when pressed:
   - よろしくお願いします (Yoroshiku onegai-shimasu) - "Let's have a good game"
   - ありがとうございました (Arigatou gozaimashita) - "Thank you very much"
   - 負けました (Makemashita) - "I was defeated"

6. **Reconnection**: If a player briefly disconnects (e.g., network hiccup) and reconnects within a few seconds, should we attempt to restore the P2P connection automatically, or always require starting fresh from the lobby? - yes, it should reconnected to p2p if able, if the other client still shows as online/available/in-game etc.

7. **Sound Notifications**: Should the Online Play window have its own sound notifications (e.g., game request received, opponent moved), or use the existing sound system? - A: use existing ui sound effects.

8. **Player Blocking**: Should there be a way to block specific players from sending game requests? - A: no

9. **Connection Quality**: Should we show connection latency/quality indicator? This would require periodic ping measurements over the P2P connection. - A: yes

10. **Spectator Mode**: Is spectator mode (watching others play) something to consider for future phases, or explicitly out of scope? - A: no, don't consider this

---

## Estimated Timeline

| Phase | Description | Duration |
|-------|-------------|----------|
| 1 | Connection Server | 3-4 days |
| 2 | Electron Integration | 2-3 days |
| 3 | Online Play UI | 4-5 days |
| 4 | WebRTC P2P Layer | 3-4 days |
| 5 | Main Window Integration | 3-4 days |
| 6 | Testing & Polish | 2-3 days |
| **Total** | | **17-23 days** |

---

## Dependencies to Add

### Server (`server/requirements.txt`)
```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
websockets>=12.0
httpx>=0.25.0
python-jose[cryptography]>=3.3.0
pydantic>=2.5.0
python-dotenv>=1.0.0
```

### Frontend (`frontend/package.json`)
```json
{
  "dependencies": {
    "simple-peer": "^9.11.1"  // WebRTC wrapper (or use native APIs)
  }
}
```

---

## Security Considerations

1. **OAuth Token Handling**: Tokens stored only in memory, not persisted
2. **WebSocket Authentication**: JWT tokens with short expiration
3. **CORS**: Strict origin checking on server
4. **Rate Limiting**: Limit game requests and messages per user
5. **Input Validation**: All messages validated with Pydantic models
6. **P2P Encryption**: WebRTC data channels are encrypted by default (DTLS)

---

## Next Steps

1. Review this plan and answer the questions above
2. Create the deployment guide document
3. Begin Phase 1: Connection Server development
