from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ..database import get_db
from ..models import User, Game, Move, ImportJob
from ..schemas import (
    GameResponse, 
    GameDetailResponse, 
    GameImportRequest,
    MoveResponse,
    PositionAnalysisRequest,
    PositionAnalysisResponse
)
from ..auth import get_current_user
from ..services.chess_com_service import ChessComService
from ..services.analysis_service import AnalysisService
from ..services.stats_service import StatsService

router = APIRouter(prefix="/games", tags=["Games"])


def import_games_background(
    user_id: int, 
    chess_com_username: str, 
    job_id: int,
    db: Session,
    from_year: int = None,
    from_month: int = None,
    to_year: int = None,
    to_month: int = None
):
    """Background task to import and analyze games"""
    job = db.query(ImportJob).filter(ImportJob.id == job_id).first()
    
    try:
        # Update job status
        job.status = "processing"
        job.started_at = datetime.utcnow()
        job.progress = 5
        db.commit()
        
        # Fetch games from Chess.com
        chess_com_service = ChessComService()
        job.progress = 10
        db.commit()
        
        parsed_games = chess_com_service.fetch_and_parse_games(
            chess_com_username,
            from_year=from_year,
            from_month=from_month,
            to_year=to_year,
            to_month=to_month
        )
        
        job.total_games = len(parsed_games)
        job.progress = 30
        db.commit()
        
        # Get existing game IDs to avoid duplicates
        existing_ids = {
            game.chess_com_id 
            for game in db.query(Game.chess_com_id).filter(Game.user_id == user_id).all()
            if game.chess_com_id
        }
        
        # Import new games
        new_games_count = 0
        for idx, game_data in enumerate(parsed_games):
            chess_com_id = game_data.get("chess_com_id")
            
            # Skip if already imported
            if chess_com_id and chess_com_id in existing_ids:
                continue
            
            # Create game record
            new_game = Game(
                user_id=user_id,
                **game_data
            )
            db.add(new_game)
            new_games_count += 1
            
            # Update progress
            if idx % 10 == 0:
                job.imported_games = new_games_count
                job.progress = 30 + int((idx / len(parsed_games)) * 50)
                db.commit()
        
        db.commit()
        
        job.imported_games = new_games_count
        job.progress = 85
        db.commit()
        
        # Update user's last import time and current rating
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.last_import_at = datetime.utcnow()
            # Get most recent game rating
            latest_game = db.query(Game).filter(
                Game.user_id == user_id,
                Game.user_rating.isnot(None)
            ).order_by(Game.date_played.desc()).first()
            if latest_game:
                user.current_rating = latest_game.user_rating
            db.commit()
        
        # Recalculate stats
        StatsService.calculate_user_stats(db, user_id)
        
        # Mark job as completed
        job.status = "completed"
        job.progress = 100
        job.completed_at = datetime.utcnow()
        db.commit()
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error importing games: {error_msg}")
        job.status = "failed"
        job.error_message = error_msg
        job.completed_at = datetime.utcnow()
        db.commit()
        db.rollback()


async def analyze_game_background(game_id: int, db: Session):
    """Background task to analyze a single game"""
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game or game.is_analyzed:
            return
        
        # Analyze the game
        analysis_service = AnalysisService()
        result = await analysis_service.analyze_game(game.pgn, game.user_color)
        
        if "error" in result:
            error_msg = result['error']
            print(f"Error analyzing game {game_id}: {error_msg}")
            # Mark as analyzed with 0 stats so we don't retry
            game.is_analyzed = True
            game.num_moves = 0
            game.analyzed_at = datetime.utcnow()
            db.commit()
            return
        
        # Update game with analysis results
        stats = result.get("stats", {})
        game.is_analyzed = True
        game.num_moves = stats.get("num_moves", 0)
        game.average_centipawn_loss = stats.get("average_centipawn_loss")
        game.accuracy = stats.get("accuracy")
        game.num_blunders = stats.get("num_blunders", 0)
        game.num_mistakes = stats.get("num_mistakes", 0)
        game.num_inaccuracies = stats.get("num_inaccuracies", 0)
        game.analyzed_at = datetime.utcnow()
        
        # Store move analysis
        for move_data in result.get("moves", []):
            move = Move(
                game_id=game_id,
                **move_data
            )
            db.add(move)
        
        db.commit()
        
        # Update user stats after analysis
        StatsService.calculate_user_stats(db, game.user_id)
        
    except Exception as e:
        print(f"Error analyzing game {game_id}: {e}")
        # Mark as analyzed to prevent infinite retries
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game and not game.is_analyzed:
                game.is_analyzed = True
                game.num_moves = 0
                game.analyzed_at = datetime.utcnow()
                db.commit()
        except:
            pass
        db.rollback()


@router.post("/import", status_code=202)
def import_games(
    background_tasks: BackgroundTasks,
    import_request: GameImportRequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Import games from Chess.com with optional date filtering"""
    
    # Default import request if not provided
    if not import_request:
        import_request = GameImportRequest()
    
    # Determine which Chess.com username to use
    chess_com_username = None
    if import_request.chess_com_username:
        chess_com_username = import_request.chess_com_username
    elif current_user.chess_com_username:
        chess_com_username = current_user.chess_com_username
    else:
        raise HTTPException(
            status_code=400,
            detail="No Chess.com username provided. Please set one in your profile or provide it in the request."
        )
    
    # Extract date parameters
    from_year = None if import_request.import_all else import_request.from_year
    from_month = None if import_request.import_all else import_request.from_month
    to_year = None if import_request.import_all else import_request.to_year
    to_month = None if import_request.import_all else import_request.to_month
    
    # Create import job
    import_job = ImportJob(
        user_id=current_user.id,
        status="pending",
        progress=0
    )
    db.add(import_job)
    db.commit()
    db.refresh(import_job)
    
    # Start background import
    background_tasks.add_task(
        import_games_background, 
        current_user.id, 
        chess_com_username,
        import_job.id,
        db,
        from_year,
        from_month,
        to_year,
        to_month
    )
    
    date_range = ""
    if not import_request.import_all and (from_year or to_year):
        date_range = f" from {from_year or 'start'}/{from_month or 1} to {to_year or 'present'}/{to_month or 12}"
    
    return {
        "job_id": import_job.id,
        "message": f"Game import started{date_range}",
        "status": "pending"
    }


@router.get("/import/status/{job_id}")
def get_import_status(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the status of an import job"""
    
    job = db.query(ImportJob).filter(
        ImportJob.id == job_id,
        ImportJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    
    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "total_games": job.total_games,
        "imported_games": job.imported_games,
        "error_message": job.error_message,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at
    }


@router.get("/", response_model=List[GameResponse])
def get_games(
    skip: int = 0,
    limit: int = 50,
    time_class: Optional[str] = None,
    result: Optional[str] = None,
    opening_eco: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's games with optional filtering"""
    
    query = db.query(Game).filter(Game.user_id == current_user.id)
    
    # Apply filters
    if time_class:
        query = query.filter(Game.time_class == time_class)
    if result:
        query = query.filter(Game.result == result)
    if opening_eco:
        query = query.filter(Game.opening_eco == opening_eco)
    
    # Order by most recent first
    query = query.order_by(Game.date_played.desc())
    
    # Pagination
    games = query.offset(skip).limit(limit).all()
    
    return games


@router.get("/{game_id}", response_model=GameDetailResponse)
def get_game(
    game_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific game"""
    
    game = db.query(Game).filter(
        Game.id == game_id,
        Game.user_id == current_user.id
    ).first()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Get moves
    moves = db.query(Move).filter(Move.game_id == game_id).order_by(Move.half_move).all()
    
    # Create response
    game_dict = {
        "id": game.id,
        "chess_com_url": game.chess_com_url,
        "white_player": game.white_player,
        "black_player": game.black_player,
        "white_elo": game.white_elo,
        "black_elo": game.black_elo,
        "user_color": game.user_color,
        "result": game.result,
        "date_played": game.date_played,
        "time_class": game.time_class,
        "opening_eco": game.opening_eco,
        "opening_name": game.opening_name,
        "is_analyzed": game.is_analyzed,
        "accuracy": game.accuracy,
        "num_blunders": game.num_blunders,
        "num_mistakes": game.num_mistakes,
        "num_inaccuracies": game.num_inaccuracies,
        "pgn": game.pgn,
        "moves": moves,
        "average_centipawn_loss": game.average_centipawn_loss,
    }
    
    return game_dict


@router.post("/{game_id}/analyze", status_code=202)
async def analyze_game(
    game_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger analysis for a specific game"""
    
    game = db.query(Game).filter(
        Game.id == game_id,
        Game.user_id == current_user.id
    ).first()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game.is_analyzed:
        return {"message": "Game already analyzed", "status": "completed"}
    
    # Start background analysis
    background_tasks.add_task(analyze_game_background, game_id, db)
    
    return {
        "message": "Game analysis started",
        "status": "processing"
    }


@router.post("/analyze/position", response_model=PositionAnalysisResponse)
async def analyze_position(
    request: PositionAnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """Analyze a specific chess position (FEN string)"""
    
    analysis_service = AnalysisService()
    result = await analysis_service.analyze_position(request.fen)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    # Add FEN to the response
    result["fen"] = request.fen
    
    return result


@router.delete("/{game_id}", status_code=204)
def delete_game(
    game_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a game"""
    
    game = db.query(Game).filter(
        Game.id == game_id,
        Game.user_id == current_user.id
    ).first()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    db.delete(game)
    db.commit()
    
    # Recalculate stats
    StatsService.calculate_user_stats(db, current_user.id)
    
    return None

