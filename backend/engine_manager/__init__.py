"""
Engine Manager Module

Manages multiple USI-compatible shogi engines with hot-swapping support.
"""

from .engine_config import EngineConfig, load_engine_configs, validate_engine_config
from .engine_process import EngineProcess, EngineState
from .engine_manager import EngineManager
from .usi_protocol import USIProtocol, USIOption

__all__ = [
    'EngineConfig',
    'EngineProcess',
    'EngineState',
    'EngineManager',
    'USIProtocol',
    'USIOption',
    'load_engine_configs',
    'validate_engine_config',
]
