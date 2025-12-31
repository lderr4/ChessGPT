from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ..database import get_db
from ..models import User, Game, Move, ImportJob, AnalysisJob
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
from ..worker.celery_app import analyze_game_task

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


async def analyze_game_background(game_id: int):
    """Background task to analyze a single game"""
    # Create a new database session for the background task
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            print(f"ERROR: Game {game_id} not found in background task")
            return
        
        print(f"Background task: Game {game_id} current analysis_state is '{game.analysis_state}'")
        
        if game.analysis_state == "analyzed":
            print(f"Game {game_id} already analyzed, skipping")
            return
        
        # Ensure state is in_progress (in case it wasn't set)
        if game.analysis_state != "in_progress":
            print(f"WARNING: Game {game_id} state is '{game.analysis_state}', setting to 'in_progress'")
            game.analysis_state = "in_progress"
            db.commit()
            db.refresh(game)
            print(f"✓ Game {game_id} analysis_state set to 'in_progress' in background task")
        else:
            print(f"✓ Game {game_id} already has analysis_state 'in_progress'")
        
        # Analyze the game
        analysis_service = AnalysisService()
        result = await analysis_service.analyze_game(game.pgn, game.user_color)
        
        if "error" in result:
            error_msg = result['error']
            print(f"Error analyzing game {game_id}: {error_msg}")
            # Mark as analyzed with 0 stats so we don't retry
            game.is_analyzed = True
            game.analysis_state = "analyzed"
            game.num_moves = 0
            game.analyzed_at = datetime.utcnow()
            db.commit()
            return
        
        # Update game with analysis results
        stats = result.get("stats", {})
        game.is_analyzed = True
        game.analysis_state = "analyzed"
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
        db.refresh(game)
        print(f"Game {game_id} analysis completed, state set to 'analyzed'")
        
        # Update user stats after analysis
        StatsService.calculate_user_stats(db, game.user_id)
        
    except Exception as e:
        print(f"Error analyzing game {game_id}: {e}")
        import traceback
        traceback.print_exc()
        # Mark as analyzed to prevent infinite retries
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game and game.analysis_state != "analyzed":
                game.is_analyzed = True
                game.analysis_state = "analyzed"
                game.num_moves = 0
                game.analyzed_at = datetime.utcnow()
                db.commit()
                db.refresh(game)
                print(f"Game {game_id} marked as analyzed due to error")
        except Exception as e2:
            print(f"Error marking game {game_id} as analyzed: {e2}")
        db.rollback()
    finally:
        db.close()


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
    analysis_state: Optional[str] = None,
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
    if analysis_state:
        query = query.filter(Game.analysis_state == analysis_state)
    
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
        "analysis_state": game.analysis_state,
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
    force: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Standard Validation & DB fetching
    game = db.query(Game).filter(
        Game.id == game_id,
        Game.user_id == current_user.id
    ).first()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game.analysis_state == "analyzed" and not force:
        return {"message": "Game already analyzed", "status": "completed"}
    
    # 2. Prepare the DB for the worker
    if force and game.analysis_state == "analyzed":
        db.query(Move).filter(Move.game_id == game_id).delete()
        game.is_analyzed = False
        game.analyzed_at = None

    game.analysis_state = "in_progress"
    db.commit()
    
    # 3. THE MAGIC LINE: Dispatch to Redis
    # Instead of BackgroundTasks, we send a message to the worker container
    analyze_game_task.delay(game_id)
    
    return {
        "message": "Analysis queued in cloud" if not force else "Re-analysis queued",
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


async def analyze_all_games_background(user_id: int, job_id: int, db: Session):
    """Background task to analyze all unanalyzed games for a user"""
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    
    try:
        # Update job status
        job.status = "processing"
        job.started_at = datetime.utcnow()
        db.commit()
        
        # Get all unanalyzed games for this user
        games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.analysis_state != "analyzed"
        ).all()
        
        job.total_games = len(games)
        db.commit()
        
        if len(games) == 0:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.progress = 100
            db.commit()
            return
        
        # Analyze each game
        analysis_service = AnalysisService()
        for i, game in enumerate(games):
            try:
                # Set state to in_progress
                game.analysis_state = "in_progress"
                db.commit()
                
                result = await analysis_service.analyze_game(game.pgn, game.user_color)
                
                if "error" not in result:
                    # Update game with analysis results
                    stats = result.get("stats", {})
                    game.is_analyzed = True
                    game.analysis_state = "analyzed"
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
                            game_id=game.id,
                            **move_data
                        )
                        db.add(move)
                    
                    job.analyzed_games += 1
                else:
                    # Mark as analyzed even if error to prevent retry
                    game.is_analyzed = True
                    game.analysis_state = "analyzed"
                    game.analyzed_at = datetime.utcnow()
                
                # Update progress
                job.progress = int(((i + 1) / len(games)) * 100)
                db.commit()
                
            except Exception as e:
                print(f"Error analyzing game {game.id}: {e}")
                # Mark as analyzed to prevent infinite retries
                game.is_analyzed = True
                game.analysis_state = "analyzed"
                game.analyzed_at = datetime.utcnow()
                db.commit()
        
        # Update user stats after all analysis
        StatsService.calculate_user_stats(db, user_id)
        
        # Mark job as completed
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        job.progress = 100
        db.commit()
        
    except Exception as e:
        print(f"Batch analysis job failed: {e}")
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        db.commit()


@router.post("/analyze/all", status_code=202)
def analyze_all_games(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start batch analysis of all unanalyzed games"""
    
    # Create analysis job
    job = AnalysisJob(
        user_id=current_user.id,
        status="pending",
        progress=0,
        total_games=0,
        analyzed_games=0
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Start background analysis
    background_tasks.add_task(analyze_all_games_background, current_user.id, job.id, db)
    
    return {
        "message": "Batch analysis started",
        "job_id": job.id,
        "status": "pending"
    }


@router.get("/analyze/status/{job_id}")
def get_analysis_status(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the status of a batch analysis job"""
    
    job = db.query(AnalysisJob).filter(
        AnalysisJob.id == job_id,
        AnalysisJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    
    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "total_games": job.total_games,
        "analyzed_games": job.analyzed_games,
        "error_message": job.error_message,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at
    }


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

