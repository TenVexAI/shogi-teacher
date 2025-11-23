import json
import os
from pathlib import Path
from typing import Optional

CONFIG_FILE = Path(__file__).parent / "config.json"

def load_config() -> dict:
    """Load configuration from config.json file"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}

def save_config(config: dict) -> bool:
    """Save configuration to config.json file"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except IOError:
        return False

def get_api_key() -> Optional[str]:
    """Get API key from config.json or fall back to .env (legacy support)"""
    # First try config.json
    config = load_config()
    api_key = config.get("claude_api_key")
    
    if api_key:
        return api_key
    
    # Fall back to environment variable
    return os.getenv("CLAUDE_API_KEY")

def update_api_key(api_key: str) -> bool:
    """Update API key in config.json (legacy support)"""
    config = load_config()
    config["claude_api_key"] = api_key
    return save_config(config)

def get_llm_config() -> dict:
    """
    Get LLM configuration including API keys and provider selection.
    
    Returns dict with:
        - api_keys: {provider: key}
        - selected_provider: str ('claude', 'openai', 'google')
        - selected_model: str (model identifier)
    """
    config = load_config()
    
    # Get API keys
    api_keys = config.get("llm_api_keys", {})
    
    # Legacy support: migrate old claude_api_key
    old_key = config.get("claude_api_key")
    if old_key and "claude" not in api_keys:
        api_keys["claude"] = old_key
    
    return {
        "api_keys": api_keys,
        "selected_provider": config.get("llm_provider", "claude"),
        "selected_model": config.get("llm_model", "claude-haiku-4-5-20251001")
    }

def update_llm_config(api_keys: Optional[dict] = None, provider: Optional[str] = None, model: Optional[str] = None) -> bool:
    """
    Update LLM configuration.
    
    Args:
        api_keys: Dict of {provider: api_key} to update
        provider: Selected provider ('claude', 'openai', 'google')
        model: Selected model identifier
    """
    config = load_config()
    
    if api_keys is not None:
        current_keys = config.get("llm_api_keys", {})
        # Clean API keys - strip whitespace and skip empty/masked values
        for provider_name, key in api_keys.items():
            if key and not key.startswith('•') and not '...' in key:
                # Strip all whitespace including newlines
                cleaned_key = key.strip()
                if cleaned_key:
                    current_keys[provider_name] = cleaned_key
        config["llm_api_keys"] = current_keys
    
    if provider is not None:
        config["llm_provider"] = provider
    
    if model is not None:
        config["llm_model"] = model
    
    return save_config(config)
