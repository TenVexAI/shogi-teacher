"""
Configuration settings for the connection server.
Loads from environment variables.
"""

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Server configuration loaded from environment variables."""
    
    # Server
    server_secret_key: str = "dev-secret-key-change-in-production"
    cors_origins: str = "http://localhost:3000,https://shogi.tenvexai.com"
    debug: bool = False
    
    # JWT
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # Twitch OAuth
    twitch_client_id: Optional[str] = None
    twitch_client_secret: Optional[str] = None
    twitch_redirect_uri: Optional[str] = None
    
    # Discord OAuth
    discord_client_id: Optional[str] = None
    discord_client_secret: Optional[str] = None
    discord_redirect_uri: Optional[str] = None
    
    # GitHub OAuth
    github_client_id: Optional[str] = None
    github_client_secret: Optional[str] = None
    github_redirect_uri: Optional[str] = None
    
    # Limits
    max_outgoing_requests: int = 3
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins as a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
