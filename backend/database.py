"""
Database models and session management for Shogi Teacher.

Uses SQLite for persistence with SQLAlchemy ORM.
"""

from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from pathlib import Path

# Database file location
DB_PATH = Path(__file__).parent / "shogi_teacher.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=False  # Set to True for SQL debugging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


class GameSessionDB(Base):
    """Game session stored in database"""
    __tablename__ = "game_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Player configuration
    white_player = Column(String, nullable=False)  # "human" or engine_id
    black_player = Column(String, nullable=False)  # "human" or engine_id
    
    # Player names (display names)
    white_name = Column(String, default="Guest")
    black_name = Column(String, default="Guest")
    
    # Engine assignments
    white_engine = Column(String, nullable=True)  # Engine ID for hints/play
    black_engine = Column(String, nullable=True)  # Engine ID for hints/play
    analyst_engine = Column(String, nullable=True)  # Engine 3
    analyst_enabled = Column(Boolean, default=False)
    analyst_movetime = Column(Integer, default=3000)  # ms
    
    # Game mode
    mode = Column(String, default="human_vs_human")  # human_vs_human, human_vs_computer, computer_vs_computer
    
    # Computer vs Computer control
    is_paused = Column(Boolean, default=False)
    
    # Current state
    current_sfen = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    
    # User context
    user_notes = Column(Text, default="")
    
    # Relationships
    moves = relationship("MoveRecordDB", back_populates="session", cascade="all, delete-orphan", order_by="MoveRecordDB.move_number")
    reference_links = relationship("SessionReferenceDB", back_populates="session", cascade="all, delete-orphan")


class MoveRecordDB(Base):
    """Individual move record with analyses"""
    __tablename__ = "move_records"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("game_sessions.session_id"), nullable=False)
    
    move_number = Column(Integer, nullable=False)
    player = Column(String, nullable=False)  # "black" or "white"
    
    # Dual notation
    move_usi = Column(String, nullable=False)
    move_algebraic = Column(String, nullable=False)
    
    # Position tracking
    position_before = Column(Text, nullable=False)  # SFEN
    position_after = Column(Text, nullable=False)   # SFEN
    
    # Timing
    timestamp = Column(DateTime, default=datetime.utcnow)
    time_spent = Column(Float, default=0.0)  # seconds
    
    # Engine analyses (stored as JSON)
    pre_move_hint = Column(JSON, nullable=True)
    post_move_analysis = Column(JSON, nullable=True)
    
    # Move quality
    cp_loss = Column(Integer, nullable=True)
    classification = Column(String, nullable=True)  # "Excellent", "Good", "Inaccuracy", etc.
    
    # Relationships
    session = relationship("GameSessionDB", back_populates="moves")


class ReferenceFileDB(Base):
    """Global reference file (joseki guides, etc.)"""
    __tablename__ = "reference_files"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, default="")
    file_type = Column(String, nullable=False)  # txt, md, pdf, sgf
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    file_size = Column(Integer, default=0)  # bytes
    
    # Relationships
    sessions = relationship("SessionReferenceDB", back_populates="reference")


class SessionReferenceDB(Base):
    """Link between game sessions and reference files"""
    __tablename__ = "session_references"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("game_sessions.session_id"), nullable=False)
    reference_id = Column(Integer, ForeignKey("reference_files.id"), nullable=False)
    enabled = Column(Boolean, default=True)  # Can toggle on/off per session
    
    # Relationships
    session = relationship("GameSessionDB", back_populates="reference_links")
    reference = relationship("ReferenceFileDB", back_populates="sessions")


def migrate_db():
    """Run database migrations to add new columns to existing tables"""
    import sqlite3
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get existing columns in game_sessions table
    cursor.execute("PRAGMA table_info(game_sessions)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    
    # Migrations for game_sessions table
    migrations = [
        ("white_name", "ALTER TABLE game_sessions ADD COLUMN white_name TEXT DEFAULT 'Guest'"),
        ("black_name", "ALTER TABLE game_sessions ADD COLUMN black_name TEXT DEFAULT 'Guest'"),
        ("is_paused", "ALTER TABLE game_sessions ADD COLUMN is_paused INTEGER DEFAULT 0"),
    ]
    
    for column_name, sql in migrations:
        if column_name not in existing_columns:
            try:
                cursor.execute(sql)
                print(f"  ✓ Added column: {column_name}")
            except sqlite3.OperationalError as e:
                print(f"  ! Migration skipped for {column_name}: {e}")
    
    conn.commit()
    conn.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    
    # Run migrations for existing databases
    if DB_PATH.exists():
        migrate_db()
    
    print(f"✓ Database initialized: {DB_PATH}")


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    # Initialize database when run directly
    init_db()
    print("\n✓ Database tables created successfully")
