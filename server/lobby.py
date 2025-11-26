"""
Lobby management for the connection server.
Handles connected users, game requests, and status management.
All state is in-memory (no persistence).
"""

import asyncio
from datetime import datetime
from typing import Optional
from fastapi import WebSocket

from models import (
    User, UserPublic, UserStatus, GameRequest,
    LobbyUpdateMessage, UserJoinedMessage, UserLeftMessage,
    UserStatusChangedMessage, RequestReceivedMessage,
    RequestAcceptedMessage, RequestDeclinedMessage, RequestRevokedMessage,
    RequestCanceledMessage, GameStartedMessage, OpponentDisconnectedMessage,
    ErrorMessage, OAuthProvider
)
from config import get_settings
from auth import OAuthUserInfo


class LobbyManager:
    """Manages the lobby state and user connections."""
    
    def __init__(self):
        # Connected users: user_id -> User
        self._users: dict[str, User] = {}
        
        # WebSocket connections: user_id -> WebSocket
        self._connections: dict[str, WebSocket] = {}
        
        # Active game requests: request_id -> GameRequest
        self._requests: dict[str, GameRequest] = {}
        
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
    
    # =========================================================================
    # User Management
    # =========================================================================
    
    async def add_user(self, user_info: OAuthUserInfo, websocket: WebSocket) -> User:
        """Add a user to the lobby."""
        async with self._lock:
            user = User(
                id=user_info.id,
                username=user_info.username,
                provider=user_info.provider,
                status=UserStatus.AVAILABLE,
                connected_at=datetime.utcnow()
            )
            
            # If user already connected, close old connection
            if user.id in self._connections:
                old_ws = self._connections[user.id]
                try:
                    await old_ws.close(code=1000, reason="Connected from another session")
                except:
                    pass
            
            self._users[user.id] = user
            self._connections[user.id] = websocket
            
            return user
    
    async def remove_user(self, user_id: str) -> Optional[User]:
        """Remove a user from the lobby."""
        async with self._lock:
            user = self._users.pop(user_id, None)
            self._connections.pop(user_id, None)
            
            if user:
                # Cancel all requests involving this user
                requests_to_cancel = [
                    req for req in self._requests.values()
                    if req.sender_id == user_id or req.recipient_id == user_id
                ]
                
                for req in requests_to_cancel:
                    del self._requests[req.id]
                    
                    # Notify the other party
                    other_id = req.recipient_id if req.sender_id == user_id else req.sender_id
                    await self._send_to_user(other_id, RequestCanceledMessage(
                        request_id=req.id,
                        reason="User disconnected"
                    ))
                
                # If user was in a game, notify opponent
                if user.opponent_id:
                    opponent = self._users.get(user.opponent_id)
                    if opponent:
                        opponent.opponent_id = None
                        opponent.status = UserStatus.AVAILABLE
                        await self._send_to_user(opponent.id, OpponentDisconnectedMessage())
                        await self._broadcast_status_change(opponent.id, UserStatus.AVAILABLE)
            
            return user
    
    async def set_user_status(self, user_id: str, status: UserStatus) -> bool:
        """Set a user's status."""
        async with self._lock:
            user = self._users.get(user_id)
            if not user:
                return False
            
            # Can't change status while in game
            if user.status == UserStatus.IN_GAME and status != UserStatus.IN_GAME:
                return False
            
            old_status = user.status
            user.status = status
            
            # If going away, cancel all pending requests
            if status == UserStatus.AWAY:
                await self._cancel_user_requests(user_id, "User is now away")
            
            if old_status != status:
                await self._broadcast_status_change(user_id, status)
            
            return True
    
    def get_user(self, user_id: str) -> Optional[User]:
        """Get a user by ID."""
        return self._users.get(user_id)
    
    def get_all_users(self) -> list[UserPublic]:
        """Get all connected users as public info."""
        return [
            UserPublic(
                id=u.id,
                username=u.username,
                provider=u.provider,
                status=u.status
            )
            for u in self._users.values()
        ]
    
    def get_user_count(self) -> int:
        """Get the number of connected users."""
        return len(self._users)
    
    # =========================================================================
    # Game Request Management
    # =========================================================================
    
    async def create_request(self, sender_id: str, recipient_id: str) -> Optional[GameRequest]:
        """Create a game request."""
        settings = get_settings()
        
        async with self._lock:
            sender = self._users.get(sender_id)
            recipient = self._users.get(recipient_id)
            
            if not sender or not recipient:
                return None
            
            # Check sender is available
            if sender.status != UserStatus.AVAILABLE:
                return None
            
            # Check recipient is available
            if recipient.status != UserStatus.AVAILABLE:
                return None
            
            # Check sender hasn't exceeded max outgoing requests
            sender_requests = [
                r for r in self._requests.values()
                if r.sender_id == sender_id
            ]
            if len(sender_requests) >= settings.max_outgoing_requests:
                return None
            
            # Check no existing request between these users
            existing = next((
                r for r in self._requests.values()
                if (r.sender_id == sender_id and r.recipient_id == recipient_id) or
                   (r.sender_id == recipient_id and r.recipient_id == sender_id)
            ), None)
            if existing:
                return None
            
            request = GameRequest(
                sender_id=sender_id,
                sender_username=sender.username,
                recipient_id=recipient_id,
                recipient_username=recipient.username
            )
            
            self._requests[request.id] = request
            
            # Notify recipient
            await self._send_to_user(recipient_id, RequestReceivedMessage(request=request))
            
            return request
    
    async def accept_request(self, request_id: str, accepter_id: str) -> Optional[tuple[User, User]]:
        """Accept a game request. Returns (initiator, joiner) if successful."""
        async with self._lock:
            request = self._requests.get(request_id)
            if not request:
                return None
            
            # Only recipient can accept
            if request.recipient_id != accepter_id:
                return None
            
            sender = self._users.get(request.sender_id)
            recipient = self._users.get(request.recipient_id)
            
            if not sender or not recipient:
                del self._requests[request_id]
                return None
            
            # Both must still be available
            if sender.status != UserStatus.AVAILABLE or recipient.status != UserStatus.AVAILABLE:
                del self._requests[request_id]
                await self._send_to_user(request.sender_id, RequestCanceledMessage(
                    request_id=request_id,
                    reason="User no longer available"
                ))
                return None
            
            # Remove request
            del self._requests[request_id]
            
            # Cancel all other requests for both users
            await self._cancel_user_requests(sender.id, "User started a game")
            await self._cancel_user_requests(recipient.id, "User started a game")
            
            # Set both users to in-game
            sender.status = UserStatus.IN_GAME
            sender.opponent_id = recipient.id
            recipient.status = UserStatus.IN_GAME
            recipient.opponent_id = sender.id
            
            # Notify sender that request was accepted
            await self._send_to_user(sender.id, RequestAcceptedMessage(
                request_id=request_id,
                opponent=UserPublic(
                    id=recipient.id,
                    username=recipient.username,
                    provider=recipient.provider,
                    status=recipient.status
                )
            ))
            
            # Notify both about game start
            # Sender is the initiator (creates WebRTC offer)
            await self._send_to_user(sender.id, GameStartedMessage(
                opponent=UserPublic(
                    id=recipient.id,
                    username=recipient.username,
                    provider=recipient.provider,
                    status=recipient.status
                ),
                is_initiator=True
            ))
            
            await self._send_to_user(recipient.id, GameStartedMessage(
                opponent=UserPublic(
                    id=sender.id,
                    username=sender.username,
                    provider=sender.provider,
                    status=sender.status
                ),
                is_initiator=False
            ))
            
            # Broadcast status changes
            await self._broadcast_status_change(sender.id, UserStatus.IN_GAME)
            await self._broadcast_status_change(recipient.id, UserStatus.IN_GAME)
            
            return (sender, recipient)
    
    async def decline_request(self, request_id: str, decliner_id: str) -> bool:
        """Decline a game request."""
        async with self._lock:
            request = self._requests.get(request_id)
            if not request:
                return False
            
            # Only recipient can decline
            if request.recipient_id != decliner_id:
                return False
            
            del self._requests[request_id]
            
            # Notify sender
            await self._send_to_user(request.sender_id, RequestDeclinedMessage(
                request_id=request_id
            ))
            
            return True
    
    async def revoke_request(self, request_id: str, revoker_id: str) -> bool:
        """Revoke an outgoing game request."""
        async with self._lock:
            request = self._requests.get(request_id)
            if not request:
                return False
            
            # Only sender can revoke
            if request.sender_id != revoker_id:
                return False
            
            del self._requests[request_id]
            
            # Notify recipient
            await self._send_to_user(request.recipient_id, RequestRevokedMessage(
                request_id=request_id
            ))
            
            return True
    
    def get_user_requests(self, user_id: str) -> list[GameRequest]:
        """Get all requests involving a user."""
        return [
            r for r in self._requests.values()
            if r.sender_id == user_id or r.recipient_id == user_id
        ]
    
    # =========================================================================
    # Game End
    # =========================================================================
    
    async def end_game(self, user_id: str) -> bool:
        """End a game and return both players to available status."""
        async with self._lock:
            user = self._users.get(user_id)
            if not user or user.status != UserStatus.IN_GAME:
                return False
            
            opponent = self._users.get(user.opponent_id) if user.opponent_id else None
            
            # Reset user
            user.status = UserStatus.AVAILABLE
            user.opponent_id = None
            await self._broadcast_status_change(user.id, UserStatus.AVAILABLE)
            
            # Reset opponent if exists
            if opponent:
                opponent.status = UserStatus.AVAILABLE
                opponent.opponent_id = None
                await self._send_to_user(opponent.id, OpponentDisconnectedMessage())
                await self._broadcast_status_change(opponent.id, UserStatus.AVAILABLE)
            
            return True
    
    # =========================================================================
    # WebRTC Signaling
    # =========================================================================
    
    async def relay_rtc_offer(self, from_user_id: str, to_user_id: str, sdp: str) -> bool:
        """Relay a WebRTC offer to the target user."""
        from models import RTCOfferMessage
        
        user = self._users.get(from_user_id)
        target = self._users.get(to_user_id)
        
        if not user or not target:
            return False
        
        # Verify they are in a game together
        if user.opponent_id != to_user_id:
            return False
        
        # Create message with from_user_id for the recipient
        message = {
            "type": "rtc_offer",
            "from_user_id": from_user_id,
            "sdp": sdp
        }
        
        ws = self._connections.get(to_user_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except:
                return False
        return False
    
    async def relay_rtc_answer(self, from_user_id: str, to_user_id: str, sdp: str) -> bool:
        """Relay a WebRTC answer to the target user."""
        user = self._users.get(from_user_id)
        target = self._users.get(to_user_id)
        
        if not user or not target:
            return False
        
        # Verify they are in a game together
        if user.opponent_id != to_user_id:
            return False
        
        message = {
            "type": "rtc_answer",
            "from_user_id": from_user_id,
            "sdp": sdp
        }
        
        ws = self._connections.get(to_user_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except:
                return False
        return False
    
    async def relay_rtc_ice(self, from_user_id: str, to_user_id: str, candidate: dict) -> bool:
        """Relay a WebRTC ICE candidate to the target user."""
        user = self._users.get(from_user_id)
        target = self._users.get(to_user_id)
        
        if not user or not target:
            return False
        
        # Verify they are in a game together
        if user.opponent_id != to_user_id:
            return False
        
        message = {
            "type": "rtc_ice",
            "from_user_id": from_user_id,
            "candidate": candidate
        }
        
        ws = self._connections.get(to_user_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except:
                return False
        return False
    
    # =========================================================================
    # Broadcasting
    # =========================================================================
    
    async def broadcast_user_joined(self, user: User):
        """Broadcast that a user joined the lobby."""
        message = UserJoinedMessage(
            user=UserPublic(
                id=user.id,
                username=user.username,
                provider=user.provider,
                status=user.status
            )
        )
        await self._broadcast(message, exclude_user=user.id)
    
    async def broadcast_user_left(self, user_id: str):
        """Broadcast that a user left the lobby."""
        message = UserLeftMessage(user_id=user_id)
        await self._broadcast(message)
    
    async def send_lobby_state(self, user_id: str):
        """Send the current lobby state to a specific user."""
        user_requests = self.get_user_requests(user_id)
        message = LobbyUpdateMessage(
            users=self.get_all_users(),
            pending_requests=user_requests
        )
        await self._send_to_user(user_id, message)
    
    # =========================================================================
    # Private Helpers
    # =========================================================================
    
    async def _send_to_user(self, user_id: str, message):
        """Send a message to a specific user."""
        ws = self._connections.get(user_id)
        if ws:
            try:
                await ws.send_json(message.model_dump(mode='json'))
            except:
                pass
    
    async def _broadcast(self, message, exclude_user: Optional[str] = None):
        """Broadcast a message to all connected users."""
        for user_id, ws in list(self._connections.items()):
            if user_id == exclude_user:
                continue
            try:
                await ws.send_json(message.model_dump(mode='json'))
            except:
                pass
    
    async def _broadcast_status_change(self, user_id: str, status: UserStatus):
        """Broadcast a user's status change."""
        message = UserStatusChangedMessage(user_id=user_id, status=status)
        await self._broadcast(message, exclude_user=user_id)
    
    async def _cancel_user_requests(self, user_id: str, reason: str):
        """Cancel all pending requests involving a user."""
        requests_to_cancel = [
            req for req in self._requests.values()
            if req.sender_id == user_id or req.recipient_id == user_id
        ]
        
        for req in requests_to_cancel:
            del self._requests[req.id]
            
            # Notify the other party
            other_id = req.recipient_id if req.sender_id == user_id else req.sender_id
            await self._send_to_user(other_id, RequestCanceledMessage(
                request_id=req.id,
                reason=reason
            ))


# Global lobby instance
lobby = LobbyManager()
