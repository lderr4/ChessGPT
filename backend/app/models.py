from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text, Boolean, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    chess_com_username = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_import_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Current rating (updated from most recent game)
    current_rating = Column(Integer, nullable=True)
    
    # Relationships
    games = relationship("Game", back_populates="user", cascade="all, delete-orphan")
    stats = relationship("UserStats", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Game(Base):
    __tablename__ = "games"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Game metadata
    chess_com_url = Column(String, nullable=True)
    chess_com_id = Column(String, unique=True, index=True, nullable=True)
    pgn = Column(Text, nullable=False)
    
    # Players
    white_player = Column(String, nullable=False)
    black_player = Column(String, nullable=False)
    white_elo = Column(Integer, nullable=True)
    black_elo = Column(Integer, nullable=True)
    user_color = Column(String, nullable=False)  # 'white' or 'black'
    user_rating = Column(Integer, nullable=True)  # User's rating in this game
    
    # Game result
    result = Column(String, nullable=False)  # 'win', 'loss', 'draw'
    termination = Column(String, nullable=True)  # 'checkmate', 'resignation', 'timeout', etc.
    
    # Time control
    time_class = Column(String, nullable=True)  # 'bullet', 'blitz', 'rapid', 'daily'
    time_control = Column(String, nullable=True)  # e.g., "600+0"
    
    # Opening
    opening_eco = Column(String, nullable=True, index=True)
    opening_name = Column(String, nullable=True)
    opening_ply = Column(Integer, nullable=True)  # How many moves into opening
    
    # Analysis
    is_analyzed = Column(Boolean, default=False)  # Deprecated, use analysis_state instead
    analysis_state = Column(String, default="unanalyzed", nullable=False)  # 'unanalyzed', 'in_progress', 'analyzed'
    average_centipawn_loss = Column(Float, nullable=True)
    accuracy = Column(Float, nullable=True)
    num_moves = Column(Integer, nullable=True)
    num_blunders = Column(Integer, default=0)
    num_mistakes = Column(Integer, default=0)
    num_inaccuracies = Column(Integer, default=0)
    
    # Dates
    date_played = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    analyzed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="games")
    moves = relationship("Move", back_populates="game", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_games_user_date', 'user_id', 'date_played'),
        Index('ix_games_user_opening', 'user_id', 'opening_eco'),
    )


class Move(Base):
    __tablename__ = "moves"
    
    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    
    # Move details
    move_number = Column(Integer, nullable=False)  # Full move number
    is_white = Column(Boolean, nullable=False)  # True if white's move
    half_move = Column(Integer, nullable=False)  # Half-move ply
    
    move_san = Column(String, nullable=False)  # Standard Algebraic Notation
    move_uci = Column(String, nullable=False)  # UCI notation
    
    # Analysis
    evaluation_before = Column(Float, nullable=True)  # In centipawns
    evaluation_after = Column(Float, nullable=True)  # In centipawns
    best_move_uci = Column(String, nullable=True)
    
    # Classification
    classification = Column(String, nullable=True)  # 'book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'
    centipawn_loss = Column(Float, nullable=True)
    
    # AI Coach Commentary
    coach_commentary = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    game = relationship("Game", back_populates="moves")
    
    __table_args__ = (
        Index('ix_moves_game_halfmove', 'game_id', 'half_move'),
    )


class Opening(Base):
    __tablename__ = "openings"
    
    id = Column(Integer, primary_key=True, index=True)
    eco_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    moves = Column(String, nullable=False)  # UCI moves space-separated
    pgn_moves = Column(String, nullable=False)  # PGN format
    ply = Column(Integer, nullable=False)  # Number of half-moves
    
    created_at = Column(DateTime, default=datetime.utcnow)


class UserStats(Base):
    __tablename__ = "user_stats"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # Overall stats
    total_games = Column(Integer, default=0)
    total_wins = Column(Integer, default=0)
    total_losses = Column(Integer, default=0)
    total_draws = Column(Integer, default=0)
    
    # By color
    white_games = Column(Integer, default=0)
    white_wins = Column(Integer, default=0)
    black_games = Column(Integer, default=0)
    black_wins = Column(Integer, default=0)
    
    # Analysis stats
    avg_accuracy = Column(Float, nullable=True)
    avg_centipawn_loss = Column(Float, nullable=True)
    total_blunders = Column(Integer, default=0)
    total_mistakes = Column(Integer, default=0)
    total_inaccuracies = Column(Integer, default=0)
    
    # Peak rating (if we track it)
    peak_rating = Column(Integer, nullable=True)
    current_rating = Column(Integer, nullable=True)
    
    # Last updated
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="stats")


class ImportJob(Base):
    __tablename__ = "import_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Job status
    status = Column(String, default="pending")  # pending, processing, completed, failed
    progress = Column(Integer, default=0)  # 0-100
    total_games = Column(Integer, default=0)
    imported_games = Column(Integer, default=0)
    
    # Error info
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User")


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Job status
    status = Column(String, default="pending")  # pending, processing, completed, failed
    progress = Column(Integer, default=0)  # 0-100
    total_games = Column(Integer, default=0)
    analyzed_games = Column(Integer, default=0)
    
    # Error info
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User")

