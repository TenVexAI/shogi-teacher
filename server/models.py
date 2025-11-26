"""
Pydantic models for the connection server.
Defines all message types for WebSocket communication.
"""

from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


# =============================================================================
# Enums
# =============================================================================

class OAuthProvider(str, Enum):
    TWITCH = "twitch"
    DISCORD = "discord"
    GITHUB = "github"


class UserStatus(str, Enum):
    AVAILABLE = "available"
    AWAY = "away"
    IN_GAME = "in_game"


class MessageType(str, Enum):
    # Client -> Server
    AUTH = "auth"
    SET_STATUS = "set_status"
    REQUEST_GAME = "request_game"
    ACCEPT_REQUEST = "accept_request"
    DECLINE_REQUEST = "decline_request"
    REVOKE_REQUEST = "revoke_request"
    RTC_OFFER = "rtc_offer"
    RTC_ANSWER = "rtc_answer"
    RTC_ICE = "rtc_ice"
    END_GAME = "end_game"
    PING = "ping"
    
    # Server -> Client
    AUTH_SUCCESS = "auth_success"
    AUTH_ERROR = "auth_error"
    LOBBY_UPDATE = "lobby_update"
    USER_JOINED = "user_joined"
    USER_LEFT = "user_left"
    USER_STATUS_CHANGED = "user_status_changed"
    REQUEST_SENT = "request_sent"
    REQUEST_RECEIVED = "request_received"
    REQUEST_ACCEPTED = "request_accepted"
    REQUEST_DECLINED = "request_declined"
    REQUEST_REVOKED = "request_revoked"
    REQUEST_CANCELED = "request_canceled"
    GAME_STARTED = "game_started"
    OPPONENT_DISCONNECTED = "opponent_disconnected"
    ERROR = "error"
    PONG = "pong"


# =============================================================================
# User Models
# =============================================================================

class User(BaseModel):
    """Represents a connected user in the lobby."""
    id: str
    username: str
    provider: OAuthProvider
    status: UserStatus = UserStatus.AVAILABLE
    connected_at: datetime = Field(default_factory=datetime.utcnow)
    opponent_id: Optional[str] = None  # Set when in a game
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class UserPublic(BaseModel):
    """Public user info sent to other clients."""
    id: str
    username: str
    provider: OAuthProvider
    status: UserStatus


# =============================================================================
# Game Request Models
# =============================================================================

class GameRequest(BaseModel):
    """Represents a pending game request."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender_id: str
    sender_username: str
    recipient_id: str
    recipient_username: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# =============================================================================
# Client -> Server Messages
# =============================================================================

class AuthMessage(BaseModel):
    """Authentication message with OAuth token."""
    type: str = MessageType.AUTH
    token: str


class SetStatusMessage(BaseModel):
    """Set user status."""
    type: str = MessageType.SET_STATUS
    status: UserStatus


class RequestGameMessage(BaseModel):
    """Request to start a game with another user."""
    type: str = MessageType.REQUEST_GAME
    target_user_id: str


class AcceptRequestMessage(BaseModel):
    """Accept a game request."""
    type: str = MessageType.ACCEPT_REQUEST
    request_id: str


class DeclineRequestMessage(BaseModel):
    """Decline a game request."""
    type: str = MessageType.DECLINE_REQUEST
    request_id: str


class RevokeRequestMessage(BaseModel):
    """Revoke an outgoing game request."""
    type: str = MessageType.REVOKE_REQUEST
    request_id: str


class RTCOfferMessage(BaseModel):
    """WebRTC SDP offer."""
    type: str = MessageType.RTC_OFFER
    target_user_id: str
    sdp: str


class RTCAnswerMessage(BaseModel):
    """WebRTC SDP answer."""
    type: str = MessageType.RTC_ANSWER
    target_user_id: str
    sdp: str


class RTCIceMessage(BaseModel):
    """WebRTC ICE candidate."""
    type: str = MessageType.RTC_ICE
    target_user_id: str
    candidate: dict


class EndGameMessage(BaseModel):
    """End current game and return to lobby."""
    type: str = MessageType.END_GAME


class PingMessage(BaseModel):
    """Keepalive ping."""
    type: str = MessageType.PING


# =============================================================================
# Server -> Client Messages
# =============================================================================

class AuthSuccessMessage(BaseModel):
    """Successful authentication response."""
    type: str = MessageType.AUTH_SUCCESS
    user: UserPublic


class AuthErrorMessage(BaseModel):
    """Authentication error response."""
    type: str = MessageType.AUTH_ERROR
    message: str


class LobbyUpdateMessage(BaseModel):
    """Full lobby state update."""
    type: str = MessageType.LOBBY_UPDATE
    users: list[UserPublic]
    pending_requests: list[GameRequest]  # Requests involving this user


class UserJoinedMessage(BaseModel):
    """A user joined the lobby."""
    type: str = MessageType.USER_JOINED
    user: UserPublic


class UserLeftMessage(BaseModel):
    """A user left the lobby."""
    type: str = MessageType.USER_LEFT
    user_id: str


class UserStatusChangedMessage(BaseModel):
    """A user's status changed."""
    type: str = MessageType.USER_STATUS_CHANGED
    user_id: str
    status: UserStatus


class RequestSentMessage(BaseModel):
    """Outgoing game request confirmation."""
    type: str = MessageType.REQUEST_SENT
    request: GameRequest


class RequestReceivedMessage(BaseModel):
    """Incoming game request notification."""
    type: str = MessageType.REQUEST_RECEIVED
    request: GameRequest


class RequestAcceptedMessage(BaseModel):
    """Game request was accepted."""
    type: str = MessageType.REQUEST_ACCEPTED
    request_id: str
    opponent: UserPublic


class RequestDeclinedMessage(BaseModel):
    """Game request was declined."""
    type: str = MessageType.REQUEST_DECLINED
    request_id: str


class RequestRevokedMessage(BaseModel):
    """Game request was revoked by sender."""
    type: str = MessageType.REQUEST_REVOKED
    request_id: str


class RequestCanceledMessage(BaseModel):
    """Game request was canceled (user disconnected or went away)."""
    type: str = MessageType.REQUEST_CANCELED
    request_id: str
    reason: str


class GameStartedMessage(BaseModel):
    """Game has started, begin WebRTC connection."""
    type: str = MessageType.GAME_STARTED
    opponent: UserPublic
    is_initiator: bool  # True for the one who should create the offer


class OpponentDisconnectedMessage(BaseModel):
    """Opponent has disconnected."""
    type: str = MessageType.OPPONENT_DISCONNECTED


class ErrorMessage(BaseModel):
    """Generic error message."""
    type: str = MessageType.ERROR
    message: str
    code: Optional[str] = None


class PongMessage(BaseModel):
    """Keepalive pong response."""
    type: str = MessageType.PONG
    server_time: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# =============================================================================
# Generic Message Wrapper
# =============================================================================

class WebSocketMessage(BaseModel):
    """Generic message for parsing incoming WebSocket messages."""
    type: str
    # All other fields are optional and depend on type
    token: Optional[str] = None
    status: Optional[UserStatus] = None
    target_user_id: Optional[str] = None
    request_id: Optional[str] = None
    sdp: Optional[str] = None
    candidate: Optional[dict] = None
