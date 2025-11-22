from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from pathlib import Path
import os
import sys
import shogi
from dotenv import load_dotenv
from engine_manager import EngineManager
from llm import ClaudeTeacher

# Fix for Windows asyncio subprocess support
if sys.platform == 'win32':
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

load_dotenv()

app = FastAPI(title="Shogi Teaching Assistant")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize components
print("\n=== Initializing Shogi Teaching Assistant ===")
# Use absolute path for config file
config_path = Path(__file__).parent / "engine_preferences.json"
engine_manager = EngineManager(config_file=str(config_path))
engine_manager.discover_engines()

# Load and apply saved preferences
preferences = engine_manager.load_preferences()
engines_cfg = preferences.get("engines", {})
black_cfg = engines_cfg.get("black", {})
white_cfg = engines_cfg.get("white", {})
analysis_cfg = engines_cfg.get("analysis", {})

if black_cfg.get("engineId"):
    engine_manager.set_engine(
        "black", 
        black_cfg["engineId"], 
        black_cfg.get("strengthLevel", 10),
        black_cfg.get("customOptions", {})
    )

if white_cfg.get("engineId"):
    engine_manager.set_engine(
        "white",
        white_cfg["engineId"],
        white_cfg.get("strengthLevel", 10),
        white_cfg.get("customOptions", {})
    )

if analysis_cfg.get("engineId"):
    engine_manager.set_engine(
        "analysis",
        analysis_cfg["engineId"],
        analysis_cfg.get("strengthLevel", 10),
        analysis_cfg.get("customOptions", {}),
        analysis_cfg.get("enabled", False)
    )

teacher = ClaudeTeacher()
print("✓ Initialization complete\n")

class MoveRequest(BaseModel):
    sfen: str
    move: str # USI format e.g. "7g7f"

class GameState(BaseModel):
    sfen: str
    turn: str # "b" or "w"
    legal_moves: List[str]
    in_check: bool
    is_game_over: bool
    winner: Optional[str] = None
    pieces_in_hand: Dict[str, Dict[str, int]] = {"b": {}, "w": {}}  # e.g. {"b": {"P": 2, "S": 1}, "w": {"P": 1}}
    last_move_notation: Optional[str] = None  # Standard shogi notation e.g. "P-7f"

class AnalysisRequest(BaseModel):
    sfen: str

def usi_to_standard_notation(board: shogi.Board, move: shogi.Move) -> str:
    """
    Convert USI move to standard shogi notation.
    Examples: P-7f, S-6h, Bx3c+, P*5e, +Px4d
    """
    # Map piece types to standard notation
    piece_map = {
        shogi.PAWN: 'P',
        shogi.LANCE: 'L',
        shogi.KNIGHT: 'N',
        shogi.SILVER: 'S',
        shogi.GOLD: 'G',
        shogi.BISHOP: 'B',
        shogi.ROOK: 'R',
        shogi.KING: 'K',
        shogi.PROM_PAWN: '+P',
        shogi.PROM_LANCE: '+L',
        shogi.PROM_KNIGHT: '+N',
        shogi.PROM_SILVER: '+S',
        shogi.PROM_BISHOP: '+B',
        shogi.PROM_ROOK: '+R',
    }
    
    to_square = move.to_square
    # Convert square index to shogi notation (e.g., 80 -> 1a, 0 -> 9i)
    file = 9 - (to_square % 9)  # Files go from 9 to 1 (right to left)
    rank = chr(ord('a') + (to_square // 9))  # Ranks go from a to i (top to bottom)
    dest = f"{file}{rank}"
    
    # Check if it's a drop move
    if move.drop_piece_type:
        piece = piece_map.get(move.drop_piece_type, '?')
        return f"{piece}*{dest}"
    
    # Regular move
    from_square = move.from_square
    piece_type = board.piece_type_at(from_square)
    piece = piece_map.get(piece_type, '?')
    
    # Check if it's a capture
    is_capture = board.piece_at(to_square) is not None
    separator = 'x' if is_capture else '-'
    
    # Check if it's a promotion
    promotion = '+' if move.promotion else ''
    
    return f"{piece}{separator}{dest}{promotion}"

@app.on_event("startup")
async def startup_event():
    pass

@app.on_event("shutdown")
async def shutdown_event():
    engine_manager.shutdown()

@app.get("/")
async def root():
    return {"message": "Shogi Teaching Assistant API"}

@app.get("/game/state")
async def get_game_state(sfen: Optional[str] = None):
    if not sfen:
        board = shogi.Board()
    else:
        try:
            board = shogi.Board(sfen)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid SFEN")
            
    return _build_game_state(board)

@app.post("/game/move")
async def make_move(request: MoveRequest):
    try:
        board = shogi.Board(request.sfen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid SFEN")
    
    try:
        move = shogi.Move.from_usi(request.move)
        if move not in board.legal_moves:
             raise HTTPException(status_code=400, detail="Illegal move")
        
        # Get standard notation BEFORE pushing the move
        standard_notation = usi_to_standard_notation(board, move)
        
        board.push(move)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid move format")
        
    return _build_game_state(board, last_move_notation=standard_notation)

@app.post("/analyze")
async def analyze_position(request: AnalysisRequest):
    try:
        # Parse SFEN to extract position and moves
        parts = request.sfen.split(" moves ")
        position = parts[0]
        moves = parts[1].split() if len(parts) > 1 else []
        
        # Use engine manager for analysis
        analysis = engine_manager.analyze_position(
            position=position,
            moves=moves,
            movetime=1000
        )
        
        if not analysis:
            raise HTTPException(status_code=500, detail="No engine available for analysis")
        
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Analysis error: {type(e).__name__}: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/explain")
async def explain_position(sfen: str, analysis: Dict[str, Any]):
    explanation = await teacher.explain(sfen, analysis)
    return {"explanation": explanation}

@app.get("/config")
async def get_config():
    """Get current configuration (API key masked for security)"""
    from config_handler import load_config, get_api_key
    api_key = get_api_key()
    
    # Return masked key if it exists (show first 7 chars + "..." for identification)
    masked_key = ""
    if api_key:
        if len(api_key) > 10:
            masked_key = api_key[:7] + "..." + "•" * 10
        else:
            masked_key = "•" * 16
    
    return {
        "has_api_key": bool(api_key),
        "claude_api_key": masked_key,
        "api_key_source": "config" if load_config().get("claude_api_key") else "env" if api_key else "none"
    }

class ConfigUpdate(BaseModel):
    claude_api_key: str

@app.post("/config")
async def update_config(config: ConfigUpdate):
    """Update configuration"""
    from config_handler import update_api_key
    global teacher
    
    success = update_api_key(config.claude_api_key)
    if success:
        # Reinitialize teacher with new API key
        teacher = ClaudeTeacher()
        return {"success": True, "message": "Configuration updated successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to save configuration")

# ===== UI Preferences Endpoints =====

UI_PREFERENCES_FILE = Path(__file__).parent / "ui_preferences.json"

@app.get("/ui-preferences")
async def get_ui_preferences():
    """Get UI preferences from file."""
    import json
    
    if UI_PREFERENCES_FILE.exists():
        try:
            with open(UI_PREFERENCES_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    
    # Return defaults if file doesn't exist or is invalid
    return {
        "useLLM": True,
        "showBestMove": False,
        "showBoardOptionsPanel": True,
        "useJapaneseCoords": False,
        "boardFlipped": False,
        "useWesternNotation": False,
        "highlightLastMove": False,
        "showMovementOverlay": False,
        "allSoundsMuted": False,
        "uiSoundEnabled": False,
        "musicSoundEnabled": False,
        "ambientSoundEnabled": False
    }

class UIPreferencesUpdate(BaseModel):
    useLLM: Optional[bool] = None
    showBestMove: Optional[bool] = None
    showBoardOptionsPanel: Optional[bool] = None
    useJapaneseCoords: Optional[bool] = None
    boardFlipped: Optional[bool] = None
    useWesternNotation: Optional[bool] = None
    highlightLastMove: Optional[bool] = None
    showMovementOverlay: Optional[bool] = None
    allSoundsMuted: Optional[bool] = None
    uiSoundEnabled: Optional[bool] = None
    musicSoundEnabled: Optional[bool] = None
    ambientSoundEnabled: Optional[bool] = None

@app.post("/ui-preferences")
async def update_ui_preferences(preferences: UIPreferencesUpdate):
    """Update UI preferences to file."""
    import json
    
    # Load existing preferences
    current_prefs = {}
    if UI_PREFERENCES_FILE.exists():
        try:
            with open(UI_PREFERENCES_FILE, 'r') as f:
                current_prefs = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    
    # Update with new values (only non-None fields)
    update_dict = preferences.dict(exclude_none=True)
    current_prefs.update(update_dict)
    
    # Save to file
    try:
        with open(UI_PREFERENCES_FILE, 'w') as f:
            json.dump(current_prefs, f, indent=2)
        return {"success": True, "preferences": current_prefs}
    except IOError as e:
        raise HTTPException(status_code=500, detail=f"Failed to save preferences: {str(e)}")

# ===== Engine Management Endpoints =====

@app.get("/engines")
async def list_engines():
    """Get list of all available engines."""
    engines = []
    for engine_id, config in engine_manager.available_engines.items():
        # Skip tsume solvers from regular engine list
        if config.usageNotes.get('notForPlay', False):
            continue
        
        engines.append({
            "id": config.id,
            "name": config.name,
            "author": config.author,
            "version": config.version,
            "description": config.description,
            "strength": {
                "estimated_elo": config.strength.get('estimated_elo'),
                "level": config.strength.get('level'),
                "minLevel": config.strength.get('minLevel', 10),
                "maxLevel": config.strength.get('maxLevel', 10),
            },
            "strengthControl": {
                "supported": config.strengthControl.get('supported', False),
                "methods": config.strengthControl.get('methods', []),
            },
            "features": config.features,
        })
    
    return {"engines": engines}

@app.get("/engines/{engine_id}/options")
async def get_engine_options(engine_id: str):
    """Get available USI options for a specific engine."""
    import asyncio
    import functools
    
    if engine_id not in engine_manager.available_engines:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    try:
        # Start engine temporarily if not running to get options
        was_running = engine_id in engine_manager.running_engines
        if not was_running:
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(
                None,
                functools.partial(engine_manager._start_engine, engine_id)
            )
            if not success:
                raise HTTPException(status_code=500, detail="Failed to start engine")
        
        process = engine_manager.running_engines.get(engine_id)
        if not process:
            raise HTTPException(status_code=500, detail="Engine process not available")
        
        # Get USI options from engine
        options = []
        for opt in process.usi_options:
            options.append({
                "name": opt.name,
                "type": opt.type,
                "default": opt.default,
                "min": opt.min,
                "max": opt.max,
                "vars": opt.var,  # Note: USIOption uses 'var' not 'vars'
            })
        
        # Stop engine if we started it temporarily
        if not was_running:
            engine_manager._stop_engine(engine_id)
        
        return {"options": options}
    except Exception as e:
        import traceback
        print(f"Error getting engine options: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error getting engine options: {str(e)}")

@app.get("/engines/{engine_id}/advanced-settings")
async def get_engine_advanced_settings(engine_id: str):
    """Get advanced settings configuration for a specific engine."""
    import json
    
    if engine_id not in engine_manager.available_engines:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    # Path to advanced settings JSON file
    engine_config = engine_manager.available_engines[engine_id]
    engine_dir = Path(engine_config.executablePath).parent
    settings_file = engine_dir / "advanced_settings.json"
    
    if not settings_file.exists():
        # Return empty settings if file doesn't exist
        return {"engineId": engine_id, "settings": []}
    
    try:
        with open(settings_file, 'r', encoding='utf-8') as f:
            settings = json.load(f)
        return settings
    except Exception as e:
        print(f"Error loading advanced settings for {engine_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error loading advanced settings: {str(e)}")

@app.get("/system/cuda-status")
async def get_cuda_status():
    """Check CUDA/GPU availability for GPU-accelerated engines like Fukauraou."""
    try:
        from check_cuda import get_cuda_status
        status = get_cuda_status()
        return status
    except Exception as e:
        print(f"Error checking CUDA status: {e}")
        return {
            "hasGPU": False,
            "gpuNames": [],
            "hasCUDA": False,
            "cudaVersion": None,
            "ready": False,
            "warnings": ["Unable to check CUDA status. Error: " + str(e)]
        }

@app.get("/engines/config")
async def get_engine_config():
    """Get current engine configuration."""
    return {
        "black": {
            "engineId": engine_manager.active_engines.get("black"),
            "strengthLevel": engine_manager.strength_levels.get("black", 10),
            "customOptions": engine_manager.custom_options.get("black", {}),
        },
        "white": {
            "engineId": engine_manager.active_engines.get("white"),
            "strengthLevel": engine_manager.strength_levels.get("white", 10),
            "customOptions": engine_manager.custom_options.get("white", {}),
        },
        "analysis": {
            "engineId": engine_manager.active_engines.get("analysis"),
            "strengthLevel": engine_manager.strength_levels.get("analysis", 10),
            "enabled": engine_manager.analysis_enabled,
            "customOptions": engine_manager.custom_options.get("analysis", {}),
        }
    }

class EngineConfigUpdate(BaseModel):
    side: str  # "black", "white", or "analysis"
    engineId: Optional[str]  # None to disable
    strengthLevel: int = 10  # 1-10
    customOptions: Optional[Dict[str, str]] = None  # Custom USI options
    enabled: Optional[bool] = None  # For analysis engine only

@app.post("/engines/config")
async def update_engine_config(config: EngineConfigUpdate):
    """Update engine configuration (hot-swap)."""
    import asyncio
    import functools
    
    try:
        # Run blocking engine operation in thread pool
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            None,
            functools.partial(
                engine_manager.set_engine,
                config.side,
                config.engineId,
                config.strengthLevel,
                config.customOptions,
                config.enabled
            )
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to set engine")
        
        # Save preferences
        preferences = {
            "engines": {
                "black": {
                    "engineId": engine_manager.active_engines.get("black"),
                    "strengthLevel": engine_manager.strength_levels.get("black", 10),
                    "customOptions": engine_manager.custom_options.get("black", {}),
                },
                "white": {
                    "engineId": engine_manager.active_engines.get("white"),
                    "strengthLevel": engine_manager.strength_levels.get("white", 10),
                    "customOptions": engine_manager.custom_options.get("white", {}),
                },
                "analysis": {
                    "engineId": engine_manager.active_engines.get("analysis"),
                    "strengthLevel": engine_manager.strength_levels.get("analysis", 10),
                    "enabled": engine_manager.analysis_enabled,
                    "customOptions": engine_manager.custom_options.get("analysis", {}),
                }
            }
        }
        engine_manager.save_preferences(preferences)
        
        return {
            "success": True,
            "message": f"Engine configuration updated for {config.side}",
            "config": preferences
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=f"Engine startup timed out: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating engine: {str(e)}")

class PositionUpdate(BaseModel):
    position: str  # SFEN
    moves: List[str] = []  # Move history

@app.post("/engines/position")
async def update_engine_position(update: PositionUpdate):
    """Update the current game position for engines."""
    engine_manager.update_position(update.position, update.moves)
    return {"success": True}

# ===== End Engine Management =====

def _build_game_state(board: shogi.Board, last_move_notation: Optional[str] = None) -> GameState:
    # Extract pieces in hand from board
    pieces_in_hand = {"b": {}, "w": {}}
    
    # Black's pieces in hand
    for piece_type in shogi.PIECE_TYPES:
        count = board.pieces_in_hand[shogi.BLACK][piece_type]
        if count > 0:
            piece_symbol = shogi.PIECE_SYMBOLS[piece_type].upper()  # P, L, N, S, G, B, R
            pieces_in_hand["b"][piece_symbol] = count
    
    # White's pieces in hand  
    for piece_type in shogi.PIECE_TYPES:
        count = board.pieces_in_hand[shogi.WHITE][piece_type]
        if count > 0:
            piece_symbol = shogi.PIECE_SYMBOLS[piece_type].upper()
            pieces_in_hand["w"][piece_symbol] = count
    
    return GameState(
        sfen=board.sfen(),
        turn="b" if board.turn == shogi.BLACK else "w",
        legal_moves=[m.usi() for m in board.legal_moves],
        in_check=board.is_check(),
        is_game_over=board.is_game_over(),
        winner="b" if board.turn == shogi.WHITE else "w" if board.is_game_over() else None, # Simplified winner logic
        pieces_in_hand=pieces_in_hand,
        last_move_notation=last_move_notation
    )

