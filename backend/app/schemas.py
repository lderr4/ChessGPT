from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    chess_com_username: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: int
    chess_com_username: Optional[str]
    created_at: datetime
    last_import_at: Optional[datetime]
    current_rating: Optional[int]
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None


# Position Analysis Schemas
class PositionAnalysisRequest(BaseModel):
    fen: str


class PositionAnalysisResponse(BaseModel):
    fen: str
    evaluation: Optional[float]  # Centipawn evaluation
    best_move: Optional[str]  # UCI format
    best_move_san: Optional[str]  # SAN format
    mate_in: Optional[int]  # If it's a mate position


# Game Schemas
class MoveResponse(BaseModel):
    move_number: int
    is_white: bool
    move_san: str
    evaluation_before: Optional[float]
    evaluation_after: Optional[float]
    classification: Optional[str]
    centipawn_loss: Optional[float]
    best_move_uci: Optional[str]
    
    class Config:
        from_attributes = True


class GameBase(BaseModel):
    white_player: str
    black_player: str
    result: str
    date_played: datetime


class GameResponse(GameBase):
    id: int
    chess_com_url: Optional[str]
    white_elo: Optional[int]
    black_elo: Optional[int]
    user_color: str
    time_class: Optional[str]
    opening_eco: Optional[str]
    opening_name: Optional[str]
    is_analyzed: bool
    accuracy: Optional[float]
    num_blunders: int
    num_mistakes: int
    num_inaccuracies: int
    
    class Config:
        from_attributes = True


class GameDetailResponse(GameResponse):
    pgn: str
    moves: List[MoveResponse]
    average_centipawn_loss: Optional[float]


class GameImportRequest(BaseModel):
    chess_com_username: Optional[str] = None
    from_year: Optional[int] = None  # e.g., 2023
    from_month: Optional[int] = None  # 1-12
    to_year: Optional[int] = None
    to_month: Optional[int] = None
    import_all: bool = True  # If True, ignores date filters


class GameImportProgress(BaseModel):
    status: str
    current: int
    total: int
    message: str


# Statistics Schemas
class UserStatsResponse(BaseModel):
    total_games: int
    total_wins: int
    total_losses: int
    total_draws: int
    white_games: int
    white_wins: int
    black_games: int
    black_wins: int
    avg_accuracy: Optional[float]
    avg_centipawn_loss: Optional[float]
    total_blunders: int
    total_mistakes: int
    total_inaccuracies: int
    
    class Config:
        from_attributes = True


class OpeningStatsItem(BaseModel):
    opening_eco: str
    opening_name: str
    games_played: int
    wins: int
    losses: int
    draws: int
    win_rate: float
    avg_accuracy: Optional[float]


class TimeControlStats(BaseModel):
    time_class: str
    games_played: int
    wins: int
    losses: int
    draws: int
    win_rate: float


class PerformanceOverTime(BaseModel):
    date: str  # YYYY-MM format
    games: int
    wins: int
    losses: int
    draws: int
    win_rate: float
    avg_accuracy: Optional[float]


class DashboardStats(BaseModel):
    user_stats: UserStatsResponse
    recent_games: List[GameResponse]
    opening_stats: List[OpeningStatsItem]
    time_control_stats: List[TimeControlStats]
    performance_over_time: List[PerformanceOverTime]


# Opening Schemas
class OpeningResponse(BaseModel):
    id: int
    eco_code: str
    name: str
    pgn_moves: str
    
    class Config:
        from_attributes = True

