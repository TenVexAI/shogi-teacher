"""
Shogi Teacher Online Play - Connection Server

A lightweight FastAPI WebSocket server for matchmaking and WebRTC signaling.
Handles OAuth authentication, lobby management, and P2P connection setup.

Server does NOT handle:
- Game state or move validation
- Chat messages (P2P)
- Game history or statistics
- User profiles or persistent data
"""

import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from config import get_settings
from models import (
    MessageType, UserStatus, OAuthProvider,
    WebSocketMessage, AuthSuccessMessage, AuthErrorMessage,
    ErrorMessage, PongMessage, UserPublic
)
from auth import (
    verify_session_token, create_session_token,
    exchange_oauth_code, get_oauth_url, AuthError, OAuthUserInfo
)
from lobby import lobby


# =============================================================================
# Application Setup
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("\n=== Shogi Teacher Connection Server ===")
    settings = get_settings()
    print(f"Debug mode: {settings.debug}")
    print(f"CORS origins: {settings.cors_origins_list}")
    print("Server ready!\n")
    yield
    print("\n=== Server shutting down ===\n")


app = FastAPI(
    title="Shogi Teacher Online Play",
    description="Connection server for online multiplayer",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store OAuth states temporarily (in production, use Redis or similar)
oauth_states: dict[str, dict] = {}


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "users_online": lobby.get_user_count(),
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# OAuth Endpoints
# =============================================================================

@app.get("/auth/{provider}/login")
async def oauth_login(provider: str, redirect_uri: str = Query(None)):
    """
    Initiate OAuth login flow.
    Returns the OAuth authorization URL to redirect the user to.
    """
    try:
        oauth_provider = OAuthProvider(provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {provider}")
    
    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)
    oauth_states[state] = {
        "provider": oauth_provider,
        "redirect_uri": redirect_uri,
        "created_at": datetime.utcnow()
    }
    
    try:
        auth_url = await get_oauth_url(oauth_provider, state)
        return {"auth_url": auth_url, "state": state}
    except AuthError as e:
        raise HTTPException(status_code=500, detail=e.message)


@app.get("/auth/{provider}/callback")
async def oauth_callback(provider: str, code: str, state: str):
    """
    OAuth callback endpoint.
    Exchanges the authorization code for user info and creates a session token.
    """
    # Verify state
    state_data = oauth_states.pop(state, None)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    try:
        oauth_provider = OAuthProvider(provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {provider}")
    
    if state_data["provider"] != oauth_provider:
        raise HTTPException(status_code=400, detail="Provider mismatch")
    
    try:
        user_info = await exchange_oauth_code(oauth_provider, code)
        session_token = create_session_token(user_info)
        
        # If a redirect URI was provided, redirect with token
        if state_data.get("redirect_uri"):
            redirect_url = f"{state_data['redirect_uri']}?token={session_token}"
            return RedirectResponse(url=redirect_url)
        
        # Otherwise return JSON
        return {
            "token": session_token,
            "user": {
                "id": user_info.id,
                "username": user_info.username,
                "provider": user_info.provider.value
            }
        }
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message)


# =============================================================================
# WebSocket Handler
# =============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for lobby communication.
    
    Protocol:
    1. Client connects
    2. Client sends auth message with session token
    3. Server verifies token and adds user to lobby
    4. Bidirectional communication for lobby updates, game requests, WebRTC signaling
    5. On disconnect, user is removed from lobby
    """
    await websocket.accept()
    
    user_id = None
    
    try:
        # Wait for authentication
        auth_timeout = 30  # seconds
        try:
            raw_message = await asyncio.wait_for(
                websocket.receive_text(),
                timeout=auth_timeout
            )
            message = json.loads(raw_message)
        except asyncio.TimeoutError:
            await websocket.send_json(AuthErrorMessage(message="Authentication timeout").model_dump())
            await websocket.close(code=4001, reason="Authentication timeout")
            return
        except json.JSONDecodeError:
            await websocket.send_json(AuthErrorMessage(message="Invalid message format").model_dump())
            await websocket.close(code=4002, reason="Invalid message format")
            return
        
        # Verify auth message
        if message.get("type") != MessageType.AUTH:
            await websocket.send_json(AuthErrorMessage(message="First message must be auth").model_dump())
            await websocket.close(code=4003, reason="Expected auth message")
            return
        
        token = message.get("token")
        if not token:
            await websocket.send_json(AuthErrorMessage(message="Missing token").model_dump())
            await websocket.close(code=4004, reason="Missing token")
            return
        
        # Verify token
        user_info = verify_session_token(token)
        if not user_info:
            await websocket.send_json(AuthErrorMessage(message="Invalid or expired token").model_dump())
            await websocket.close(code=4005, reason="Invalid token")
            return
        
        # Add user to lobby
        user = await lobby.add_user(user_info, websocket)
        user_id = user.id
        
        # Send auth success
        await websocket.send_json(AuthSuccessMessage(
            user=UserPublic(
                id=user.id,
                username=user.username,
                provider=user.provider,
                status=user.status
            )
        ).model_dump())
        
        # Send current lobby state
        await lobby.send_lobby_state(user_id)
        
        # Broadcast that user joined
        await lobby.broadcast_user_joined(user)
        
        print(f"[+] User connected: {user.username} ({user.provider.value})")
        
        # Main message loop
        while True:
            raw_message = await websocket.receive_text()
            
            try:
                message = json.loads(raw_message)
                await handle_message(user_id, message, websocket)
            except json.JSONDecodeError:
                await websocket.send_json(ErrorMessage(
                    message="Invalid JSON",
                    code="INVALID_JSON"
                ).model_dump())
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[!] WebSocket error: {e}")
    finally:
        if user_id:
            user = await lobby.remove_user(user_id)
            if user:
                await lobby.broadcast_user_left(user_id)
                print(f"[-] User disconnected: {user.username}")


async def handle_message(user_id: str, message: dict, websocket: WebSocket):
    """Handle an incoming WebSocket message."""
    msg_type = message.get("type")
    
    if msg_type == MessageType.PING:
        await websocket.send_json(PongMessage().model_dump())
    
    elif msg_type == MessageType.SET_STATUS:
        status_str = message.get("status")
        try:
            status = UserStatus(status_str)
            success = await lobby.set_user_status(user_id, status)
            if not success:
                await websocket.send_json(ErrorMessage(
                    message="Cannot change status",
                    code="STATUS_CHANGE_FAILED"
                ).model_dump())
        except ValueError:
            await websocket.send_json(ErrorMessage(
                message=f"Invalid status: {status_str}",
                code="INVALID_STATUS"
            ).model_dump())
    
    elif msg_type == MessageType.REQUEST_GAME:
        target_user_id = message.get("target_user_id")
        if not target_user_id:
            await websocket.send_json(ErrorMessage(
                message="Missing target_user_id",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        request = await lobby.create_request(user_id, target_user_id)
        if not request:
            await websocket.send_json(ErrorMessage(
                message="Cannot create game request",
                code="REQUEST_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.ACCEPT_REQUEST:
        request_id = message.get("request_id")
        if not request_id:
            await websocket.send_json(ErrorMessage(
                message="Missing request_id",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        result = await lobby.accept_request(request_id, user_id)
        if not result:
            await websocket.send_json(ErrorMessage(
                message="Cannot accept request",
                code="ACCEPT_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.DECLINE_REQUEST:
        request_id = message.get("request_id")
        if not request_id:
            await websocket.send_json(ErrorMessage(
                message="Missing request_id",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        success = await lobby.decline_request(request_id, user_id)
        if not success:
            await websocket.send_json(ErrorMessage(
                message="Cannot decline request",
                code="DECLINE_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.REVOKE_REQUEST:
        request_id = message.get("request_id")
        if not request_id:
            await websocket.send_json(ErrorMessage(
                message="Missing request_id",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        success = await lobby.revoke_request(request_id, user_id)
        if not success:
            await websocket.send_json(ErrorMessage(
                message="Cannot revoke request",
                code="REVOKE_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.RTC_OFFER:
        target_user_id = message.get("target_user_id")
        sdp = message.get("sdp")
        if not target_user_id or not sdp:
            await websocket.send_json(ErrorMessage(
                message="Missing target_user_id or sdp",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        success = await lobby.relay_rtc_offer(user_id, target_user_id, sdp)
        if not success:
            await websocket.send_json(ErrorMessage(
                message="Cannot relay RTC offer",
                code="RTC_RELAY_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.RTC_ANSWER:
        target_user_id = message.get("target_user_id")
        sdp = message.get("sdp")
        if not target_user_id or not sdp:
            await websocket.send_json(ErrorMessage(
                message="Missing target_user_id or sdp",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        success = await lobby.relay_rtc_answer(user_id, target_user_id, sdp)
        if not success:
            await websocket.send_json(ErrorMessage(
                message="Cannot relay RTC answer",
                code="RTC_RELAY_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.RTC_ICE:
        target_user_id = message.get("target_user_id")
        candidate = message.get("candidate")
        if not target_user_id or candidate is None:
            await websocket.send_json(ErrorMessage(
                message="Missing target_user_id or candidate",
                code="MISSING_PARAM"
            ).model_dump())
            return
        
        success = await lobby.relay_rtc_ice(user_id, target_user_id, candidate)
        if not success:
            await websocket.send_json(ErrorMessage(
                message="Cannot relay ICE candidate",
                code="RTC_RELAY_FAILED"
            ).model_dump())
    
    elif msg_type == MessageType.END_GAME:
        success = await lobby.end_game(user_id)
        if not success:
            await websocket.send_json(ErrorMessage(
                message="Not in a game",
                code="NOT_IN_GAME"
            ).model_dump())
    
    else:
        await websocket.send_json(ErrorMessage(
            message=f"Unknown message type: {msg_type}",
            code="UNKNOWN_TYPE"
        ).model_dump())


# =============================================================================
# Admin Endpoints (optional, for debugging)
# =============================================================================

@app.get("/admin/stats")
async def admin_stats():
    """Get server statistics (for debugging/monitoring)."""
    settings = get_settings()
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Not found")
    
    return {
        "users_online": lobby.get_user_count(),
        "users": [u.model_dump() for u in lobby.get_all_users()],
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# Import asyncio for timeout handling
# =============================================================================

import asyncio


# =============================================================================
# Run with uvicorn
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=True
    )
