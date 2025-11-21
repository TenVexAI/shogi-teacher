"""
Engine Manager

Manages multiple engines with hot-swapping support.
"""

import json
from pathlib import Path
from typing import Optional, List, Dict, Callable
from .engine_config import EngineConfig, load_engine_configs
from .engine_process import EngineProcess, EngineState


class EngineManager:
    """
    Central manager for all shogi engines.
    
    Handles engine discovery, lifecycle management, and hot-swapping.
    """
    
    def __init__(self, engines_dir: str = None, config_file: str = None):
        """
        Initialize engine manager.
        
        Args:
            engines_dir: Path to engines directory
            config_file: Path to engine preferences config file
        """
        self.engines_dir = engines_dir
        self.config_file = config_file or "engine_preferences.json"
        
        # Available engines (all discovered engines)
        self.available_engines: Dict[str, EngineConfig] = {}
        
        # Running engines (currently spawned)
        self.running_engines: Dict[str, EngineProcess] = {}
        
        # Active engines (selected for each role)
        self.active_engines = {
            "black": None,    # Engine ID or None
            "white": None,    # Engine ID or None
            "analysis": None  # Engine ID or None
        }
        
        # Strength levels (1-10 per role)
        self.strength_levels = {
            "black": 10,
            "white": 10,
            "analysis": 10
        }
        
        # Custom options per engine role
        self.custom_options = {
            "black": {},
            "white": {},
            "analysis": {}
        }
        
        # Analysis engine state
        self.analysis_enabled = False
        
        # Game state for synchronization
        self.current_position = "startpos"
        self.move_history: List[str] = []
    
    def discover_engines(self) -> List[EngineConfig]:
        """
        Discover all available engines.
        
        Returns:
            List of discovered engine configs
        """
        print("\n=== Discovering Engines ===")
        configs = load_engine_configs(self.engines_dir)
        
        self.available_engines = {cfg.id: cfg for cfg in configs}
        
        # Filter out tsume solvers from regular play
        playable = [cfg for cfg in configs 
                   if not cfg.usageNotes.get('notForPlay', False)]
        
        print(f"Found {len(playable)} playable engines (out of {len(configs)} total)")
        return configs
    
    def load_preferences(self) -> Dict:
        """
        Load engine preferences from config file.
        
        Returns:
            Preferences dictionary
        """
        config_path = Path(self.config_file)
        
        if not config_path.exists():
            # Return defaults
            return {
                "engines": {
                    "black": {"engineId": "yaneuraou", "strengthLevel": 10, "customOptions": {}},
                    "white": {"engineId": "yaneuraou", "strengthLevel": 10, "customOptions": {}},
                    "analysis": {"engineId": None, "strengthLevel": 10, "enabled": False, "customOptions": {}}
                }
            }
        
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load preferences: {e}")
            return {
                "engines": {
                    "black": {"engineId": "yaneuraou", "strengthLevel": 10, "customOptions": {}},
                    "white": {"engineId": "yaneuraou", "strengthLevel": 10, "customOptions": {}},
                    "analysis": {"engineId": None, "strengthLevel": 10, "enabled": False, "customOptions": {}}
                }
            }
    
    def save_preferences(self, preferences: Dict) -> bool:
        """
        Save engine preferences to config file.
        
        Args:
            preferences: Preferences dictionary
            
        Returns:
            True if successful
        """
        try:
            with open(self.config_file, 'w') as f:
                json.dump(preferences, f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving preferences: {e}")
            return False
    
    def set_engine(self, side: str, engine_id: Optional[str], strength_level: int = 10, custom_options: Dict[str, str] = None, enabled: bool = None) -> bool:
        """
        Set the engine for a role (hot-swap if needed).
        
        Args:
            side: "black", "white", or "analysis"
            engine_id: Engine ID or None to disable engine for this role
            strength_level: Strength level (1-10)
            custom_options: Custom USI options to apply to engine
            enabled: For analysis engine, whether it's enabled (ignored for black/white)
            
        Returns:
            True if successful
        """
        if side not in ["black", "white", "analysis"]:
            raise ValueError(f"Invalid side: {side}")
        
        # Store custom options
        if custom_options is not None:
            self.custom_options[side] = custom_options
        
        # Handle analysis enabled flag
        if side == "analysis" and enabled is not None:
            self.analysis_enabled = enabled
        
        # If disabling engine
        if engine_id is None:
            old_engine_id = self.active_engines[side]
            self.active_engines[side] = None
            
            # Stop old engine if no longer needed
            if old_engine_id and self._can_stop_engine(old_engine_id):
                self._stop_engine(old_engine_id)
            
            print(f"✓ Disabled engine for {side}")
            return True
        
        # Validate engine exists
        if engine_id not in self.available_engines:
            raise ValueError(f"Engine not found: {engine_id}")
        
        config = self.available_engines[engine_id]
        
        # Validate strength level
        min_level = config.strength.get('minLevel', 10)
        max_level = config.strength.get('maxLevel', 10)
        if strength_level < min_level or strength_level > max_level:
            print(f"Warning: Strength level {strength_level} out of range for {config.name}, clamping to {min_level}-{max_level}")
            strength_level = max(min_level, min(strength_level, max_level))
        
        # Store old engine ID
        old_engine_id = self.active_engines[side]
        
        # If same engine, just update strength
        if old_engine_id == engine_id:
            self.strength_levels[side] = strength_level
            if engine_id in self.running_engines:
                self._apply_strength(side, engine_id, strength_level)
            print(f"✓ Updated {side} engine strength to level {strength_level}")
            return True
        
        # Start new engine if not running
        if engine_id not in self.running_engines:
            success = self._start_engine(engine_id)
            if not success:
                return False
        
        # Apply strength to new engine
        self._apply_strength(side, engine_id, strength_level)
        
        # Apply custom options to engine
        self._apply_custom_options(side, engine_id)
        
        # Sync game state to new engine
        self._sync_game_state(engine_id)
        
        # Update active engine
        self.active_engines[side] = engine_id
        self.strength_levels[side] = strength_level
        
        # Stop old engine if no longer needed
        if old_engine_id and self._can_stop_engine(old_engine_id):
            self._stop_engine(old_engine_id)
        
        print(f"✓ Set {side} engine to {config.name} (Level {strength_level})")
        return True
    
    def _start_engine(self, engine_id: str) -> bool:
        """Start an engine process."""
        if engine_id in self.running_engines:
            return True  # Already running
        
        config = self.available_engines[engine_id]
        
        try:
            process = EngineProcess(config)
            process.start()
            self.running_engines[engine_id] = process
            return True
        except Exception as e:
            print(f"✗ Failed to start engine {config.name}: {e}")
            return False
    
    def _stop_engine(self, engine_id: str) -> None:
        """Stop an engine process."""
        if engine_id not in self.running_engines:
            return
        
        process = self.running_engines[engine_id]
        process.stop()
        del self.running_engines[engine_id]
    
    def _can_stop_engine(self, engine_id: str) -> bool:
        """Check if an engine can be stopped (not used by any role)."""
        return (
            engine_id != self.active_engines["black"] and
            engine_id != self.active_engines["white"] and
            engine_id != self.active_engines["analysis"]
        )
    
    def _get_side_to_move(self, position: str, moves: List[str] = None) -> str:
        """
        Determine whose turn it is based on position and moves.
        
        Args:
            position: Position string (SFEN or "startpos")
            moves: List of moves played
            
        Returns:
            "black" or "white"
        """
        # If moves list is provided, count them to determine turn
        if moves:
            # Even number of moves = black to move, odd = white to move
            return "black" if len(moves) % 2 == 0 else "white"
        
        # Parse SFEN position
        if position == "startpos":
            return "black"  # Starting position is always black to move
        
        # SFEN format: "lnsgkgsnl/1r5b1/... b - 1" where 'b' or 'w' indicates turn
        parts = position.split()
        if len(parts) >= 2:
            turn = parts[1]
            return "black" if turn == "b" else "white"
        
        # Default to black
        return "black"
    
    def _apply_strength(self, side: str, engine_id: str, level: int) -> None:
        """Apply strength level to an engine."""
        if engine_id not in self.running_engines:
            return
        
        process = self.running_engines[engine_id]
        config = self.available_engines[engine_id]
        
        if not config.strengthControl.get('supported', False):
            # Engine doesn't support strength control
            return
        
        methods = config.strengthControl.get('methods', [])
        
        # Apply strength using available methods
        if 'skillLevel' in methods and 'uciElo' in methods:
            # Prefer UCI_Elo for better granularity
            self._apply_elo_strength(process, level)
        elif 'skillLevel' in methods:
            self._apply_skill_level(process, level)
        elif 'uciElo' in methods:
            self._apply_elo_strength(process, level)
        # Other methods (time, hash, threads) can be implemented as fallbacks
    
    def _apply_skill_level(self, process: EngineProcess, level: int) -> None:
        """Apply strength using Skill Level option (0-20)."""
        # Map 1-10 to 0-20
        skill_level = int((level - 1) * 20 / 9)
        process.set_option("Skill Level", str(skill_level))
    
    def _apply_elo_strength(self, process: EngineProcess, level: int) -> None:
        """Apply strength using UCI_Elo option."""
        # Map level to Elo
        elo_map = {
            1: 600, 2: 850, 3: 1075, 4: 1225, 5: 1450,
            6: 1700, 7: 1950, 8: 2200, 9: 2550, 10: 3000
        }
        elo = elo_map.get(level, 3000)
        
        process.set_option("UCI_LimitStrength", "true")
        process.set_option("UCI_Elo", str(elo))
    
    def _apply_custom_options(self, side: str, engine_id: str) -> None:
        """Apply custom USI options to an engine for this role."""
        if engine_id not in self.running_engines:
            return
        
        process = self.running_engines[engine_id]
        custom_opts = self.custom_options.get(side, {})
        
        for name, value in custom_opts.items():
            print(f"[DEBUG] Applying custom option for {side}: {name} = {value}")
            process.set_option(name, value)
    
    def _sync_game_state(self, engine_id: str) -> None:
        """Synchronize current game state to an engine."""
        if engine_id not in self.running_engines:
            return
        
        process = self.running_engines[engine_id]
        process.new_game()
        process.set_position(self.current_position, self.move_history)
    
    def update_position(self, position: str, moves: List[str] = None) -> None:
        """
        Update the current game position.
        
        Args:
            position: Position in SFEN format or "startpos"
            moves: List of moves from that position
        """
        self.current_position = position
        self.move_history = moves or []
        
        # Sync to all running engines
        for engine_id in self.running_engines:
            self._sync_game_state(engine_id)
    
    def get_move(
        self,
        side: str,
        btime: int = 600000,
        wtime: int = 600000,
        binc: int = 0,
        winc: int = 0,
        callback: Optional[Callable[[str], None]] = None
    ) -> Optional[Dict]:
        """
        Get a move from the engine for the specified side.
        
        Args:
            side: "black" or "white"
            btime: Black time in milliseconds
            wtime: White time in milliseconds
            binc: Black increment
            winc: White increment
            callback: Optional callback for info lines
            
        Returns:
            Dictionary with bestmove, ponder, and analysis info, or None
        """
        engine_id = self.active_engines.get(side)
        if not engine_id or engine_id not in self.running_engines:
            return None
        
        process = self.running_engines[engine_id]
        
        try:
            bestmove, ponder, info = process.go(
                btime=btime,
                wtime=wtime,
                binc=binc,
                winc=winc,
                callback=callback
            )
            
            return {
                "bestmove": bestmove,
                "ponder": ponder,
                "score_cp": info.get("score_cp"),
                "mate": info.get("mate"),
                "depth": info.get("depth"),
                "nodes": info.get("nodes"),
                "nps": info.get("nps"),
                "pv": info.get("pv", [])
            }
        except Exception as e:
            print(f"Error getting move from {engine_id}: {e}")
            return None
    
    def analyze_position(
        self,
        position: str,
        moves: List[str] = None,
        engine_id: str = None,
        movetime: int = 1000,
        callback: Optional[Callable[[str], None]] = None
    ) -> Optional[Dict]:
        """
        Analyze a position (for best move display).
        
        Args:
            position: Position in SFEN format
            moves: List of moves from that position
            engine_id: Specific engine to use (uses appropriate engine based on turn if None)
            movetime: Time to analyze in milliseconds
            callback: Optional callback for info lines
            
        Returns:
            Analysis dictionary or None
        """
        # Use specified engine or determine from whose turn it is
        if engine_id is None:
            # Parse SFEN to determine whose turn it is
            # SFEN format: "position moves..." where position contains turn indicator (b/w)
            side_to_move = self._get_side_to_move(position, moves)
            engine_id = self.active_engines.get(side_to_move)
            
            # Fallback to any available engine if the appropriate one isn't set
            fallback_used = False
            if not engine_id:
                fallback_used = True
                fallback_side = "black" if self.active_engines.get("black") else "white"
                engine_id = self.active_engines.get("black") or self.active_engines.get("white")
            
            if engine_id:
                engine_name = self.available_engines[engine_id].name if engine_id in self.available_engines else engine_id
                if fallback_used:
                    print(f"→ Using {fallback_side} engine for {side_to_move}'s move (no {side_to_move} engine set): {engine_name}")
                else:
                    print(f"→ Using {side_to_move} engine: {engine_name}")
        
        if not engine_id or engine_id not in self.running_engines:
            return None
        
        process = self.running_engines[engine_id]
        
        try:
            # Temporarily set position
            process.set_position(position, moves)
            
            bestmove, ponder, info = process.go(
                movetime=movetime,
                callback=callback
            )
            
            # Restore game state
            process.set_position(self.current_position, self.move_history)
            
            return {
                "bestmove": bestmove,
                "ponder": ponder,
                "score_cp": info.get("score_cp"),
                "mate": info.get("mate"),
                "depth": info.get("depth"),
                "nodes": info.get("nodes"),
                "nps": info.get("nps"),
                "pv": info.get("pv", [])
            }
        except Exception as e:
            print(f"Error analyzing position: {e}")
            return None
    
    def shutdown(self) -> None:
        """Shutdown all engines."""
        print("\n=== Shutting down engines ===")
        for engine_id in list(self.running_engines.keys()):
            self._stop_engine(engine_id)
        print("✓ All engines stopped")
