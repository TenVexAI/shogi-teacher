"""
OAuth authentication handlers for Twitch, Discord, and GitHub.
Handles OAuth flow and JWT token generation for WebSocket authentication.
"""

import httpx
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from pydantic import BaseModel

from config import get_settings
from models import OAuthProvider


class OAuthUserInfo(BaseModel):
    """User info extracted from OAuth provider."""
    id: str
    username: str
    provider: OAuthProvider


class AuthError(Exception):
    """Authentication error."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# =============================================================================
# JWT Token Handling
# =============================================================================

def create_session_token(user_info: OAuthUserInfo) -> str:
    """Create a JWT token for WebSocket authentication."""
    settings = get_settings()
    
    payload = {
        "sub": user_info.id,
        "username": user_info.username,
        "provider": user_info.provider.value,
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours),
        "iat": datetime.utcnow(),
    }
    
    return jwt.encode(payload, settings.server_secret_key, algorithm=settings.jwt_algorithm)


def verify_session_token(token: str) -> Optional[OAuthUserInfo]:
    """Verify a JWT token and extract user info."""
    settings = get_settings()
    
    try:
        payload = jwt.decode(token, settings.server_secret_key, algorithms=[settings.jwt_algorithm])
        return OAuthUserInfo(
            id=payload["sub"],
            username=payload["username"],
            provider=OAuthProvider(payload["provider"])
        )
    except JWTError:
        return None


# =============================================================================
# Twitch OAuth
# =============================================================================

async def get_twitch_auth_url(state: str) -> str:
    """Generate Twitch OAuth authorization URL."""
    settings = get_settings()
    
    if not settings.twitch_client_id or not settings.twitch_redirect_uri:
        raise AuthError("Twitch OAuth not configured")
    
    params = {
        "client_id": settings.twitch_client_id,
        "redirect_uri": settings.twitch_redirect_uri,
        "response_type": "code",
        "scope": "user:read:email",
        "state": state,
    }
    
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://id.twitch.tv/oauth2/authorize?{query}"


async def exchange_twitch_code(code: str) -> OAuthUserInfo:
    """Exchange Twitch authorization code for user info."""
    settings = get_settings()
    
    if not all([settings.twitch_client_id, settings.twitch_client_secret, settings.twitch_redirect_uri]):
        raise AuthError("Twitch OAuth not configured")
    
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_response = await client.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": settings.twitch_client_id,
                "client_secret": settings.twitch_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.twitch_redirect_uri,
            }
        )
        
        if token_response.status_code != 200:
            raise AuthError(f"Failed to exchange Twitch code: {token_response.text}")
        
        token_data = token_response.json()
        access_token = token_data["access_token"]
        
        # Get user info
        user_response = await client.get(
            "https://api.twitch.tv/helix/users",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Client-Id": settings.twitch_client_id,
            }
        )
        
        if user_response.status_code != 200:
            raise AuthError(f"Failed to get Twitch user info: {user_response.text}")
        
        user_data = user_response.json()["data"][0]
        
        return OAuthUserInfo(
            id=f"twitch_{user_data['id']}",
            username=user_data["display_name"],
            provider=OAuthProvider.TWITCH
        )


# =============================================================================
# Discord OAuth
# =============================================================================

async def get_discord_auth_url(state: str) -> str:
    """Generate Discord OAuth authorization URL."""
    settings = get_settings()
    
    if not settings.discord_client_id or not settings.discord_redirect_uri:
        raise AuthError("Discord OAuth not configured")
    
    params = {
        "client_id": settings.discord_client_id,
        "redirect_uri": settings.discord_redirect_uri,
        "response_type": "code",
        "scope": "identify",
        "state": state,
    }
    
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://discord.com/api/oauth2/authorize?{query}"


async def exchange_discord_code(code: str) -> OAuthUserInfo:
    """Exchange Discord authorization code for user info."""
    settings = get_settings()
    
    if not all([settings.discord_client_id, settings.discord_client_secret, settings.discord_redirect_uri]):
        raise AuthError("Discord OAuth not configured")
    
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_response = await client.post(
            "https://discord.com/api/oauth2/token",
            data={
                "client_id": settings.discord_client_id,
                "client_secret": settings.discord_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.discord_redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if token_response.status_code != 200:
            raise AuthError(f"Failed to exchange Discord code: {token_response.text}")
        
        token_data = token_response.json()
        access_token = token_data["access_token"]
        
        # Get user info
        user_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if user_response.status_code != 200:
            raise AuthError(f"Failed to get Discord user info: {user_response.text}")
        
        user_data = user_response.json()
        
        # Use global_name if available, otherwise username
        display_name = user_data.get("global_name") or user_data["username"]
        
        return OAuthUserInfo(
            id=f"discord_{user_data['id']}",
            username=display_name,
            provider=OAuthProvider.DISCORD
        )


# =============================================================================
# GitHub OAuth
# =============================================================================

async def get_github_auth_url(state: str) -> str:
    """Generate GitHub OAuth authorization URL."""
    settings = get_settings()
    
    if not settings.github_client_id or not settings.github_redirect_uri:
        raise AuthError("GitHub OAuth not configured")
    
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "scope": "read:user",
        "state": state,
    }
    
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://github.com/login/oauth/authorize?{query}"


async def exchange_github_code(code: str) -> OAuthUserInfo:
    """Exchange GitHub authorization code for user info."""
    settings = get_settings()
    
    if not all([settings.github_client_id, settings.github_client_secret, settings.github_redirect_uri]):
        raise AuthError("GitHub OAuth not configured")
    
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"}
        )
        
        if token_response.status_code != 200:
            raise AuthError(f"Failed to exchange GitHub code: {token_response.text}")
        
        token_data = token_response.json()
        
        if "error" in token_data:
            raise AuthError(f"GitHub OAuth error: {token_data['error_description']}")
        
        access_token = token_data["access_token"]
        
        # Get user info
        user_response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            }
        )
        
        if user_response.status_code != 200:
            raise AuthError(f"Failed to get GitHub user info: {user_response.text}")
        
        user_data = user_response.json()
        
        # Use name if available, otherwise login
        display_name = user_data.get("name") or user_data["login"]
        
        return OAuthUserInfo(
            id=f"github_{user_data['id']}",
            username=display_name,
            provider=OAuthProvider.GITHUB
        )


# =============================================================================
# Generic OAuth Exchange
# =============================================================================

async def exchange_oauth_code(provider: OAuthProvider, code: str) -> OAuthUserInfo:
    """Exchange OAuth code for user info based on provider."""
    if provider == OAuthProvider.TWITCH:
        return await exchange_twitch_code(code)
    elif provider == OAuthProvider.DISCORD:
        return await exchange_discord_code(code)
    elif provider == OAuthProvider.GITHUB:
        return await exchange_github_code(code)
    else:
        raise AuthError(f"Unknown provider: {provider}")


async def get_oauth_url(provider: OAuthProvider, state: str) -> str:
    """Get OAuth authorization URL for provider."""
    if provider == OAuthProvider.TWITCH:
        return await get_twitch_auth_url(state)
    elif provider == OAuthProvider.DISCORD:
        return await get_discord_auth_url(state)
    elif provider == OAuthProvider.GITHUB:
        return await get_github_auth_url(state)
    else:
        raise AuthError(f"Unknown provider: {provider}")
