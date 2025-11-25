# Shogi Teacher Connection Server

A lightweight FastAPI WebSocket server for online multiplayer matchmaking and WebRTC signaling.

## Features

- **OAuth Authentication**: Twitch, Discord, and GitHub login
- **Lobby Management**: Real-time player list with status indicators
- **Game Requests**: Send, accept, decline, and revoke game invitations
- **WebRTC Signaling**: Facilitate P2P connection setup between players

## What This Server Does NOT Handle

- Game state or move validation (handled P2P)
- Chat messages (handled P2P)
- Game history or statistics
- User profiles or persistent data

## Quick Start

### Local Development

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or
   .\venv\Scripts\activate  # Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your OAuth credentials
   ```

4. Run the server:
   ```bash
   uvicorn main:app --reload --port 8080
   ```

5. Test the health endpoint:
   ```bash
   curl http://localhost:8080/health
   ```

### Docker Deployment

1. Build and run:
   ```bash
   docker compose up -d
   ```

2. View logs:
   ```bash
   docker compose logs -f
   ```

## API Endpoints

### HTTP

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/auth/{provider}/login` | GET | Initiate OAuth flow |
| `/auth/{provider}/callback` | GET | OAuth callback |
| `/admin/stats` | GET | Server stats (debug mode only) |

### WebSocket

Connect to `/ws` and authenticate with a session token.

See [ONLINE_PLAY_DEVELOPMENT_PLAN.md](../docs/ONLINE_PLAY_DEVELOPMENT_PLAN.md) for full protocol documentation.

## Environment Variables

See `.env.example` for all available configuration options.

## Architecture

```
Client                    Server                    Client
  │                         │                         │
  ├──── auth ──────────────►│                         │
  │◄─── auth_success ───────┤                         │
  │◄─── lobby_update ───────┤                         │
  │                         │                         │
  ├──── request_game ──────►│                         │
  │                         ├─── request_received ───►│
  │                         │◄── accept_request ──────┤
  │◄─── request_accepted ───┤                         │
  │◄─── game_started ───────┤────── game_started ────►│
  │                         │                         │
  ├──── rtc_offer ─────────►│────── rtc_offer ───────►│
  │◄─── rtc_answer ─────────┤◄───── rtc_answer ───────┤
  │◄─── rtc_ice ────────────┤◄───── rtc_ice ──────────┤
  │                         │                         │
  │◄═══════════ P2P Connection Established ═══════════►│
```

## License

MIT - See LICENSE file in repository root.
