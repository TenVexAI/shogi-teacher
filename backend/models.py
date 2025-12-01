"""
Pydantic models for API requests and responses.

These models handle validation and serialization for the REST API.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from enum import Enum


# ===== Enums =====

class GameMode(str, Enum):
    """Game mode types"""
    HUMAN_VS_HUMAN = "human_vs_human"
    HUMAN_VS_COMPUTER = "human_vs_computer"
    COMPUTER_VS_COMPUTER = "computer_vs_computer"
    CASUAL = "casual"  # Legacy mode, treated as human_vs_human


# ===== Analysis Models =====

class MoveAnalysis(BaseModel):
    """Analysis from a specific engine"""
    engine_id: str
    engine_name: str
    bestmove: str  # USI format
    bestmove_algebraic: str  # P-7f format
    score_cp: Optional[int] = None
    mate: Optional[int] = None
    depth: int = 0
    nodes: int = 0
    nps: int = 0
    pv: List[str] = []  # USI moves
    pv_algebraic: List[str] = []  # Algebraic moves
    alternatives: List[Dict[str, Any]] = []  # If MultiPV > 1
    ponder_move: Optional[str] = None
    ponder_move_algebraic: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_schema_extra = {
            "example": {
                "engine_id": "yaneuraou",
                "engine_name": "YaneuraOu NNUE",
                "bestmove": "7g7f",
                "bestmove_algebraic": "P-7f",
                "score_cp": 45,
                "depth": 18,
                "nodes": 2100000,
                "pv": ["7g7f", "3c3d", "2g2f"],
                "pv_algebraic": ["P-7f", "P-3d", "P-2f"],
                "alternatives": [
                    {"move": "2g2f", "move_algebraic": "P-2f", "score_cp": 42, "cp_diff": -3}
                ]
            }
        }


class MoveRecord(BaseModel):
    """Complete record of a move with all associated data"""
    move_number: int
    player: str  # "black" or "white"
    
    # Dual notation
    move_usi: str
    move_algebraic: str
    
    # Position tracking
    position_before: str  # SFEN
    position_after: str  # SFEN
    
    # Timing
    timestamp: datetime
    time_spent: float = 0.0  # seconds
    
    # Engine analyses
    pre_move_hint: Optional[MoveAnalysis] = None
    post_move_analysis: Optional[MoveAnalysis] = None
    
    # Move quality
    cp_loss: Optional[int] = None
    classification: Optional[str] = None  # "Excellent", "Good", "Inaccuracy", etc.
    
    class Config:
        from_attributes = True


# ===== Game Session Models =====

class GameSession(BaseModel):
    """Complete game state with history and configuration"""
    session_id: str
    created_at: datetime
    updated_at: datetime
    
    # Player configuration
    white_player: str  # "human" or engine_id
    black_player: str  # "human" or engine_id
    
    # Player names (display names)
    white_name: str = "Guest"
    black_name: str = "Guest"
    
    # Engine assignments
    white_engine: Optional[str] = None
    black_engine: Optional[str] = None
    analyst_engine: Optional[str] = None
    analyst_enabled: bool = False
    analyst_movetime: int = 3000  # ms
    
    # Game mode
    mode: str = "casual"
    
    # Computer vs Computer control
    is_paused: bool = False
    
    # Move history
    moves: List[MoveRecord] = []
    
    # User context
    user_notes: str = ""
    reference_files: List[Dict[str, Any]] = []
    
    # Current state
    current_sfen: str
    is_active: bool = True
    
    class Config:
        from_attributes = True


class GameSessionCreate(BaseModel):
    """Request to create a new game session"""
    # Game mode
    game_mode: str = "human_vs_human"  # human_vs_human, human_vs_computer, computer_vs_computer
    
    # Player configuration
    white_player: str = "human"  # "human" or engine_id
    black_player: str = "human"  # "human" or engine_id
    
    # Player names
    white_name: Optional[str] = None  # None = use default (Guest or engine name)
    black_name: Optional[str] = None  # None = use default (Guest or engine name)
    
    # Engine assignments
    white_engine: Optional[str] = None
    black_engine: Optional[str] = None
    analyst_engine: Optional[str] = None
    analyst_enabled: bool = False
    analyst_movetime: int = 3000
    user_notes: str = ""
    starting_sfen: Optional[str] = None  # None = use default starting position


class GameSessionUpdate(BaseModel):
    """Request to update game session settings"""
    white_engine: Optional[str] = None
    black_engine: Optional[str] = None
    analyst_engine: Optional[str] = None
    analyst_enabled: Optional[bool] = None
    analyst_movetime: Optional[int] = None
    user_notes: Optional[str] = None
    is_active: Optional[bool] = None
    current_sfen: Optional[str] = None  # Allow updating current position
    
    # Player names (editable anytime)
    white_name: Optional[str] = None
    black_name: Optional[str] = None
    
    # Game mode settings (can be changed mid-game)
    mode: Optional[str] = None  # 'human_vs_human', 'human_vs_computer', 'computer_vs_computer'
    black_player: Optional[str] = None  # 'human' or engine id
    white_player: Optional[str] = None  # 'human' or engine id
    
    # Computer vs Computer control
    is_paused: Optional[bool] = None


# ===== Move Models =====

class MoveRequest(BaseModel):
    """Request to make a move"""
    move_usi: str
    time_spent: float = 0.0


class MoveResponse(BaseModel):
    """Response after making a move"""
    success: bool
    move_record: MoveRecord
    new_sfen: str
    analysis_started: bool = False  # If Engine 3 is analyzing in background


# ===== Hint Models =====

class HintRequest(BaseModel):
    """Request for a hint"""
    session_id: str
    side: Optional[str] = None  # "black" or "white", auto-detect if None


class HintResponse(BaseModel):
    """Response with hint data"""
    analysis: MoveAnalysis
    side: str
    expandable: bool = False  # True if alternatives available
    
    class Config:
        json_schema_extra = {
            "example": {
                "analysis": {
                    "engine_name": "YaneuraOu NNUE",
                    "bestmove_algebraic": "P-7f",
                    "score_cp": 45
                },
                "side": "white",
                "expandable": True
            }
        }


# ===== Analysis Models =====

class AnalyzeRequest(BaseModel):
    """Request for position analysis (manual trigger)"""
    session_id: str
    background: bool = True


class AnalyzeResponse(BaseModel):
    """Response from analysis"""
    analysis: Optional[MoveAnalysis] = None
    status: str  # "complete", "started", "disabled", "error"
    message: Optional[str] = None


# ===== LLM Models =====

class LLMQuery(BaseModel):
    """Query to the LLM with game context"""
    session_id: str
    question: str
    include_references: bool = True


class LLMResponse(BaseModel):
    """Response from LLM"""
    response: str
    context_used: Dict[str, Any] = {}  # Metadata about what context was included


# ===== Reference File Models =====

class ReferenceFileCreate(BaseModel):
    """Request to create/upload a reference file"""
    name: str
    description: str = ""
    file_type: str  # txt, md, pdf, sgf
    content: str


class ReferenceFile(BaseModel):
    """Reference file data"""
    id: int
    name: str
    description: str
    file_type: str
    content: str
    created_at: datetime
    file_size: int
    
    class Config:
        from_attributes = True


class SessionReferenceToggle(BaseModel):
    """Toggle reference file for a session"""
    session_id: str
    reference_id: int
    enabled: bool


# ===== Game Import/Export Models =====

class GameImportRequest(BaseModel):
    """Request to import a game from file content"""
    content: str  # File content as string
    format: Optional[str] = None  # 'kif', 'csa', 'ki2', 'psn' or None to auto-detect
    white_name: Optional[str] = None  # Override player name
    black_name: Optional[str] = None  # Override player name
    game_mode: str = "human_vs_human"  # Game mode to use


class GameImportResponse(BaseModel):
    """Response from game import"""
    success: bool
    session_id: Optional[str] = None
    message: str
    move_count: int = 0
    detected_format: Optional[str] = None


class GameExportRequest(BaseModel):
    """Request to export a game"""
    session_id: str
    format: str  # 'kif', 'csa', 'ki2', 'psn'
    white_name: Optional[str] = None  # Override player name
    black_name: Optional[str] = None  # Override player name
    event_name: Optional[str] = None  # Custom event name
    filename: Optional[str] = None  # Custom filename (without extension)


class GameExportResponse(BaseModel):
    """Response from game export"""
    success: bool
    content: str = ""
    filename: str = ""
    format: str = ""
    message: str = ""


# ===== Computer Move Models =====

class ComputerMoveRequest(BaseModel):
    """Request for computer to make a move"""
    session_id: str
    movetime: int = 3000  # Time in ms for engine to think


class ComputerMoveResponse(BaseModel):
    """Response from computer move"""
    success: bool
    move_usi: Optional[str] = None
    move_algebraic: Optional[str] = None
    new_sfen: Optional[str] = None
    is_game_over: bool = False
    winner: Optional[str] = None
    engine_name: Optional[str] = None
    thinking_time: float = 0.0
    message: str = ""


# ===== Image Analysis Models =====

class ImageAnalysisRequest(BaseModel):
    """Request to analyze a shogi board image"""
    image: str  # Base64 encoded image data (data URL format)


class ImageAnalysisResponse(BaseModel):
    """Response from image analysis"""
    sfen: str
    confidence: Literal['high', 'medium', 'low']
    notes: Optional[str] = None
    valid: bool = True
    validation_error: Optional[str] = None


# ===== Puzzle Models =====

class PuzzleRequest(BaseModel):
    """Request for a random puzzle"""
    min_moves: int = 3  # Minimum moves to mate (3, 5, 7, 9, or 11)
    max_moves: int = 11  # Maximum moves to mate

class PuzzleResponse(BaseModel):
    """Response with a puzzle"""
    sfen: str
    moves_to_mate: int
    side_to_move: str  # 'b' for black, 'w' for white

class PuzzleVerifyRequest(BaseModel):
    """Request to verify a puzzle move"""
    sfen: str  # Current position SFEN
    move_usi: str  # Move to verify in USI format
    target_moves: int  # Original puzzle's moves to mate
    moves_made: int  # How many moves already made by the player

class PuzzleVerifyResponse(BaseModel):
    """Response from puzzle move verification"""
    is_correct: bool
    is_checkmate: bool = False
    is_puzzle_complete: bool = False
    message: str = ""
    best_move: Optional[str] = None  # USI format
    best_move_notation: Optional[str] = None
    opponent_move: Optional[str] = None  # Engine's response move (USI)
    opponent_move_notation: Optional[str] = None
    new_sfen: Optional[str] = None  # Position after opponent's move
