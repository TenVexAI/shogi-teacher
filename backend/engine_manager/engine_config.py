"""
Engine Configuration Management

Handles loading, validating, and managing engine configurations.
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class EngineConfig:
    """Engine configuration loaded from config.json"""
    
    # Core Identity
    id: str
    name: str
    author: str
    version: str
    description: str
    
    # Execution
    executable: str
    protocol: str
    
    # Files (required fields must come before optional fields)
    evalFiles: List[str]
    requiredFiles: List[str]
    
    # Optional fields with defaults
    disabled: bool = False
    disabledReason: Optional[str] = None
    optionalFiles: List[str] = field(default_factory=list)
    
    # Features
    features: Dict[str, bool] = field(default_factory=dict)
    
    # Default Options
    defaultOptions: Dict[str, str] = field(default_factory=dict)
    
    # Strength
    strength: Dict[str, Any] = field(default_factory=dict)
    
    # Strength Control
    strengthControl: Dict[str, Any] = field(default_factory=dict)
    
    # License
    license: str = "Unknown"
    
    # Optional fields
    executableAlternatives: List[Dict[str, str]] = field(default_factory=list)
    engineType: Optional[str] = None
    usageNotes: Dict[str, Any] = field(default_factory=dict)
    trainingFeatures: Dict[str, Any] = field(default_factory=dict)
    openingBook: Dict[str, str] = field(default_factory=dict)
    systemRequirements: Dict[str, str] = field(default_factory=dict)
    cpuOptimization: Dict[str, str] = field(default_factory=dict)
    documentation: Dict[str, str] = field(default_factory=dict)
    historicalSignificance: Optional[str] = None
    
    # Runtime fields (not in config file)
    engineDir: str = ""
    executablePath: str = ""


def load_engine_configs(engines_dir: str = None) -> List[EngineConfig]:
    """
    Discover and load all engine configurations from the engines directory.
    
    Args:
        engines_dir: Path to engines directory. If None, uses backend/engines
        
    Returns:
        List of validated EngineConfig objects
    """
    if engines_dir is None:
        # Default to backend/engines relative to this file
        backend_dir = Path(__file__).parent.parent
        engines_dir = backend_dir / "engines"
    else:
        engines_dir = Path(engines_dir)
    
    if not engines_dir.exists():
        print(f"Warning: Engines directory not found: {engines_dir}")
        return []
    
    engines = []
    
    # Scan all subdirectories
    for folder in engines_dir.iterdir():
        if not folder.is_dir():
            continue
        
        config_path = folder / "config.json"
        if not config_path.exists():
            print(f"Warning: No config.json found in {folder.name}, skipping")
            continue
        
        try:
            # Load config
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            
            # Create EngineConfig
            config = EngineConfig(**config_data)
            
            # Validate
            validate_engine_config(config)
            
            # Set runtime paths
            config.engineDir = str(folder)
            config.executablePath = str(folder / config.executable)
            
            # Verify required files
            verify_required_files(config)
            
            engines.append(config)
            print(f"✓ Loaded engine: {config.name} ({config.id})")
            
        except Exception as e:
            print(f"✗ Failed to load engine from {folder.name}: {e}")
            continue
    
    print(f"\nDiscovered {len(engines)} engines")
    return engines


def validate_engine_config(config: EngineConfig) -> None:
    """
    Validate an engine configuration.
    
    Raises:
        ValueError: If configuration is invalid
    """
    # Validate required fields
    required_fields = ['id', 'name', 'author', 'version', 'description', 
                      'executable', 'protocol', 'evalFiles', 'requiredFiles',
                      'features', 'defaultOptions', 'strength', 'strengthControl', 'license']
    
    for field_name in required_fields:
        if not hasattr(config, field_name) or getattr(config, field_name) is None:
            raise ValueError(f"Missing required field: {field_name}")
    
    # Validate protocol
    if config.protocol != "USI":
        raise ValueError(f"Invalid protocol: {config.protocol}. Must be 'USI'")
    
    # Validate features (required boolean fields)
    required_features = ['nnue', 'ponder', 'multiPV', 'skillLevel', 'uciElo', 'openingBook']
    for feature in required_features:
        if feature not in config.features:
            raise ValueError(f"Missing required feature: {feature}")
        if not isinstance(config.features[feature], bool):
            raise ValueError(f"Feature {feature} must be boolean")
    
    # Validate strength fields
    if 'estimated_elo' not in config.strength:
        raise ValueError("Missing strength.estimated_elo")
    if 'level' not in config.strength:
        raise ValueError("Missing strength.level")
    if 'notes' not in config.strength:
        raise ValueError("Missing strength.notes")
    if 'minLevel' not in config.strength:
        raise ValueError("Missing strength.minLevel")
    if 'maxLevel' not in config.strength:
        raise ValueError("Missing strength.maxLevel")
    
    # Validate min/max levels
    min_level = config.strength['minLevel']
    max_level = config.strength['maxLevel']
    if not isinstance(min_level, int) or not isinstance(max_level, int):
        raise ValueError("minLevel and maxLevel must be integers")
    if min_level < 1 or min_level > 10 or max_level < 1 or max_level > 10:
        raise ValueError("minLevel and maxLevel must be between 1 and 10")
    if min_level > max_level:
        raise ValueError("minLevel cannot be greater than maxLevel")
    
    # Validate strengthControl fields
    if 'supported' not in config.strengthControl:
        raise ValueError("Missing strengthControl.supported")
    if 'methods' not in config.strengthControl:
        raise ValueError("Missing strengthControl.methods")
    if 'notes' not in config.strengthControl:
        raise ValueError("Missing strengthControl.notes")
    
    # Validate defaultOptions are strings
    for key, value in config.defaultOptions.items():
        if not isinstance(value, str):
            raise ValueError(f"defaultOptions values must be strings, got {type(value)} for {key}")


def verify_required_files(config: EngineConfig) -> None:
    """
    Verify that all required files exist.
    
    Raises:
        FileNotFoundError: If a required file is missing
    """
    engine_dir = Path(config.engineDir)
    
    for file_path in config.requiredFiles:
        full_path = engine_dir / file_path
        if not full_path.exists():
            raise FileNotFoundError(f"Required file not found: {file_path}")


def get_strength_label(level: int) -> str:
    """
    Get the human-readable label for a strength level (1-10).
    
    Args:
        level: Strength level (1-10)
        
    Returns:
        Label string (e.g., "Level 10: Superhuman (3000+ Elo)")
    """
    labels = {
        10: "Level 10: Superhuman (3000+ Elo)",
        9: "Level 9: 7-Dan (2300+ Elo)",
        8: "Level 8: 5-6 Dan (2100-2299 Elo)",
        7: "Level 7: 3-4 Dan (1800-2099 Elo)",
        6: "Level 6: 1-2 Dan (1600-1799 Elo)",
        5: "Level 5: 3-1 Kyu (1300-1599 Elo)",
        4: "Level 4: 6-4 Kyu (1150-1299 Elo)",
        3: "Level 3: 9-7 Kyu (1000-1149 Elo)",
        2: "Level 2: 12-10 Kyu (700-999 Elo)",
        1: "Level 1: 15-13 Kyu (<700 Elo)",
    }
    return labels.get(level, f"Level {level}")
