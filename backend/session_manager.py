"""
Game Session Manager

Handles game session lifecycle, move recording, and state management.
"""

import uuid
import shogi
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from database import GameSessionDB, MoveRecordDB, SessionLocal
from models import GameSession, GameSessionCreate, MoveRecord, MoveAnalysis


class SessionManager:
    """Manages game sessions and move history"""
    
    def __init__(self):
        """Initialize session manager"""
        pass
    
    def create_session(self, request: GameSessionCreate) -> GameSession:
        """
        Create a new game session.
        
        Args:
            request: Session creation parameters
            
        Returns:
            Created game session
        """
        db = SessionLocal()
        try:
            # Generate unique session ID
            session_id = str(uuid.uuid4())
            
            # Determine starting position
            if request.starting_sfen:
                starting_sfen = request.starting_sfen
            else:
                board = shogi.Board()
                starting_sfen = board.sfen()
            
            # Auto-detect game mode
            mode = self._detect_game_mode(
                request.white_player,
                request.black_player,
                request.analyst_enabled
            )
            
            # Create database record
            db_session = GameSessionDB(
                session_id=session_id,
                white_player=request.white_player,
                black_player=request.black_player,
                white_engine=request.white_engine,
                black_engine=request.black_engine,
                analyst_engine=request.analyst_engine,
                analyst_enabled=request.analyst_enabled,
                analyst_movetime=request.analyst_movetime,
                mode=mode,
                current_sfen=starting_sfen,
                user_notes=request.user_notes
            )
            
            db.add(db_session)
            db.commit()
            db.refresh(db_session)
            
            # Convert to Pydantic model
            return self._db_to_pydantic(db_session)
            
        finally:
            db.close()
    
    def get_session(self, session_id: str) -> Optional[GameSession]:
        """Get a game session by ID"""
        db = SessionLocal()
        try:
            db_session = db.query(GameSessionDB).filter(
                GameSessionDB.session_id == session_id
            ).first()
            
            if not db_session:
                return None
            
            return self._db_to_pydantic(db_session)
            
        finally:
            db.close()
    
    def list_sessions(self, active_only: bool = True, limit: int = 50) -> List[GameSession]:
        """List game sessions"""
        db = SessionLocal()
        try:
            query = db.query(GameSessionDB)
            
            if active_only:
                query = query.filter(GameSessionDB.is_active == True)
            
            query = query.order_by(GameSessionDB.updated_at.desc()).limit(limit)
            
            sessions = query.all()
            return [self._db_to_pydantic(s) for s in sessions]
            
        finally:
            db.close()
    
    def update_session(self, session_id: str, **kwargs) -> Optional[GameSession]:
        """Update session settings"""
        db = SessionLocal()
        try:
            db_session = db.query(GameSessionDB).filter(
                GameSessionDB.session_id == session_id
            ).first()
            
            if not db_session:
                return None
            
            # Update fields
            for key, value in kwargs.items():
                if value is not None and hasattr(db_session, key):
                    setattr(db_session, key, value)
            
            db_session.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_session)
            
            return self._db_to_pydantic(db_session)
            
        finally:
            db.close()
    
    def add_move(self, session_id: str, move_usi: str, move_algebraic: str,
                 position_before: str, position_after: str, player: str,
                 time_spent: float = 0.0, pre_move_hint: Optional[Dict] = None) -> MoveRecord:
        """
        Add a move to the session.
        
        Args:
            session_id: Session ID
            move_usi: Move in USI format
            move_algebraic: Move in algebraic notation
            position_before: SFEN before move
            position_after: SFEN after move
            player: "black" or "white"
            time_spent: Time spent on move in seconds
            pre_move_hint: Hint analysis if requested before move
            
        Returns:
            Created move record
        """
        db = SessionLocal()
        try:
            # Get session
            db_session = db.query(GameSessionDB).filter(
                GameSessionDB.session_id == session_id
            ).first()
            
            if not db_session:
                raise ValueError(f"Session not found: {session_id}")
            
            # Get current move number by querying database directly (not using relationship)
            # This avoids SQLAlchemy caching issues after deletes
            move_count = db.query(MoveRecordDB).filter(
                MoveRecordDB.session_id == session_id
            ).count()
            move_number = move_count + 1
            
            # Create move record
            db_move = MoveRecordDB(
                session_id=session_id,
                move_number=move_number,
                player=player,
                move_usi=move_usi,
                move_algebraic=move_algebraic,
                position_before=position_before,
                position_after=position_after,
                time_spent=time_spent,
                pre_move_hint=pre_move_hint
            )
            
            db.add(db_move)
            
            # Update session current position
            db_session.current_sfen = position_after
            db_session.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(db_move)
            
            return self._move_db_to_pydantic(db_move)
            
        finally:
            db.close()
    
    def add_post_move_analysis(self, session_id: str, move_number: int,
                               analysis: Dict) -> Optional[MoveRecord]:
        """
        Add post-move analysis (from Engine 3) to a move.
        
        Args:
            session_id: Session ID
            move_number: Move number to update
            analysis: Analysis dictionary
            
        Returns:
            Updated move record
        """
        db = SessionLocal()
        try:
            db_move = db.query(MoveRecordDB).filter(
                MoveRecordDB.session_id == session_id,
                MoveRecordDB.move_number == move_number
            ).first()
            
            if not db_move:
                return None
            
            # Store analysis
            db_move.post_move_analysis = analysis
            
            # Calculate move quality if we have both pre and post analysis
            if db_move.pre_move_hint and analysis:
                db_move.cp_loss, db_move.classification = self._calculate_move_quality(
                    db_move.pre_move_hint,
                    analysis
                )
            
            db.commit()
            db.refresh(db_move)
            
            return self._move_db_to_pydantic(db_move)
            
        finally:
            db.close()
    
    def get_moves(self, session_id: str, start: int = 0, limit: int = None) -> List[MoveRecord]:
        """Get moves for a session"""
        db = SessionLocal()
        try:
            query = db.query(MoveRecordDB).filter(
                MoveRecordDB.session_id == session_id
            ).order_by(MoveRecordDB.move_number)
            
            if start > 0:
                query = query.offset(start)
            
            if limit:
                query = query.limit(limit)
            
            moves = query.all()
            return [self._move_db_to_pydantic(m) for m in moves]
            
        finally:
            db.close()
    
    def _detect_game_mode(self, white_player: str, black_player: str,
                         analyst_enabled: bool) -> str:
        """
        Auto-detect game mode based on setup.
        
        Returns: "casual", "training", "competitive", "analysis"
        """
        is_human_vs_human = white_player == "human" and black_player == "human"
        is_human_vs_engine = (white_player == "human") != (black_player == "human")
        is_engine_vs_engine = white_player != "human" and black_player != "human"
        
        if is_engine_vs_engine:
            return "analysis"  # Watching engines play
        elif analyst_enabled and is_human_vs_engine:
            return "training"  # Learning with analysis
        elif is_human_vs_engine:
            return "competitive"  # Playing seriously
        else:
            return "casual"  # Human vs human, no analysis
    
    def _calculate_move_quality(self, hint_analysis: Dict, 
                                post_analysis: Dict) -> tuple[Optional[int], Optional[str]]:
        """
        Calculate move quality by comparing hint and post-move analysis.
        
        Returns:
            (cp_loss, classification)
        """
        # Get scores
        hint_cp = hint_analysis.get('score_cp')
        post_cp = post_analysis.get('score_cp')
        
        if hint_cp is None or post_cp is None:
            return None, None
        
        # Calculate CP loss (from player's perspective)
        # Post-analysis is opponent's perspective, so negate it
        cp_loss = hint_cp - (-post_cp)
        
        # Classify move
        if cp_loss <= 10:
            classification = "Excellent"
        elif cp_loss <= 30:
            classification = "Good"
        elif cp_loss <= 70:
            classification = "Inaccuracy"
        elif cp_loss <= 150:
            classification = "Mistake"
        else:
            classification = "Blunder"
        
        return cp_loss, classification
    
    def _db_to_pydantic(self, db_session: GameSessionDB) -> GameSession:
        """Convert database model to Pydantic model"""
        moves = [self._move_db_to_pydantic(m) for m in db_session.moves]
        
        # Get reference files (simplified for now)
        reference_files = []
        for link in db_session.reference_links:
            if link.enabled:
                reference_files.append({
                    "id": link.reference_id,
                    "name": link.reference.name,
                    "description": link.reference.description
                })
        
        return GameSession(
            session_id=db_session.session_id,
            created_at=db_session.created_at,
            updated_at=db_session.updated_at,
            white_player=db_session.white_player,
            black_player=db_session.black_player,
            white_engine=db_session.white_engine,
            black_engine=db_session.black_engine,
            analyst_engine=db_session.analyst_engine,
            analyst_enabled=db_session.analyst_enabled,
            analyst_movetime=db_session.analyst_movetime,
            mode=db_session.mode,
            moves=moves,
            user_notes=db_session.user_notes,
            reference_files=reference_files,
            current_sfen=db_session.current_sfen,
            is_active=db_session.is_active
        )
    
    def _move_db_to_pydantic(self, db_move: MoveRecordDB) -> MoveRecord:
        """Convert database move to Pydantic model"""
        # Convert JSON analyses to MoveAnalysis if present
        pre_hint = None
        if db_move.pre_move_hint:
            pre_hint = MoveAnalysis(**db_move.pre_move_hint)
        
        post_analysis = None
        if db_move.post_move_analysis:
            post_analysis = MoveAnalysis(**db_move.post_move_analysis)
        
        return MoveRecord(
            move_number=db_move.move_number,
            player=db_move.player,
            move_usi=db_move.move_usi,
            move_algebraic=db_move.move_algebraic,
            position_before=db_move.position_before,
            position_after=db_move.position_after,
            timestamp=db_move.timestamp,
            time_spent=db_move.time_spent,
            pre_move_hint=pre_hint,
            post_move_analysis=post_analysis,
            cp_loss=db_move.cp_loss,
            classification=db_move.classification
        )
