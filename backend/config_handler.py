import json
import os
from pathlib import Path
from typing import Optional

CONFIG_FILE = Path(__file__).parent / "config.json"

def load_config() -> dict:
    """Load configuration from config.json file"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}

def save_config(config: dict) -> bool:
    """Save configuration to config.json file"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        return True
    except IOError:
        return False

def get_api_key() -> Optional[str]:
    """Get API key from config.json or fall back to .env"""
    # First try config.json
    config = load_config()
    api_key = config.get("claude_api_key")
    
    if api_key:
        return api_key
    
    # Fall back to environment variable
    return os.getenv("CLAUDE_API_KEY")

def update_api_key(api_key: str) -> bool:
    """Update API key in config.json"""
    config = load_config()
    config["claude_api_key"] = api_key
    return save_config(config)
