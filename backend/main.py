# -*- coding: utf-8 -*-
import sys
import os

# Force UTF-8 encoding for Windows
if sys.platform == 'win32':
    # Set environment variable for all subprocesses
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    os.environ['PYTHONUTF8'] = '1'
    # Reconfigure stdout/stderr if possible
    try:
        if sys.stdout.encoding != 'utf-8':
            sys.stdout.reconfigure(encoding='utf-8')
        if sys.stderr.encoding != 'utf-8':
            sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass  # Python < 3.7 doesn't have reconfigure

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from pathlib import Path
import shogi
from dotenv import load_dotenv
from engine_manager import EngineManager
from llm import ClaudeTeacher
from database import init_db, get_db
from session_manager import SessionManager
from models import (
    GameSession, GameSessionCreate, GameSessionUpdate,
    MoveRequest, MoveResponse, MoveRecord,
    HintRequest, HintResponse, MoveAnalysis,
    AnalyzeRequest, AnalyzeResponse,
    LLMQuery, LLMResponse,
    ReferenceFileCreate, ReferenceFile, SessionReferenceToggle
)

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

# Initialize database
init_db()

# Initialize session manager
session_manager = SessionManager()

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

# Legacy models for backwards compatibility
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
    Convert USI move to standard shogi notation with disambiguation.
    Examples: P-7f, S-6h, Bx3c+, P*5e, +Px4d, G6a-5b (disambiguated)
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
    
    def square_to_notation(square: int) -> str:
        """Convert square index to shogi notation (e.g., 80 -> 1a, 0 -> 9i)"""
        file = 9 - (square % 9)  # Files go from 9 to 1 (right to left)
        rank = chr(ord('a') + (square // 9))  # Ranks go from a to i (top to bottom)
        return f"{file}{rank}"
    
    to_square = move.to_square
    dest = square_to_notation(to_square)
    
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
    
    # Check for disambiguation: are there other pieces of the same type that can reach this square?
    needs_disambiguation = False
    for legal_move in board.legal_moves:
        # Skip the current move
        if legal_move == move:
            continue
        # Check if another piece of the same type can reach the same destination
        if (legal_move.to_square == to_square and 
            not legal_move.drop_piece_type and
            board.piece_type_at(legal_move.from_square) == piece_type):
            needs_disambiguation = True
            break
    
    # Add source square if disambiguation is needed
    if needs_disambiguation:
        source = square_to_notation(from_square)
        return f"{piece}{source}{separator}{dest}{promotion}"
    else:
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
        
        # Determine whose turn it is
        side_to_move = engine_manager._get_side_to_move(position, moves)
        
        # Get the engine ID being used
        engine_id = engine_manager.active_engines.get(side_to_move)
        engine_name = None
        if engine_id and engine_id in engine_manager.available_engines:
            engine_name = engine_manager.available_engines[engine_id].name
        
        # Use engine manager for analysis
        analysis = engine_manager.analyze_position(
            position=position,
            moves=moves,
            movetime=1000
        )
        
        if not analysis:
            raise HTTPException(status_code=500, detail="No engine available for analysis")
        
        # Add engine metadata
        analysis["engine_name"] = engine_name
        analysis["engine_side"] = side_to_move  # "black" or "white"
        
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

class ConversationHistoryRequest(BaseModel):
    user_question: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = None

@app.post("/session/{session_id}/explain")
async def explain_position_with_context(session_id: str, request: ConversationHistoryRequest, db = Depends(get_db)):
    """
    Get LLM explanation with full game context and conversation history.
    
    Args:
        session_id: Session ID
        request: Request body containing user_question and conversation_history
    
    Returns:
        LLM explanation with game context
    """
    try:
        # Get session with full context
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Build game context
        game_context = teacher.build_game_context(session, include_moves=10)
        
        # Get enabled reference files for this session
        from database import ReferenceFileDB, SessionReferenceDB
        enabled_refs = db.query(ReferenceFileDB).join(
            SessionReferenceDB,
            (SessionReferenceDB.reference_id == ReferenceFileDB.id) &
            (SessionReferenceDB.session_id == session_id) &
            (SessionReferenceDB.enabled == True)
        ).all()
        
        # Append reference file content to context
        if enabled_refs:
            game_context += "\n\n**Reference Materials:**"
            for ref_file in enabled_refs:
                game_context += f"\n\n--- {ref_file.name} ---\n{ref_file.content}"
        
        # Get current position analysis from appropriate engine
        board = shogi.Board(session.current_sfen)
        side = "black" if board.turn == shogi.BLACK else "white"
        
        # Parse SFEN for engine
        parts = session.current_sfen.split(" moves ")
        position = parts[0]
        moves = parts[1].split() if len(parts) > 1 else []
        
        # Get analysis from current side's engine
        analysis_raw = engine_manager.request_hint(
            side=side,
            position=position,
            moves=moves,
            movetime=1000
        )
        
        if not analysis_raw:
            raise HTTPException(status_code=500, detail="Failed to get position analysis")
        
        # Build analysis dict for LLM
        analysis = {
            'bestmove': analysis_raw['bestmove'],
            'score_cp': analysis_raw.get('score_cp'),
            'mate': analysis_raw.get('mate'),
            'pv': ' '.join(analysis_raw.get('pv', [])[:5])
        }
        
        # If user has a specific question, append it to context
        if request.user_question:
            game_context += f"\n\n**User Question:** {request.user_question}"
        
        # Get LLM explanation with full context and conversation history
        explanation = await teacher.explain(
            sfen=session.current_sfen,
            analysis=analysis,
            context=game_context,
            conversation_history=request.conversation_history or []
        )
        
        return {"explanation": explanation, "context": game_context}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in explain with context: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/config")
async def get_config():
    """Get current configuration (API key masked for security) - LEGACY"""
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

@app.get("/llm-config")
async def get_llm_config():
    """Get LLM configuration with masked API keys"""
    from config_handler import get_llm_config as get_cfg
    
    cfg = get_cfg()
    
    # Mask API keys for security
    masked_keys = {}
    for provider, key in cfg["api_keys"].items():
        if key and len(key) > 10:
            masked_keys[provider] = key[:7] + "..." + "•" * 10
        elif key:
            masked_keys[provider] = "•" * 16
        else:
            masked_keys[provider] = ""
    
    return {
        "api_keys": masked_keys,
        "selected_provider": cfg["selected_provider"],
        "selected_model": cfg["selected_model"],
        "available_models": {
            "claude": [
                "claude-sonnet-4-5-20250929",
                "claude-haiku-4-5-20251001",
                "claude-opus-4-1-20250805"
            ],
            "openai": [
                "gpt-5.1",
                "gpt-5-pro",
                "gpt-5-mini"
            ],
            "google": [
                "gemini-3-pro-preview",
                "gemini-2.5-pro",
                "gemini-2.5-flash-lite"
            ]
        }
    }

class LLMConfigUpdate(BaseModel):
    api_keys: Optional[Dict[str, str]] = None
    selected_provider: Optional[str] = None
    selected_model: Optional[str] = None

@app.post("/llm-config")
async def update_llm_config_endpoint(config: LLMConfigUpdate):
    """Update LLM configuration"""
    from config_handler import update_llm_config as update_cfg
    global teacher
    
    success = update_cfg(
        api_keys=config.api_keys,
        provider=config.selected_provider,
        model=config.selected_model
    )
    
    if success:
        # Reload LLM client with new config
        teacher.reload_config()
        return {"success": True, "message": "LLM configuration updated"}
    else:
        raise HTTPException(status_code=500, detail="Failed to update configuration")

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


# ===== NEW: Game Session Endpoints =====

@app.post("/session/create", response_model=GameSession)
async def create_game_session(request: GameSessionCreate):
    """Create a new game session"""
    try:
        session = session_manager.create_session(request)
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@app.get("/session/{session_id}", response_model=GameSession)
async def get_game_session(session_id: str):
    """Get a game session by ID"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get("/session/list", response_model=List[GameSession])
async def list_game_sessions(active_only: bool = True, limit: int = 50):
    """List game sessions"""
    return session_manager.list_sessions(active_only=active_only, limit=limit)


@app.put("/session/{session_id}", response_model=GameSession)
async def update_game_session(session_id: str, update: GameSessionUpdate):
    """Update session settings"""
    updated = session_manager.update_session(
        session_id,
        **update.dict(exclude_unset=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated


@app.delete("/session/{session_id}/moves/{move_number}")
async def delete_moves_after(session_id: str, move_number: int):
    """Delete all moves after the specified move number (for reverting)"""
    try:
        from database import SessionLocal, MoveRecordDB, GameSessionDB, engine
        db = SessionLocal()
        try:
            # Delete all moves after move_number
            deleted_count = db.query(MoveRecordDB).filter(
                MoveRecordDB.session_id == session_id,
                MoveRecordDB.move_number > move_number
            ).delete(synchronize_session='fetch')  # Explicitly sync session
            
            # Also expire the session object to force reload of relationships
            session_obj = db.query(GameSessionDB).filter(
                GameSessionDB.session_id == session_id
            ).first()
            if session_obj:
                db.expire(session_obj)
            
            db.commit()
            
            # Force all other sessions to see this change by flushing the engine
            engine.dispose()
            
            return {"success": True, "deleted_after": move_number, "deleted_count": deleted_count}
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete moves: {str(e)}")


# ===== NEW: Enhanced Hint Endpoint =====

@app.post("/hint", response_model=HintResponse)
async def get_hint(request: HintRequest):
    """Get side-specific hint from assigned engine"""
    try:
        # Get session
        session = session_manager.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Determine side
        if request.side:
            side = request.side
        else:
            # Auto-detect from current position
            board = shogi.Board(session.current_sfen)
            side = "black" if board.turn == shogi.BLACK else "white"
        
        # Get engine for this side
        engine_id = getattr(session, f"{side}_engine")
        if not engine_id:
            raise HTTPException(status_code=400, detail=f"No engine assigned to {side}")
        
        # Parse SFEN
        parts = session.current_sfen.split(" moves ")
        position = parts[0]
        moves = parts[1].split() if len(parts) > 1 else []
        
        # Request hint from engine
        analysis_raw = engine_manager.request_hint(
            side=side,
            position=position,
            moves=moves,
            movetime=1000
        )
        
        if not analysis_raw:
            raise HTTPException(status_code=500, detail="Failed to get hint from engine")
        
        # Convert to algebraic notation
        board = shogi.Board(session.current_sfen)
        bestmove_algebraic = usi_to_standard_notation(
            board,
            shogi.Move.from_usi(analysis_raw['bestmove'])
        )
        
        # Build PV in algebraic
        pv_algebraic = []
        temp_board = shogi.Board(session.current_sfen)
        for usi_move in analysis_raw.get('pv', [])[:5]:
            try:
                move = shogi.Move.from_usi(usi_move)
                pv_algebraic.append(usi_to_standard_notation(temp_board, move))
                temp_board.push(move)
            except:
                break
        
        # Process alternatives from MultiPV
        alternatives = []
        info_lines = analysis_raw.get('info_lines', [])
        
        # Parse and group info lines by multipv number
        from engine_manager.usi_protocol import USIProtocol
        parsed_lines = {}
        for line in info_lines:
            if not isinstance(line, str):
                continue
            parsed = USIProtocol.parse_info(line)
            if not parsed or 'pv' not in parsed or not parsed['pv']:
                continue
            multipv = parsed.get('multipv', 1)
            # Keep only the latest (deepest) info for each multipv
            if multipv not in parsed_lines or parsed.get('depth', 0) > parsed_lines[multipv].get('depth', 0):
                parsed_lines[multipv] = parsed
        
        # Sort by multipv number and skip #1 (that's the best move)
        for multipv_num in sorted(parsed_lines.keys())[1:4]:  # Show alternatives 2-4
            try:
                parsed = parsed_lines[multipv_num]
                pv = parsed['pv']
                if not pv:
                    continue
                
                # First move in PV is the alternative move
                alt_move = shogi.Move.from_usi(pv[0])
                alt_algebraic = usi_to_standard_notation(board, alt_move)
                
                # Build PV for alternative
                alt_pv_algebraic = []
                temp_board = shogi.Board(session.current_sfen)
                for usi_move in pv[:3]:
                    try:
                        move = shogi.Move.from_usi(usi_move)
                        alt_pv_algebraic.append(usi_to_standard_notation(temp_board, move))
                        temp_board.push(move)
                    except:
                        break
                
                alternatives.append({
                    'move_usi': pv[0],
                    'move_algebraic': alt_algebraic,
                    'score_cp': parsed.get('score_cp'),
                    'mate': parsed.get('mate'),
                    'pv_algebraic': alt_pv_algebraic
                })
            except Exception as e:
                print(f"Error processing alternative {multipv_num}: {e}")
                continue
        
        # Build analysis object
        analysis = MoveAnalysis(
            engine_id=analysis_raw['engine_id'],
            engine_name=analysis_raw['engine_name'],
            bestmove=analysis_raw['bestmove'],
            bestmove_algebraic=bestmove_algebraic,
            score_cp=analysis_raw.get('score_cp'),
            mate=analysis_raw.get('mate'),
            depth=analysis_raw.get('depth', 0),
            nodes=analysis_raw.get('nodes', 0),
            nps=analysis_raw.get('nps', 0),
            pv=analysis_raw.get('pv', []),
            pv_algebraic=pv_algebraic,
            alternatives=alternatives
        )
        
        # Check if expandable (has alternatives)
        expandable = len(alternatives) > 0
        
        return HintResponse(
            analysis=analysis,
            side=side,
            expandable=expandable
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting hint: {str(e)}")


# ===== NEW: Post-Move Analysis Endpoint =====

@app.post("/analyze-move", response_model=AnalyzeResponse)
async def analyze_move(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """Trigger Engine 3 post-move analysis"""
    try:
        # Get session
        session = session_manager.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if analyst is enabled
        if not session.analyst_enabled:
            return AnalyzeResponse(
                status="disabled",
                message="Analyst engine is not enabled for this session"
            )
        
        if not session.analyst_engine:
            return AnalyzeResponse(
                status="disabled",
                message="No analyst engine configured"
            )
        
        # Parse SFEN
        parts = session.current_sfen.split(" moves ")
        position = parts[0]
        moves = parts[1].split() if len(parts) > 1 else []
        
        if request.background:
            # Start analysis in background
            async def run_analysis():
                analysis_raw = engine_manager.request_post_move_analysis(
                    position=position,
                    moves=moves,
                    movetime=session.analyst_movetime
                )
                if analysis_raw and len(session.moves) > 0:
                    # Store analysis for last move
                    session_manager.add_post_move_analysis(
                        session.session_id,
                        len(session.moves),
                        analysis_raw
                    )
            
            background_tasks.add_task(run_analysis)
            
            return AnalyzeResponse(
                status="started",
                message="Analysis started in background"
            )
        else:
            # Block until complete
            analysis_raw = engine_manager.request_post_move_analysis(
                position=position,
                moves=moves,
                movetime=session.analyst_movetime
            )
            
            if not analysis_raw:
                return AnalyzeResponse(
                    status="error",
                    message="Analysis failed"
                )
            
            # Convert to MoveAnalysis
            board = shogi.Board(session.current_sfen)
            bestmove_algebraic = usi_to_standard_notation(
                board,
                shogi.Move.from_usi(analysis_raw['bestmove'])
            )
            
            analysis = MoveAnalysis(
                engine_id=analysis_raw['engine_id'],
                engine_name=analysis_raw['engine_name'],
                bestmove=analysis_raw['bestmove'],
                bestmove_algebraic=bestmove_algebraic,
                score_cp=analysis_raw.get('score_cp'),
                mate=analysis_raw.get('mate'),
                depth=analysis_raw.get('depth', 0),
                nodes=analysis_raw.get('nodes', 0),
                nps=analysis_raw.get('nps', 0),
                pv=analysis_raw.get('pv', []),
                pv_algebraic=[]
            )
            
            return AnalyzeResponse(
                status="complete",
                analysis=analysis
            )
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error analyzing move: {str(e)}")


# ===== NEW: Enhanced Move Recording =====

@app.post("/session/{session_id}/move", response_model=MoveResponse)
async def record_move(session_id: str, move_req: MoveRequest, background_tasks: BackgroundTasks):
    """Record a move in the session"""
    try:
        # Get session directly from database with explicit refresh
        from database import SessionLocal, GameSessionDB
        db = SessionLocal()
        try:
            # Query with explicit refresh to avoid stale data
            db_session = db.query(GameSessionDB).filter(
                GameSessionDB.session_id == session_id
            ).first()
            
            if not db_session:
                raise HTTPException(status_code=404, detail="Session not found")
            
            # Refresh to get latest data (in case of recent updates)
            db.refresh(db_session)
            current_sfen = db_session.current_sfen
            analyst_enabled = db_session.analyst_enabled
            analyst_movetime = db_session.analyst_movetime
        finally:
            db.close()
        
        # Parse current position using the refreshed SFEN
        board = shogi.Board(current_sfen)
        move = shogi.Move.from_usi(move_req.move_usi)
        
        if move not in board.legal_moves:
            raise HTTPException(status_code=400, detail="Illegal move")
        
        # Get algebraic notation BEFORE pushing
        move_algebraic = usi_to_standard_notation(board, move)
        position_before = board.sfen()
        
        # Determine player
        player = "black" if board.turn == shogi.BLACK else "white"
        
        # Apply move
        board.push(move)
        position_after = board.sfen()
        
        # Record move in database
        move_record = session_manager.add_move(
            session_id=session_id,
            move_usi=move_req.move_usi,
            move_algebraic=move_algebraic,
            position_before=position_before,
            position_after=position_after,
            player=player,
            time_spent=move_req.time_spent
        )
        
        # Trigger post-move analysis if enabled
        analysis_started = False
        if analyst_enabled:
            async def run_post_analysis():
                parts = position_after.split(" moves ")
                pos = parts[0]
                mvs = parts[1].split() if len(parts) > 1 else []
                
                analysis_raw = engine_manager.request_post_move_analysis(
                    position=pos,
                    moves=mvs,
                    movetime=analyst_movetime
                )
                
                if analysis_raw:
                    session_manager.add_post_move_analysis(
                        session_id,
                        move_record.move_number,
                        analysis_raw
                    )
            
            background_tasks.add_task(run_post_analysis)
            analysis_started = True
        
        return MoveResponse(
            success=True,
            move_record=move_record,
            new_sfen=position_after,
            analysis_started=analysis_started
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error recording move: {str(e)}")


# ===== Reference File Endpoints =====

@app.post("/reference-files", response_model=ReferenceFile)
async def create_reference_file(file: ReferenceFileCreate, db = Depends(get_db)):
    """Upload/create a new reference file"""
    from database import ReferenceFileDB
    from sqlalchemy import func
    
    try:
        # Check if file with same name exists
        existing = db.query(ReferenceFileDB).filter(
            func.lower(ReferenceFileDB.name) == func.lower(file.name)
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail=f"File '{file.name}' already exists")
        
        # Create new reference file
        db_file = ReferenceFileDB(
            name=file.name,
            description=file.description,
            file_type=file.file_type,
            content=file.content,
            file_size=len(file.content)
        )
        
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        
        return db_file
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating reference file: {str(e)}")


@app.get("/reference-files", response_model=List[ReferenceFile])
async def list_reference_files(db = Depends(get_db)):
    """List all reference files"""
    from database import ReferenceFileDB
    
    try:
        files = db.query(ReferenceFileDB).order_by(ReferenceFileDB.created_at.desc()).all()
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing reference files: {str(e)}")


@app.delete("/reference-files/{file_id}")
async def delete_reference_file(file_id: int, db = Depends(get_db)):
    """Delete a reference file"""
    from database import ReferenceFileDB, SessionReferenceDB
    
    try:
        # Get file
        db_file = db.query(ReferenceFileDB).filter(ReferenceFileDB.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="Reference file not found")
        
        # Delete session links first
        db.query(SessionReferenceDB).filter(SessionReferenceDB.reference_id == file_id).delete()
        
        # Delete file
        db.delete(db_file)
        db.commit()
        
        return {"success": True, "message": f"Deleted file: {db_file.name}"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting reference file: {str(e)}")


@app.get("/sessions/{session_id}/reference-files")
async def get_session_references(session_id: str, db = Depends(get_db)):
    """Get all reference files with their enabled status for a session"""
    from database import ReferenceFileDB, SessionReferenceDB
    
    try:
        # Get all reference files
        all_files = db.query(ReferenceFileDB).order_by(ReferenceFileDB.name).all()
        
        # Get enabled references for this session
        enabled_refs = db.query(SessionReferenceDB).filter(
            SessionReferenceDB.session_id == session_id,
            SessionReferenceDB.enabled == True
        ).all()
        
        enabled_ids = {ref.reference_id for ref in enabled_refs}
        
        # Build response with enabled status
        result = []
        for file in all_files:
            result.append({
                "id": file.id,
                "name": file.name,
                "description": file.description,
                "file_type": file.file_type,
                "file_size": file.file_size,
                "created_at": file.created_at,
                "enabled": file.id in enabled_ids
            })
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting session references: {str(e)}")


@app.post("/sessions/{session_id}/reference-files/{file_id}/toggle")
async def toggle_session_reference(session_id: str, file_id: int, enabled: bool, db = Depends(get_db)):
    """Toggle a reference file for a session"""
    from database import SessionReferenceDB, ReferenceFileDB, GameSessionDB
    
    try:
        # Verify session exists
        session = db.query(GameSessionDB).filter(GameSessionDB.session_id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify file exists
        file = db.query(ReferenceFileDB).filter(ReferenceFileDB.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="Reference file not found")
        
        # Check if link exists
        link = db.query(SessionReferenceDB).filter(
            SessionReferenceDB.session_id == session_id,
            SessionReferenceDB.reference_id == file_id
        ).first()
        
        if link:
            # Update existing link
            link.enabled = enabled
        else:
            # Create new link
            link = SessionReferenceDB(
                session_id=session_id,
                reference_id=file_id,
                enabled=enabled
            )
            db.add(link)
        
        db.commit()
        
        return {"success": True, "enabled": enabled}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error toggling reference: {str(e)}")

