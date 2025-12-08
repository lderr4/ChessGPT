from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User
from ..schemas import (
    UserStatsResponse,
    OpeningStatsItem,
    TimeControlStats,
    PerformanceOverTime,
    DashboardStats
)
from ..auth import get_current_user
from ..services.stats_service import StatsService

router = APIRouter(prefix="/stats", tags=["Statistics"])


@router.get("/", response_model=UserStatsResponse)
def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get overall user statistics"""
    
    # Calculate/update stats if needed
    StatsService.calculate_user_stats(db, current_user.id)
    
    # Get stats from database
    user_stats = db.query(User).filter(User.id == current_user.id).first().stats
    
    return user_stats


@router.get("/openings", response_model=List[OpeningStatsItem])
def get_opening_stats(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get statistics by opening"""
    
    opening_stats = StatsService.get_opening_stats(db, current_user.id, limit=limit)
    return opening_stats


@router.get("/time-controls", response_model=List[TimeControlStats])
def get_time_control_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get statistics by time control"""
    
    time_control_stats = StatsService.get_time_control_stats(db, current_user.id)
    return time_control_stats


@router.get("/performance-over-time", response_model=List[PerformanceOverTime])
def get_performance_over_time(
    months: int = 12,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get performance statistics over time"""
    
    performance = StatsService.get_performance_over_time(db, current_user.id, months=months)
    return performance


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all statistics for the dashboard"""
    
    dashboard_data = StatsService.get_dashboard_data(db, current_user.id)
    return dashboard_data


@router.post("/recalculate", status_code=202)
def recalculate_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Force recalculation of user statistics"""
    
    StatsService.calculate_user_stats(db, current_user.id)
    
    return {
        "message": "Statistics recalculated successfully",
        "status": "completed"
    }


@router.get("/errors-by-phase")
def get_errors_by_phase(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get error distribution by game phase (opening/middlegame/endgame)"""
    
    error_stats = StatsService.get_error_analysis_by_phase(db, current_user.id)
    return error_stats


@router.get("/win-loss-correlation")
def get_win_loss_correlation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get correlation between errors and game outcomes"""
    
    correlation = StatsService.get_win_loss_error_correlation(db, current_user.id)
    return correlation


@router.get("/performance-by-phase")
def get_performance_by_phase(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get performance statistics by game phase"""
    
    phase_performance = StatsService.get_performance_by_phase(db, current_user.id)
    return phase_performance
