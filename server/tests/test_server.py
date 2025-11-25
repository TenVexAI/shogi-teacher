"""
Basic tests for the connection server.
Run with: pytest tests/test_server.py -v
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

import sys
sys.path.insert(0, '..')

from main import app
from auth import create_session_token, OAuthUserInfo
from models import OAuthProvider


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_user():
    """Create a mock user for testing."""
    return OAuthUserInfo(
        id="test_user_123",
        username="TestPlayer",
        provider=OAuthProvider.GITHUB
    )


@pytest.fixture
def auth_token(mock_user):
    """Create a valid auth token."""
    return create_session_token(mock_user)


class TestHealthEndpoint:
    """Tests for the health check endpoint."""
    
    def test_health_returns_200(self, client):
        """Health endpoint should return 200."""
        response = client.get("/health")
        assert response.status_code == 200
    
    def test_health_returns_status(self, client):
        """Health endpoint should return status."""
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "healthy"
        assert "users_online" in data
        assert "timestamp" in data


class TestOAuthEndpoints:
    """Tests for OAuth endpoints."""
    
    def test_login_invalid_provider(self, client):
        """Login with invalid provider should return 400."""
        response = client.get("/auth/invalid/login")
        assert response.status_code == 400
    
    def test_callback_invalid_state(self, client):
        """Callback with invalid state should return 400."""
        response = client.get("/auth/github/callback?code=test&state=invalid")
        assert response.status_code == 400


class TestWebSocket:
    """Tests for WebSocket functionality."""
    
    def test_websocket_requires_auth(self, client):
        """WebSocket should require authentication."""
        with client.websocket_connect("/ws") as ws:
            # Send invalid auth
            ws.send_json({"type": "auth", "token": "invalid"})
            data = ws.receive_json()
            assert data["type"] == "auth_error"
    
    def test_websocket_auth_success(self, client, auth_token):
        """WebSocket should accept valid auth token."""
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": auth_token})
            data = ws.receive_json()
            assert data["type"] == "auth_success"
            assert data["user"]["username"] == "TestPlayer"
    
    def test_websocket_lobby_update(self, client, auth_token):
        """WebSocket should receive lobby update after auth."""
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": auth_token})
            
            # First message is auth_success
            data = ws.receive_json()
            assert data["type"] == "auth_success"
            
            # Second message is lobby_update
            data = ws.receive_json()
            assert data["type"] == "lobby_update"
            assert "users" in data
    
    def test_websocket_ping_pong(self, client, auth_token):
        """WebSocket should respond to ping with pong."""
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": auth_token})
            ws.receive_json()  # auth_success
            ws.receive_json()  # lobby_update
            
            ws.send_json({"type": "ping"})
            data = ws.receive_json()
            assert data["type"] == "pong"


class TestLobbyManagement:
    """Tests for lobby management."""
    
    def test_status_change(self, client, auth_token):
        """User should be able to change status."""
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": auth_token})
            ws.receive_json()  # auth_success
            ws.receive_json()  # lobby_update
            
            ws.send_json({"type": "set_status", "status": "away"})
            # Status change doesn't send a response to the user who changed
            # but broadcasts to others


class TestGameRequests:
    """Tests for game request functionality."""
    
    def test_request_nonexistent_user(self, client, auth_token):
        """Requesting game with nonexistent user should fail."""
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": auth_token})
            ws.receive_json()  # auth_success
            ws.receive_json()  # lobby_update
            
            ws.send_json({
                "type": "request_game",
                "target_user_id": "nonexistent_user"
            })
            data = ws.receive_json()
            assert data["type"] == "error"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
