# -*- coding: utf-8 -*-
import sys
import os
import logging

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

# Filter out OBS polling endpoint logs
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not (
            record.getMessage().find("/ui-preferences") != -1 or
            record.getMessage().find("/session/list") != -1
        )

# Add filter to uvicorn access logger
logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Body
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
    ReferenceFileCreate, ReferenceFile, SessionReferenceToggle,
    GameImportRequest, GameImportResponse,
    GameExportRequest, GameExportResponse,
    ComputerMoveRequest, ComputerMoveResponse,
    ImageAnalysisRequest, ImageAnalysisResponse,
    PuzzleRequest, PuzzleResponse, PuzzleVerifyRequest, PuzzleVerifyResponse
)
import random

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

# Load random move settings from preferences
if black_cfg.get("randomMoveEnabled") is not None:
    engine_manager.set_random_move_settings(
        "black",
        black_cfg.get("randomMoveEnabled", False),
        black_cfg.get("randomMoveInterval", 10)
    )

if white_cfg.get("randomMoveEnabled") is not None:
    engine_manager.set_random_move_settings(
        "white",
        white_cfg.get("randomMoveEnabled", False),
        white_cfg.get("randomMoveInterval", 10)
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
            # Handle "sfen moves move1 move2 ..." format
            if " moves " in sfen:
                parts = sfen.split(" moves ")
                position = parts[0]
                moves = parts[1].split() if len(parts) > 1 else []
                board = shogi.Board(position)
                for move_usi in moves:
                    try:
                        move = shogi.Move.from_usi(move_usi)
                        if move in board.legal_moves:
                            board.push(move)
                    except:
                        pass
            else:
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

class GameAnalysisRequest(BaseModel):
    sfen: str
    movetime: int = 1000

@app.post("/game/analyze")
async def analyze_for_game_record(request: GameAnalysisRequest):
    """
    Analyze a position using the ANALYSIS engine (Engine 3).
    Used for game record analysis window.
    """
    try:
        import re
        
        # Parse SFEN to extract position and moves
        parts = request.sfen.split(" moves ")
        position = parts[0]
        moves = parts[1].split() if len(parts) > 1 else []
        
        # Use the analyst engine specifically (Engine 3)
        analysis = engine_manager.request_post_move_analysis(
            position=position,
            moves=moves,
            movetime=request.movetime
        )
        
        if not analysis:
            raise HTTPException(status_code=500, detail="Analysis engine not available")
        
        # Create board at this position to convert moves
        board = shogi.Board(position)
        for m in moves:
            try:
                move = shogi.Move.from_usi(m)
                if move in board.legal_moves:
                    board.push(move)
            except:
                pass
        
        # Convert bestmove to notation
        if analysis.get('bestmove'):
            try:
                best_move = shogi.Move.from_usi(analysis['bestmove'])
                if best_move in board.legal_moves:
                    analysis['bestmove_notation'] = usi_to_standard_notation(board, best_move)
                else:
                    analysis['bestmove_notation'] = analysis['bestmove']
            except:
                analysis['bestmove_notation'] = analysis['bestmove']
        
        # Parse info_lines for MultiPV alternatives
        # Use dict to keep only the last (deepest) info for each multipv
        alternatives_dict = {}
        info_lines = analysis.get('info_lines', [])
        
        print(f"[DEBUG] Got {len(info_lines)} info lines from engine")
        if info_lines:
            # Show last few lines for debugging
            for line in info_lines[-5:]:
                print(f"[DEBUG] Info line: {line[:150]}...")
        
        for line in info_lines:
            # Look for lines with score and pv (multipv might not always be present)
            if 'score cp' in line and ' pv ' in line:
                try:
                    # Extract multipv number (default to 1 if not present)
                    multipv_match = re.search(r'multipv (\d+)', line)
                    # Extract score
                    score_match = re.search(r'score cp (-?\d+)', line)
                    # Extract full pv (all moves after " pv ")
                    pv_match = re.search(r' pv (.+)$', line)
                    
                    if score_match and pv_match:
                        # Default to multipv 1 if not specified
                        multipv = int(multipv_match.group(1)) if multipv_match else 1
                        score_cp = int(score_match.group(1))
                        pv_moves = pv_match.group(1).strip().split()
                        
                        if not pv_moves:
                            continue
                            
                        move_usi = pv_moves[0]
                        
                        # Convert first move to notation
                        try:
                            move = shogi.Move.from_usi(move_usi)
                            if move in board.legal_moves:
                                move_notation = usi_to_standard_notation(board, move)
                            else:
                                move_notation = move_usi
                        except:
                            move_notation = move_usi
                        
                        # Convert continuation moves (up to 5 more moves)
                        continuation = []
                        temp_board = shogi.Board(board.sfen())
                        for pv_move in pv_moves[:6]:  # First move + 5 continuation
                            try:
                                m = shogi.Move.from_usi(pv_move)
                                if m in temp_board.legal_moves:
                                    notation = usi_to_standard_notation(temp_board, m)
                                    continuation.append(notation)
                                    temp_board.push(m)
                                else:
                                    continuation.append(pv_move)
                                    break
                            except:
                                continuation.append(pv_move)
                                break
                        
                        # Store by multipv key - later entries overwrite earlier (deeper search)
                        alternatives_dict[multipv] = {
                            'multipv': multipv,
                            'move_usi': move_usi,
                            'move_notation': move_notation,
                            'score_cp': score_cp,
                            'continuation': continuation  # Full line
                        }
                except Exception as e:
                    print(f"Error parsing info line: {e}")
                    continue
        
        # Convert dict to sorted list and take top 5
        alternatives = sorted(alternatives_dict.values(), key=lambda x: x['multipv'])
        
        # Fallback: if no alternatives found, create one from bestmove
        if not alternatives and analysis.get('bestmove'):
            print("[DEBUG] No alternatives parsed, creating from bestmove")
            alternatives = [{
                'multipv': 1,
                'move_usi': analysis['bestmove'],
                'move_notation': analysis.get('bestmove_notation', analysis['bestmove']),
                'score_cp': analysis.get('score_cp', 0),
                'continuation': [analysis.get('bestmove_notation', analysis['bestmove'])]
            }]
        
        print(f"[DEBUG] Returning {len(alternatives)} alternatives")
        analysis['alternatives'] = alternatives[:5]
        
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Analysis error: {type(e).__name__}: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)

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
        "claude_thinking": cfg.get("claude_thinking", False),
        "openai_reasoning_effort": cfg.get("openai_reasoning_effort", "medium"),
        "verbosity": cfg.get("verbosity", "medium"),
        "available_models": {
            "claude": [
                "claude-sonnet-4-5-20250929",
                "claude-haiku-4-5-20251001",
                "claude-opus-4-1-20250805"
            ],
            "openai": [
                "gpt-5.1",
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
    claude_thinking: Optional[bool] = None
    openai_reasoning_effort: Optional[str] = None
    verbosity: Optional[str] = None

@app.post("/llm-config")
async def update_llm_config_endpoint(config: LLMConfigUpdate):
    """Update LLM configuration"""
    from config_handler import update_llm_config as update_cfg
    global teacher
    
    success = update_cfg(
        api_keys=config.api_keys,
        provider=config.selected_provider,
        model=config.selected_model,
        claude_thinking=config.claude_thinking,
        openai_reasoning_effort=config.openai_reasoning_effort,
        verbosity=config.verbosity
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

@app.get("/system/info")
async def get_system_info():
    """Get system information (CPU cores and total RAM)."""
    try:
        import psutil
        import os
        
        # Get CPU cores (logical processors)
        cpu_cores = os.cpu_count() or 4
        
        # Get total system memory in GB
        total_memory_bytes = psutil.virtual_memory().total
        total_memory_gb = total_memory_bytes / (1024 ** 3)
        
        return {
            "cpu_cores": cpu_cores,
            "total_memory_gb": round(total_memory_gb, 2)
        }
    except Exception as e:
        print(f"Error getting system info: {e}")
        return {
            "cpu_cores": 4,
            "total_memory_gb": 8.0
        }

@app.get("/engines/config")
async def get_engine_config():
    """Get current engine configuration."""
    return {
        "black": {
            "engineId": engine_manager.active_engines.get("black"),
            "strengthLevel": engine_manager.strength_levels.get("black", 10),
            "customOptions": engine_manager.custom_options.get("black", {}),
            "randomMoveEnabled": engine_manager.random_move_settings.get("black", {}).get("enabled", False),
            "randomMoveInterval": engine_manager.random_move_settings.get("black", {}).get("interval", 10),
        },
        "white": {
            "engineId": engine_manager.active_engines.get("white"),
            "strengthLevel": engine_manager.strength_levels.get("white", 10),
            "customOptions": engine_manager.custom_options.get("white", {}),
            "randomMoveEnabled": engine_manager.random_move_settings.get("white", {}).get("enabled", False),
            "randomMoveInterval": engine_manager.random_move_settings.get("white", {}).get("interval", 10),
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
    randomMoveEnabled: Optional[bool] = None  # For black/white: enable random mistakes
    randomMoveInterval: Optional[int] = None  # For black/white: moves between random moves (4-20)

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
        
        # Handle random move settings for black/white engines
        if config.side in ["black", "white"]:
            if config.randomMoveEnabled is not None or config.randomMoveInterval is not None:
                current_settings = engine_manager.random_move_settings.get(config.side, {})
                enabled = config.randomMoveEnabled if config.randomMoveEnabled is not None else current_settings.get("enabled", False)
                interval = config.randomMoveInterval if config.randomMoveInterval is not None else current_settings.get("interval", 10)
                engine_manager.set_random_move_settings(config.side, enabled, interval)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to set engine")
        
        # Save preferences
        preferences = {
            "engines": {
                "black": {
                    "engineId": engine_manager.active_engines.get("black"),
                    "strengthLevel": engine_manager.strength_levels.get("black", 10),
                    "customOptions": engine_manager.custom_options.get("black", {}),
                    "randomMoveEnabled": engine_manager.random_move_settings.get("black", {}).get("enabled", False),
                    "randomMoveInterval": engine_manager.random_move_settings.get("black", {}).get("interval", 10),
                },
                "white": {
                    "engineId": engine_manager.active_engines.get("white"),
                    "strengthLevel": engine_manager.strength_levels.get("white", 10),
                    "customOptions": engine_manager.custom_options.get("white", {}),
                    "randomMoveEnabled": engine_manager.random_move_settings.get("white", {}).get("enabled", False),
                    "randomMoveInterval": engine_manager.random_move_settings.get("white", {}).get("interval", 10),
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
        # Reset random move counters for new game
        engine_manager.reset_random_move_counters()
        
        session = session_manager.create_session(request)
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@app.get("/session/list", response_model=List[GameSession])
async def list_game_sessions(active_only: bool = True, limit: int = 50):
    """List game sessions"""
    return session_manager.list_sessions(active_only=active_only, limit=limit)


@app.get("/session/{session_id}", response_model=GameSession)
async def get_game_session(session_id: str):
    """Get a game session by ID"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


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


# ===== Game Import/Export Endpoints =====

class GameParseRequest(BaseModel):
    content: str
    format: Optional[str] = None

class ParsedMoveResponse(BaseModel):
    move_number: int
    player: str
    move_usi: str
    move_notation: Optional[str] = None
    sfen_after: str
    time_spent: Optional[int] = None

class GameParseResponse(BaseModel):
    success: bool
    message: str
    moves: Optional[List[ParsedMoveResponse]] = None
    starting_sfen: Optional[str] = None
    black_name: Optional[str] = None
    white_name: Optional[str] = None
    detected_format: Optional[str] = None

@app.post("/game/parse", response_model=GameParseResponse)
async def parse_game(request: GameParseRequest):
    """
    Parse a game file without creating a session.
    Returns the moves and metadata for analysis.
    """
    try:
        from game_formats import parse_game_file, detect_format
        
        # Detect format if not specified
        detected_format = request.format or detect_format(request.content)
        
        # Parse the game file
        try:
            record = parse_game_file(request.content, detected_format)
        except Exception as e:
            return GameParseResponse(
                success=False,
                message=f"Failed to parse {detected_format.upper()} file: {str(e)}",
                detected_format=detected_format
            )
        
        # Replay moves to get SFEN after each move
        board = shogi.Board(record.starting_sfen)
        moves_with_sfen = []
        
        for parsed_move in record.moves:
            try:
                move = shogi.Move.from_usi(parsed_move.move_usi)
                if move not in board.legal_moves:
                    continue
                
                # Get algebraic notation (function defined earlier in this file)
                move_notation = usi_to_standard_notation(board, move)
                
                # Make the move
                board.push(move)
                
                moves_with_sfen.append(ParsedMoveResponse(
                    move_number=parsed_move.move_number,
                    player=parsed_move.player,
                    move_usi=parsed_move.move_usi,
                    move_notation=move_notation,
                    sfen_after=board.sfen(),
                    time_spent=parsed_move.time_spent
                ))
            except Exception as e:
                print(f"Error parsing move {parsed_move.move_usi}: {e}")
                continue
        
        return GameParseResponse(
            success=True,
            message=f"Successfully parsed {len(moves_with_sfen)} moves",
            moves=moves_with_sfen,
            starting_sfen=record.starting_sfen,
            black_name=record.metadata.black_name,
            white_name=record.metadata.white_name,
            detected_format=detected_format
        )
        
    except Exception as e:
        return GameParseResponse(
            success=False,
            message=f"Error parsing game: {str(e)}"
        )

@app.post("/game/import", response_model=GameImportResponse)
async def import_game(request: GameImportRequest):
    """
    Import a game from KIF, CSA, KI2, or PSN format.
    Creates a new session with the imported moves.
    """
    try:
        from game_formats import parse_game_file, detect_format, GameRecord
        from datetime import datetime
        
        # Detect format if not specified
        detected_format = request.format or detect_format(request.content)
        
        # Parse the game file
        try:
            record = parse_game_file(request.content, detected_format)
        except Exception as e:
            return GameImportResponse(
                success=False,
                message=f"Failed to parse {detected_format.upper()} file: {str(e)}",
                detected_format=detected_format
            )
        
        # Override player names if provided
        white_name = request.white_name or record.metadata.white_name
        black_name = request.black_name or record.metadata.black_name
        
        # Create a new session
        session_request = GameSessionCreate(
            game_mode=request.game_mode,
            white_player="human",
            black_player="human",
            white_name=white_name,
            black_name=black_name,
            white_engine="yaneuraou",
            black_engine="yaneuraou",
            starting_sfen=record.starting_sfen
        )
        
        session = session_manager.create_session(session_request)
        
        # Replay the moves
        board = shogi.Board(record.starting_sfen)
        
        for parsed_move in record.moves:
            try:
                move = shogi.Move.from_usi(parsed_move.move_usi)
                if move not in board.legal_moves:
                    continue
                
                position_before = board.sfen()
                player = "black" if board.turn == shogi.BLACK else "white"
                
                # Get algebraic notation
                move_algebraic = usi_to_standard_notation(board, move)
                
                board.push(move)
                position_after = board.sfen()
                
                # Record the move
                session_manager.add_move(
                    session_id=session.session_id,
                    move_usi=parsed_move.move_usi,
                    move_algebraic=move_algebraic,
                    position_before=position_before,
                    position_after=position_after,
                    player=player,
                    time_spent=parsed_move.time_spent
                )
            except Exception as e:
                print(f"Error replaying move {parsed_move.move_usi}: {e}")
                continue
        
        return GameImportResponse(
            success=True,
            session_id=session.session_id,
            message=f"Successfully imported {len(record.moves)} moves from {detected_format.upper()} file",
            move_count=len(record.moves),
            detected_format=detected_format
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return GameImportResponse(
            success=False,
            message=f"Import failed: {str(e)}"
        )


@app.post("/game/export", response_model=GameExportResponse)
async def export_game(request: GameExportRequest):
    """
    Export a game to KIF, CSA, KI2, or PSN format.
    """
    try:
        from game_formats import export_game_file, GameRecord, GameMetadata, ParsedMove
        from datetime import datetime
        
        # Get session
        session = session_manager.get_session(request.session_id)
        if not session:
            return GameExportResponse(
                success=False,
                message="Session not found"
            )
        
        # Build GameRecord from session
        metadata = GameMetadata(
            white_name=request.white_name or session.white_name,
            black_name=request.black_name or session.black_name,
            event=request.event_name or "Shogi Teacher Game",
            date=session.created_at,
            result="*"  # Game still in progress
        )
        
        # Check for game result
        board = shogi.Board(session.current_sfen)
        if board.is_game_over():
            if board.is_checkmate():
                # Last player to move won
                metadata.result = "0-1" if board.turn == shogi.BLACK else "1-0"
            else:
                metadata.result = "1/2-1/2"
        
        # Convert moves
        parsed_moves = []
        for move in session.moves:
            parsed_moves.append(ParsedMove(
                move_number=move.move_number,
                player=move.player,
                move_usi=move.move_usi,
                move_algebraic=move.move_algebraic,
                time_spent=move.time_spent
            ))
        
        record = GameRecord(
            metadata=metadata,
            moves=parsed_moves,
            starting_sfen="lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        )
        
        # Export to format
        try:
            content = export_game_file(record, request.format)
        except ValueError as e:
            return GameExportResponse(
                success=False,
                message=str(e)
            )
        
        # Generate filename
        if request.filename:
            filename = request.filename
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            white = metadata.white_name.replace(" ", "_")
            black = metadata.black_name.replace(" ", "_")
            filename = f"{black}_vs_{white}_{timestamp}"
        
        # Add extension
        extensions = {'kif': '.kif', 'csa': '.csa', 'ki2': '.ki2', 'psn': '.psn'}
        filename += extensions.get(request.format.lower(), '.txt')
        
        return GameExportResponse(
            success=True,
            content=content,
            filename=filename,
            format=request.format,
            message=f"Successfully exported {len(parsed_moves)} moves to {request.format.upper()}"
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return GameExportResponse(
            success=False,
            message=f"Export failed: {str(e)}"
        )


# ===== Computer Move Endpoint =====

@app.post("/session/{session_id}/computer-move", response_model=ComputerMoveResponse)
async def computer_move(session_id: str, request: ComputerMoveRequest):
    """
    Have the computer (engine) make a move for the current side.
    Used in Human vs Computer and Computer vs Computer modes.
    """
    import time
    
    try:
        # Get session
        session = session_manager.get_session(session_id)
        if not session:
            return ComputerMoveResponse(
                success=False,
                message="Session not found"
            )
        
        # Parse current position
        board = shogi.Board(session.current_sfen)
        
        # Check if game is over
        if board.is_game_over():
            winner = None
            if board.is_checkmate():
                winner = "white" if board.turn == shogi.BLACK else "black"
            return ComputerMoveResponse(
                success=False,
                is_game_over=True,
                winner=winner,
                message="Game is already over"
            )
        
        # Determine which side to play
        side = "black" if board.turn == shogi.BLACK else "white"
        
        # Get engine for this side
        engine_id = session.black_engine if side == "black" else session.white_engine
        if not engine_id:
            return ComputerMoveResponse(
                success=False,
                message=f"No engine assigned to {side}"
            )
        
        # Parse SFEN for engine
        parts = session.current_sfen.split(" moves ")
        position = parts[0]
        moves = parts[1].split() if len(parts) > 1 else []
        
        # Get move from engine (uses request_hint which supports random moves)
        start_time = time.time()
        print(f"→ Using {side} engine: {engine_id}")
        
        analysis = engine_manager.request_hint(
            side=side,
            position=position,
            moves=moves,
            movetime=request.movetime
        )
        
        thinking_time = time.time() - start_time
        
        if not analysis or 'bestmove' not in analysis:
            return ComputerMoveResponse(
                success=False,
                message="Engine failed to produce a move"
            )
        
        bestmove_usi = analysis['bestmove']
        
        # Validate move
        try:
            move = shogi.Move.from_usi(bestmove_usi)
            if move not in board.legal_moves:
                return ComputerMoveResponse(
                    success=False,
                    message=f"Engine produced illegal move: {bestmove_usi}"
                )
        except:
            return ComputerMoveResponse(
                success=False,
                message=f"Invalid move format from engine: {bestmove_usi}"
            )
        
        # Get algebraic notation
        move_algebraic = usi_to_standard_notation(board, move)
        position_before = board.sfen()
        
        # Apply move
        board.push(move)
        position_after = board.sfen()
        
        # Record the move
        session_manager.add_move(
            session_id=session_id,
            move_usi=bestmove_usi,
            move_algebraic=move_algebraic,
            position_before=position_before,
            position_after=position_after,
            player=side,
            time_spent=thinking_time
        )
        
        # Check game state after move
        is_game_over = board.is_game_over()
        winner = None
        if is_game_over and board.is_checkmate():
            winner = side  # The side that just moved won
        
        # Get engine name
        engine_name = None
        if engine_id in engine_manager.available_engines:
            engine_name = engine_manager.available_engines[engine_id].name
        
        return ComputerMoveResponse(
            success=True,
            move_usi=bestmove_usi,
            move_algebraic=move_algebraic,
            new_sfen=position_after,
            is_game_over=is_game_over,
            winner=winner,
            engine_name=engine_name,
            thinking_time=thinking_time,
            message=f"{engine_name or engine_id} played {move_algebraic}"
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return ComputerMoveResponse(
            success=False,
            message=f"Error: {str(e)}"
        )


@app.post("/session/{session_id}/pause")
async def pause_session(session_id: str):
    """Pause a computer vs computer game"""
    session = session_manager.update_session(session_id, is_paused=True)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "is_paused": True}


@app.post("/session/{session_id}/resume")
async def resume_session(session_id: str):
    """Resume a paused computer vs computer game"""
    session = session_manager.update_session(session_id, is_paused=False)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "is_paused": False}


@app.post("/game/analyze-image", response_model=ImageAnalysisResponse)
async def analyze_board_image(request: ImageAnalysisRequest):
    """
    Analyze a shogi board image and return the position in SFEN format.
    
    Uses the user's configured LLM to analyze the image and extract the board position.
    Requires a vision-capable LLM (Claude, GPT-4o, or Gemini).
    """
    try:
        # Check if LLM is properly configured
        if not teacher.get_active_client():
            raise HTTPException(
                status_code=400, 
                detail="No LLM configured. Please set up an API key in Settings → LLM Settings and Resources."
            )
        
        # Analyze the image
        result = teacher.analyze_board_image(request.image)
        
        # Validate the SFEN by trying to create a board
        is_valid = True
        validation_error = None
        try:
            shogi.Board(result['sfen'])
            # If it works, the SFEN is valid
        except Exception as e:
            # Don't raise an error - return the SFEN anyway so user can fix it manually
            is_valid = False
            validation_error = str(e)
        
        return ImageAnalysisResponse(
            sfen=result['sfen'],
            confidence=result.get('confidence', 'medium'),
            notes=result.get('notes'),
            valid=is_valid,
            validation_error=validation_error
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")


# ===== Puzzle Manager =====

class PuzzleManager:
    """Manages puzzle file loading and random selection"""
    
    def __init__(self, puzzles_dir: str):
        self.puzzles_dir = Path(puzzles_dir)
        self.file_line_counts: Dict[int, int] = {}
        self.available_moves = []
        self._index_files()
    
    def _index_files(self):
        """Index puzzle files and count lines for efficient random access"""
        print("\n=== Indexing Puzzle Files ===")
        for moves in [3, 5, 7, 9, 11]:
            filepath = self.puzzles_dir / f"mate{moves}.sfen"
            if filepath.exists():
                # Count lines efficiently
                with open(filepath, 'r', encoding='utf-8') as f:
                    line_count = sum(1 for _ in f)
                self.file_line_counts[moves] = line_count
                self.available_moves.append(moves)
                print(f"✓ mate{moves}.sfen: {line_count:,} puzzles")
            else:
                print(f"✗ mate{moves}.sfen not found")
        print(f"Total puzzle types available: {self.available_moves}")
    
    def get_random_puzzle(self, min_moves: int, max_moves: int) -> Optional[Dict]:
        """Get a random puzzle within the specified move range"""
        # Filter to available move counts in range
        valid_moves = [m for m in self.available_moves if min_moves <= m <= max_moves]
        if not valid_moves:
            return None
        
        # Pick a random move count
        moves = random.choice(valid_moves)
        
        # Pick a random line from that file
        line_count = self.file_line_counts[moves]
        line_num = random.randint(0, line_count - 1)
        
        filepath = self.puzzles_dir / f"mate{moves}.sfen"
        with open(filepath, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i == line_num:
                    sfen = line.strip()
                    # Parse side to move
                    parts = sfen.split()
                    side = parts[1] if len(parts) > 1 else 'b'
                    return {
                        'sfen': sfen,
                        'moves_to_mate': moves,
                        'side_to_move': side
                    }
        return None


# Initialize puzzle manager
puzzles_path = Path(__file__).parent / "puzzles"
puzzle_manager = PuzzleManager(str(puzzles_path))


@app.post("/puzzle/random", response_model=PuzzleResponse)
async def get_random_puzzle(request: PuzzleRequest):
    """Get a random puzzle within the specified move range"""
    puzzle = puzzle_manager.get_random_puzzle(request.min_moves, request.max_moves)
    if not puzzle:
        raise HTTPException(status_code=404, detail="No puzzles found in the specified range")
    return PuzzleResponse(**puzzle)


@app.post("/puzzle/verify", response_model=PuzzleVerifyResponse)
async def verify_puzzle_move(request: PuzzleVerifyRequest):
    """
    Verify if a puzzle move is correct.
    A move is correct if it still leads to checkmate in the required moves.
    """
    try:
        # Create board from current position
        board = shogi.Board(request.sfen)
        
        # Check if the move is legal
        try:
            move = shogi.Move.from_usi(request.move_usi)
            if move not in board.legal_moves:
                return PuzzleVerifyResponse(
                    is_correct=False,
                    message="Illegal move"
                )
        except:
            return PuzzleVerifyResponse(
                is_correct=False,
                message="Invalid move format"
            )
        
        # Make the move
        board.push(move)
        
        # Check if this is checkmate
        if board.is_checkmate():
            return PuzzleVerifyResponse(
                is_correct=True,
                is_checkmate=True,
                is_puzzle_complete=True,
                message="Checkmate! Puzzle complete!"
            )
        
        # Calculate remaining moves allowed
        # In tsume, player makes all odd-numbered moves (1, 3, 5, etc.)
        # So for a mate-in-3, player makes move 1 and 3
        remaining_moves = request.target_moves - (request.moves_made + 1)
        
        # Use engine to check if position still leads to mate
        # The opponent will play, then we need to find mate in remaining-1 moves
        # Use longer analysis time for accurate tsume verification
        analysis = engine_manager.request_post_move_analysis(
            position=board.sfen(),
            moves=[],
            movetime=5000  # Longer time for tsume accuracy
        )
        
        if not analysis:
            return PuzzleVerifyResponse(
                is_correct=False,
                message="Could not verify move - engine unavailable"
            )
        
        # Debug: log the analysis result
        print(f"[PUZZLE DEBUG] After player move, engine analysis:")
        print(f"  Position: {board.sfen()}")
        print(f"  Best move: {analysis.get('bestmove')}")
        print(f"  Mate: {analysis.get('mate')}")
        print(f"  Score CP: {analysis.get('score_cp')}")
        
        # For tsume problems, after player's move, opponent should have no escape
        # If engine finds mate for opponent, player's move was wrong
        # If engine finds that the original attacker can still mate, it's correct
        mate_value = analysis.get('mate')
        score_cp = analysis.get('score_cp')
        
        # The engine evaluates from the side to move's perspective
        # After player's move, it's opponent's turn
        # If mate is negative (opponent gets mated), player's move is correct
        # Also accept if score is extremely negative (overwhelming disadvantage for defender)
        is_winning = (mate_value is not None and mate_value < 0) or \
                     (mate_value is None and score_cp is not None and score_cp < -5000)
        
        print(f"[PUZZLE DEBUG] is_winning={is_winning} (mate={mate_value}, score_cp={score_cp})")
        
        if is_winning:
            # Opponent will be mated - player's move is correct
            # Now get opponent's best defense move
            opponent_move = analysis.get('bestmove')
            if opponent_move and opponent_move != 'resign':
                try:
                    opp_move_obj = shogi.Move.from_usi(opponent_move)
                    opponent_notation = usi_to_standard_notation(board, opp_move_obj)
                    board.push(opp_move_obj)
                    new_sfen = board.sfen()
                    
                    return PuzzleVerifyResponse(
                        is_correct=True,
                        is_checkmate=False,
                        is_puzzle_complete=False,
                        message="Correct! Continue...",
                        opponent_move=opponent_move,
                        opponent_move_notation=opponent_notation,
                        new_sfen=new_sfen
                    )
                except:
                    pass
            
            # If opponent resigned or no valid move
            return PuzzleVerifyResponse(
                is_correct=True,
                is_checkmate=False,
                is_puzzle_complete=True,
                message="Correct! Opponent has no defense."
            )
        else:
            # Player's move doesn't lead to mate
            # Get the correct move as a hint
            board_before = shogi.Board(request.sfen)
            hint_analysis = engine_manager.request_post_move_analysis(
                position=request.sfen,
                moves=[],
                movetime=2000
            )
            best_move = hint_analysis.get('bestmove') if hint_analysis else None
            best_notation = None
            if best_move:
                try:
                    bm = shogi.Move.from_usi(best_move)
                    best_notation = usi_to_standard_notation(board_before, bm)
                except:
                    best_notation = best_move
            
            return PuzzleVerifyResponse(
                is_correct=False,
                message="This move doesn't lead to checkmate in the required moves.",
                best_move=best_move,
                best_move_notation=best_notation
            )
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@app.post("/puzzle/hint")
async def get_puzzle_hint(sfen: str = Body(...), target_moves: int = Body(...)):
    """
    Get a hint for a tsume puzzle, checking if the move leads to optimal mate.
    """
    try:
        board = shogi.Board(sfen)
        
        print(f"[PUZZLE HINT] Getting hint for mate-in-{target_moves}")
        
        # Use longer analysis time for accurate mate detection
        analysis = engine_manager.request_post_move_analysis(
            position=sfen,
            moves=[],
            movetime=5000  # 5 seconds for more accurate mate detection
        )
        
        if analysis and analysis.get('bestmove'):
            bestmove = analysis['bestmove']
            mate_value = analysis.get('mate')
            
            try:
                move = shogi.Move.from_usi(bestmove)
                notation = usi_to_standard_notation(board, move)
            except:
                notation = bestmove
            
            # Check if the mate value matches the target
            is_optimal = mate_value is not None and mate_value > 0 and mate_value <= target_moves
            
            # Calculate how player moves remain based on current position
            # Player makes odd moves: 1, 3, 5, etc.
            # If this is a mate-in-3 and engine finds mate-in-5, warn user
            warning = None
            if mate_value is not None and mate_value > 0:
                if mate_value > target_moves:
                    warning = f"This move leads to mate in {mate_value}, but there's a faster mate in {target_moves}. Try to find the optimal solution!"
            elif mate_value is None or mate_value <= 0:
                # Engine found winning position but didn't report explicit mate
                warning = "The engine found a winning move, but couldn't confirm the exact mate sequence."
            
            return {
                "bestmove": bestmove,
                "bestmove_notation": notation,
                "mate": mate_value,
                "target_moves": target_moves,
                "is_optimal": is_optimal,
                "warning": warning,
                "score_cp": analysis.get('score_cp'),
                "engine": "Analysis"
            }
        
        raise HTTPException(status_code=500, detail="Could not get hint")
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Hint failed: {str(e)}")


@app.get("/puzzle/available")
async def get_available_puzzles():
    """Get information about available puzzle types"""
    return {
        "available_moves": puzzle_manager.available_moves,
        "counts": puzzle_manager.file_line_counts
    }
