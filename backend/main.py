from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import sys
import shogi
from dotenv import load_dotenv
from engine import ShogiEngine
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
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
import pathlib
ENGINE_PATH = os.getenv("USI_ENGINE_PATH", "./engine/YaneuraOu.exe")
# Convert to absolute path
if not os.path.isabs(ENGINE_PATH):
    ENGINE_PATH = str(pathlib.Path(__file__).parent / ENGINE_PATH)
print(f"Engine path: {ENGINE_PATH}")
engine = ShogiEngine(ENGINE_PATH)
teacher = ClaudeTeacher()

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
    # We can lazily start the engine, or start here.
    # await engine.start()
    pass

@app.on_event("shutdown")
async def shutdown_event():
    await engine.stop()

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
        print(f"Analyzing position: {request.sfen}")
        analysis = await engine.analyze(request.sfen)
        print(f"Analysis complete: {analysis}")
        return analysis
    except FileNotFoundError as e:
        error_msg = f"Engine binary not found: {e}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
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

