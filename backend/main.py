from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import shogi
from dotenv import load_dotenv
from engine import ShogiEngine
from llm import GeminiTeacher

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
teacher = GeminiTeacher()

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

class AnalysisRequest(BaseModel):
    sfen: str

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
        board.push(move)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid move format")
        
    return _build_game_state(board)

@app.post("/analyze")
async def analyze_position(request: AnalysisRequest):
    try:
        analysis = await engine.analyze(request.sfen)
        return analysis
    except FileNotFoundError:
         raise HTTPException(status_code=500, detail="Engine binary not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/explain")
async def explain_position(sfen: str, analysis: Dict[str, Any]):
    explanation = await teacher.explain(sfen, analysis)
    return {"explanation": explanation}

def _build_game_state(board: shogi.Board) -> GameState:
    return GameState(
        sfen=board.sfen(),
        turn="b" if board.turn == shogi.BLACK else "w",
        legal_moves=[m.usi() for m in board.legal_moves],
        in_check=board.is_check(),
        is_game_over=board.is_game_over(),
        winner="b" if board.turn == shogi.WHITE else "w" if board.is_game_over() else None # Simplified winner logic
    )

