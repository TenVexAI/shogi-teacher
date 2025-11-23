# Multi-Engine Teaching System - Implementation Specification

**Version:** 1.0  
**Date:** 2025-11-22  
**Status:** Design Phase

---

## Executive Summary

This document specifies the implementation of a three-engine teaching system for Shogi Teacher, where independent engines provide player moves, hints, and post-game analysis. The system integrates with an LLM tutor that synthesizes all available data to provide comprehensive learning experiences.

### Core Principle
**Settings-Agnostic Design**: The system must function correctly regardless of user-configured engine settings (MultiPV count, analysis time, ponder mode, etc.). The UI adapts to available data rather than requiring specific configurations.

---

## 1. Current Architecture Analysis

### 1.1 Existing Components

**Backend (`backend/main.py`)**:
- FastAPI server with CORS
- `EngineManager` instance managing three engine slots: `black`, `white`, `analysis`
- `ClaudeTeacher` for LLM integration
- Endpoints: `/game/state`, `/game/move`, `/analyze`, `/explain`, `/config`
- USI to algebraic notation conversion (`usi_to_standard_notation`)

**Engine Manager (`backend/engine_manager/engine_manager.py`)**:
- Current implementation:
  - `active_engines` dict with keys: `black`, `white`, `analysis`
  - `running_engines` dict storing `EngineProcess` instances
  - `discover_engines()` - finds available engines
  - `set_engine()` - hot-swap engines
  - `analyze_position()` - single analysis call
  - Preference save/load from JSON

**Frontend (`frontend/app/page.tsx`)**:
- Message interface with `messageType?: 'system' | 'llm' | 'engine-black' | 'engine-white'`
- `engineName?: string` field for attribution
- Basic hint functionality exists but needs enhancement

**Chat Interface (`frontend/components/ChatInterface.tsx`)**:
- Current styling:
  - `engine-black`: Black background, white text
  - `engine-white`: White background, black text
  - `llm`/`system`: Purple background, white text
  - `user`: Purple background (cyan suggested)
- Markdown rendering for assistant messages
- Hint button present

### 1.2 Gaps to Address

❌ **Hint button only shows generic analysis** - needs side-specific engine response  
❌ **No post-move analysis trigger** - Engine 3 never runs automatically  
❌ **Move records don't store dual notation** - only USI currently tracked  
❌ **No comprehensive LLM context building** - limited game state passed  
❌ **No reference materials system** - can't upload joseki guides  
❌ **No game mode modifiers** - LLM doesn't know context (casual/training/competitive)  
❌ **No MultiPV display** - even when engines provide alternatives  
❌ **No ponder move display** - opponent prediction not shown  
❌ **Single LLM provider** - hardcoded to Claude

---

## 2. Data Models

### 2.1 Enhanced Move Record

**Location**: `backend/main.py` (new model)

```python
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime

class MoveAnalysis(BaseModel):
    """Analysis from a specific engine"""
    engine_id: str
    engine_name: str
    bestmove: str           # USI format
    bestmove_algebraic: str  # P-7f format
    score_cp: Optional[int]
    mate: Optional[int]
    depth: int
    nodes: int
    nps: int
    pv: List[str]           # USI moves
    pv_algebraic: List[str] # Algebraic moves
    alternatives: List[Dict] = []  # If MultiPV > 1
    ponder_move: Optional[str] = None
    ponder_move_algebraic: Optional[str] = None
    timestamp: datetime

class MoveRecord(BaseModel):
    """Complete record of a move with all associated data"""
    move_number: int
    player: str  # "black" or "white"
    
    # Dual notation
    move_usi: str
    move_algebraic: str
    
    # Position tracking
    position_before: str  # SFEN
    position_after: str   # SFEN
    
    # Timing
    timestamp: datetime
    time_spent: float  # seconds
    
    # Engine analyses
    pre_move_hint: Optional[MoveAnalysis] = None    # If hint was requested
    post_move_analysis: Optional[MoveAnalysis] = None  # From Engine 3
    
    # Move quality (calculated from analysis)
    cp_loss: Optional[int] = None
    classification: Optional[str] = None  # "Excellent", "Good", "Inaccuracy", etc.
```

### 2.2 Game Session Model

```python
class GameSession(BaseModel):
    """Complete game state with history and configuration"""
    session_id: str
    created_at: datetime
    
    # Player configuration
    white_player: str  # "human" or engine_id
    black_player: str  # "human" or engine_id
    
    # Engine assignments
    white_engine: Optional[str] = None  # Engine ID for hints/play
    black_engine: Optional[str] = None  # Engine ID for hints/play
    analyst_engine: Optional[str] = None  # Engine 3
    analyst_enabled: bool = False
    
    # Game mode
    mode: str = "casual"  # "casual", "training", "competitive", "puzzle", "analysis"
    
    # Move history
    moves: List[MoveRecord] = []
    
    # User context
    user_notes: str = ""
    reference_files: List[Dict] = []  # [{name, description, content}]
    
    # Current state
    current_sfen: str
    is_active: bool = True
```

---

## 3. Engine Management Enhancements

### 3.1 Role-Specific Engine Activation

**Current**: Engines activated based on `side_to_move`  
**New**: Explicit role-based activation with resource management

```python
# In EngineManager

def request_hint(self, side: str, position: str, moves: List[str], 
                 movetime: int = 1000) -> Optional[Dict]:
    """
    Get hint from the engine assigned to this side.
    
    Args:
        side: "black" or "white"
        position: SFEN position
        moves: Move history
        movetime: Analysis time in ms
    
    Returns:
        Analysis dict with enhanced formatting
    """
    engine_id = self.active_engines.get(side)
    if not engine_id:
        return None
    
    # Start engine if not running
    if engine_id not in self.running_engines:
        self._start_engine(engine_id)
    
    process = self.running_engines[engine_id]
    
    # Analyze position
    analysis = self._analyze_with_process(process, position, moves, movetime)
    
    # Enhance with MultiPV and ponder if available
    return self._format_hint_response(analysis, process.usi_options)

def request_post_move_analysis(self, position: str, moves: List[str],
                                movetime: int = 3000) -> Optional[Dict]:
    """
    Get analysis from Engine 3 (analyst) after a move is made.
    
    Only runs if analyst is enabled.
    Returns None if disabled or no analyst assigned.
    """
    if not self.analysis_enabled:
        return None
    
    engine_id = self.active_engines.get("analysis")
    if not engine_id:
        return None
    
    # ... similar to request_hint but with analyst-specific settings
```

### 3.2 Concurrent Engine Safety

**Requirement**: Prevent Engine 1/2 and Engine 3 from running simultaneously on same CPU

```python
class EngineManager:
    def __init__(self, ...):
        # ...existing code...
        self.analysis_in_progress = threading.Event()
        self.player_analysis_lock = threading.Lock()
    
    def request_hint(self, side, position, moves, movetime):
        # Wait if analyst is running
        self.analysis_in_progress.wait()
        
        with self.player_analysis_lock:
            # ... perform analysis
    
    def request_post_move_analysis(self, ...):
        # Signal that analyst is working
        self.analysis_in_progress.clear()
        try:
            # ... perform analysis
        finally:
            self.analysis_in_progress.set()
```

### 3.3 Enhanced Analysis Response Format

```python
def _format_hint_response(self, analysis: Dict, usi_options: List) -> Dict:
    """
    Format analysis with all available enhancements.
    
    Includes:
    - Algebraic notation conversion
    - MultiPV alternatives (if engine supports)
    - Ponder move prediction
    - Search statistics
    """
    result = {
        "engine_name": analysis["engine_name"],
        "bestmove": analysis["bestmove"],
        "bestmove_algebraic": self._to_algebraic(analysis["bestmove"]),
        "score_cp": analysis.get("score_cp"),
        "mate": analysis.get("mate"),
        "depth": analysis.get("depth"),
        "nodes": analysis.get("nodes"),
        "pv": analysis.get("pv", []),
        "pv_algebraic": [self._to_algebraic(m) for m in analysis.get("pv", [])[:5]],
    }
    
    # Add ponder if available
    if analysis.get("ponder"):
        result["ponder_move"] = analysis["ponder"]
        result["ponder_move_algebraic"] = self._to_algebraic(analysis["ponder"])
    
    # Add alternatives if MultiPV was used
    if "alternatives" in analysis:
        result["alternatives"] = [
            {
                "move": alt["move"],
                "move_algebraic": self._to_algebraic(alt["move"]),
                "score_cp": alt.get("score_cp"),
                "mate": alt.get("mate"),
                "pv": alt.get("pv", [])[:3],
                "cp_diff": alt.get("score_cp", 0) - result.get("score_cp", 0) if alt.get("score_cp") and result.get("score_cp") else None
            }
            for alt in analysis["alternatives"][:5]  # Top 5
        ]
    
    return result
```

---

## 4. Backend API Enhancements

### 4.1 New Endpoints

**POST `/hint`** - Get side-specific hint
```python
class HintRequest(BaseModel):
    sfen: str
    side: str  # "black" or "white"

@app.post("/hint")
async def get_hint(request: HintRequest):
    """Get hint from the engine assigned to the specified side"""
    parts = request.sfen.split(" moves ")
    position = parts[0]
    moves = parts[1].split() if len(parts) > 1 else []
    
    hint = engine_manager.request_hint(
        side=request.side,
        position=position,
        moves=moves,
        movetime=1000
    )
    
    if not hint:
        raise HTTPException(status_code=404, 
            detail=f"No engine assigned to {request.side}")
    
    return hint
```

**POST `/analyze-move`** - Trigger post-move analysis
```python
class AnalyzeMoveRequest(BaseModel):
    sfen: str  # Position after move
    background: bool = True  # Run in background

@app.post("/analyze-move")
async def analyze_move(request: AnalyzeMoveRequest, background_tasks: BackgroundTasks):
    """Trigger Engine 3 analysis after a move"""
    parts = request.sfen.split(" moves ")
    position = parts[0]
    moves = parts[1].split() if len(parts) > 1 else []
    
    if request.background:
        # Run async, return immediately
        background_tasks.add_task(
            engine_manager.request_post_move_analysis,
            position, moves, movetime=3000
        )
        return {"status": "analysis_started"}
    else:
        # Block until complete
        analysis = engine_manager.request_post_move_analysis(
            position, moves, movetime=3000
        )
        return analysis
```

**POST `/llm/query`** - Enhanced LLM with full context
```python
class LLMQueryRequest(BaseModel):
    question: str
    game_context: Optional[Dict] = None  # GameSession data
    include_references: bool = True

@app.post("/llm/query")
async def query_llm(request: LLMQueryRequest):
    """Query LLM with comprehensive context"""
    context = build_llm_context(
        question=request.question,
        game_session=request.game_context,
        include_references=request.include_references
    )
    
    response = await teacher.query_with_context(context)
    return {"response": response}
```

---

_(Continued in Part 2 - see questions below)_

---

## CLARIFYING QUESTIONS

### Architecture & Scope

**Q1**: Should we maintain game sessions in **backend memory** (FastAPI state) or use a **database** (SQLite/PostgreSQL)?  
- Memory: Simpler, but loses data on restart
- Database: Persistent, supports multiple users, more complex
A1: Database (whichever is good for this project assuming we are building it into a windows app), allow users to save a game session and resume it later as well

**Q2**: For the "hint button", should it:
- **A**: Always use the engine assigned to current player's side
- **B**: Let user choose which engine to query (dropdown selector)
- **C**: Show hints from BOTH engines side-by-side for comparison
A2: A, only from the engine assigned to the current player's side

**Q3**: **When should Engine 3 (analyst) run?**
- After every move automatically (if enabled)
- Only when user asks LLM a question about that position
- User-triggered via "Analyze" button
- All of the above with a toggle
A3: All of the above.

### UI/UX Details

**Q4**: **User message styling** - The reference doc suggests cyan for user messages. Should we:
- Change user messages from purple to cyan
- Keep purple but make it more cyan-tinted
- Use cyan bubble with different shape/position
A4: Change user messages from purple to cyan

**Q5**: **Hint message format** - Should we display:
- Just the recommended move with score
- Full analysis with alternatives (if MultiPV > 1)
- Tiered display: brief by default, "Show details" to expand
A5: Tiered display: brief by default, "Show details" to expand

**Q6**: **LLM vs System messages** - Currently both use purple. Should we:
- Keep them the same
- Make LLM gradient (purple→cyan) and system solid purple
- Different styling entirely
A6: Make LLM gradient (purple→cyan) and system solid purple

### Move History & Storage

**Q7**: **Move record storage** - Should move history be:
- Sent with every LLM query (simple, but token-heavy)
- Stored backend-side and referenced by session ID
- Hybrid: last N moves sent, full history on request
A7: sent with every LLM query

**Q8**: **Algebraic notation** - For move display, should we support:
- Western: P-7f, S-6h, Bx3c+
- Japanese: ☗7六歩, ☖3四歩
- Both with user preference toggle
- Currently you have `useWesternNotation` preference - is this the plan?
A8: Both with user preference toggle

### Reference Materials

**Q9**: **File upload** - Should reference materials be:
- Per-session (uploaded for this game only)
- Global (uploaded once, available for all games)
- Both with user choice
A9: Global (uploaded once, available to toggle on from then all for all sessions)

**Q10**: **File types** - Priority support:
- .txt and .md only (simple)
- Add .pdf with text extraction
- Add .sgf (shogi game format) parsing
- All of the above
A10: All of the above

### Engine Behavior

**Q11**: **Engine 3 analysis time** - Should this be:
- Fixed (e.g., always 3000ms)
- User-configurable per session
- Adaptive based on position complexity
A11: The user already sets this in the Engine Management settings, use those settings

**Q12**: **MultiPV handling** - If user has MultiPV=1 (no alternatives):
- Show single move only, no "alternatives" section
- Always request MultiPV=3 from Engine 3 regardless of user setting
- Respect user setting completely
A12: Respect user setting completely, if there are alternatives show them, if not show only the best move

### LLM Integration

**Q13**: **Multi-provider support** - Priority order:
- Claude only (current)
- Add OpenAI next
- Add Gemini next
- All three simultaneously with one PR
A13: Claude only

**Q14**: **Game mode detection** - Should mode be:
- Explicitly set by user before game starts
- Auto-detected from game setup (human vs engine, etc.)
- Switchable mid-game
A14: Auto-detected from game setup

**Q15**: **Context limits** - For long games (50+ moves):
- Include full history (may hit token limits)
- Summarize early game, detail recent moves
- Let LLM request specific move ranges
A15: Include full history

### Technical Implementation

**Q16**: **Backwards compatibility** - Should the new system:
- Completely replace current analysis flow
- Run parallel with graceful fallback
- Phased rollout (engine management first, then UI, then LLM)
A16: Completely replace current analysis flow

**Q17**: **Testing approach** - Priority:
- Unit tests for new models/functions
- Integration tests for full flow
- Manual testing only initially
- Test-driven development
A17: Manual testing only initially

**Q18**: **Performance** - For Engine 3 background analysis:
- Simple threading (BackgroundTasks)
- Task queue (Celery/RQ)
- Just async/await
A18: Just async/await

**Q19**: **Frontend state management** - Move history should live:
- React component state (current approach)
- Context API
- Zustand/Redux
- Backend authoritative, frontend mirrors
A19: Backend authoritative, frontend mirrors

**Q20**: **Error handling** - If Engine 3 is enabled but not responding:
- Fail silently, continue without analysis
- Show warning, let user disable
- Retry with timeout
- All of the above depending on error type
A20: Show warning, let user disable

---

## Implementation Priority

Based on your answers, I'll propose:
1. **Phase 1**: Core engine management (hints, post-move analysis)
2. **Phase 2**: Enhanced move records and storage
3. **Phase 3**: LLM context building
4. **Phase 4**: UI enhancements (message styling, MultiPV display)
5. **Phase 5**: Reference materials and advanced features

Does this phasing make sense, or would you prefer a different order?
