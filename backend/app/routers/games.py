from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json
import asyncio
import logging
from sse_starlette.sse import EventSourceResponse
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
from ..auth import get_current_user, decode_token
from ..config import settings
from ..services.chess_com_service import ChessComService
from ..services.analysis_service import AnalysisService
from ..services.stats_service import StatsService
from ..services.redis_pubsub import redis_pubsub
from ..worker.tasks import analyze_game_task, import_games_task, import_lichess_games_task

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

router = APIRouter(prefix="/games", tags=["Games"])


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
    import_request: GameImportRequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import games from Chess.com with optional date filtering.
    Uses Celery queue to ensure only one import happens at a time globally.
    Includes idempotency check to prevent duplicate imports.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Default import request if not provided
    if not import_request:
        import_request = GameImportRequest()
    
    # IDEMPOTENCY CHECK: Prevent duplicate imports if user already has a pending/processing job
    existing_job = db.query(ImportJob).filter(
        ImportJob.user_id == current_user.id,
        ImportJob.status.in_(["pending", "processing"])
    ).first()
    
    if existing_job:
        logger.warning(
            f"User {current_user.id} already has an active import job {existing_job.id} "
            f"(status: {existing_job.status})"
        )
        raise HTTPException(
            status_code=409,  # 409 Conflict
            detail=f"You already have an import job in progress. Job #{existing_job.id} is currently {existing_job.status}."
        )
    
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
    
    logger.info(f"Created import job {import_job.id} for user {current_user.id}, username: {chess_com_username}")
    
    # Dispatch to Celery queue (imports queue with concurrency=1)
    task = import_games_task.delay(
        current_user.id,
        chess_com_username,
        import_job.id,
        from_year,
        from_month,
        to_year,
        to_month
    )
    logger.info(f"Import task queued for job {import_job.id} with task_id={task.id}")
    
    date_range = ""
    if not import_request.import_all and (from_year or to_year):
        date_range = f" from {from_year or 'start'}/{from_month or 1} to {to_year or 'present'}/{to_month or 12}"
    
    return {
        "job_id": import_job.id,
        "message": f"Game import queued{date_range}",
        "status": "pending"
    }


@router.post("/import/lichess", status_code=202)
def import_lichess_games(
    import_request: GameImportRequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import games from Lichess.org with optional date filtering.
    Uses Celery queue to ensure only one import happens at a time globally.
    Includes idempotency check to prevent duplicate imports.
    """
    logger.info(f"Lichess import request from user {current_user.id}")
    
    # Default import request if not provided
    if not import_request:
        import_request = GameImportRequest()
    
    # IDEMPOTENCY CHECK: Prevent duplicate imports if user already has a pending/processing job
    existing_job = db.query(ImportJob).filter(
        ImportJob.user_id == current_user.id,
        ImportJob.status.in_(["pending", "processing"])
    ).first()
    
    if existing_job:
        logger.warning(
            f"User {current_user.id} already has an active import job {existing_job.id} "
            f"(status: {existing_job.status})"
        )
        raise HTTPException(
            status_code=409,  # 409 Conflict
            detail=f"You already have an import job in progress. Job #{existing_job.id} is currently {existing_job.status}."
        )
    
    # Determine which Lichess username to use
    lichess_username = None
    if import_request.lichess_username:
        lichess_username = import_request.lichess_username
    elif current_user.lichess_username:
        lichess_username = current_user.lichess_username
    else:
        raise HTTPException(
            status_code=400,
            detail="No Lichess username provided. Please set one in your profile or provide it in the request."
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
    
    logger.info(f"Created Lichess import job {import_job.id} for user {current_user.id}, username: {lichess_username}")
    
    # Dispatch to Celery queue (imports queue with concurrency=1)
    task = import_lichess_games_task.delay(
        current_user.id,
        lichess_username,
        import_job.id,
        from_year,
        from_month,
        to_year,
        to_month
    )
    logger.info(f"Lichess import task queued for job {import_job.id} with task_id={task.id}")
    
    date_range = ""
    if not import_request.import_all and (from_year or to_year):
        date_range = f" from {from_year or 'start'}/{from_month or 1} to {to_year or 'present'}/{to_month or 12}"
    
    return {
        "job_id": import_job.id,
        "message": f"Lichess game import queued{date_range}",
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
        "lichess_url": game.lichess_url,
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
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Analysis request received for game {game_id} by user {current_user.id} (force={force})")
    
    # 1. Standard Validation & DB fetching
    game = db.query(Game).filter(
        Game.id == game_id,
        Game.user_id == current_user.id
    ).first()
    
    if not game:
        logger.warning(f"Game {game_id} not found for user {current_user.id}")
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game.analysis_state == "analyzed" and not force:
        logger.info(f"Game {game_id} already analyzed, skipping")
        return {"message": "Game already analyzed", "status": "completed"}
    
    # 2. Prepare the DB for the worker
    if force and game.analysis_state == "analyzed":
        logger.info(f"Force re-analysis requested for game {game_id}, deleting existing moves")
        deleted_moves = db.query(Move).filter(Move.game_id == game_id).delete()
        logger.debug(f"Deleted {deleted_moves} existing move records")
        game.is_analyzed = False
        game.analyzed_at = None

    game.analysis_state = "in_progress"
    db.commit()
    logger.info(f"Game {game_id} marked as 'in_progress' and queued for analysis")
    
    # 3. THE MAGIC LINE: Dispatch to Redis
    # Instead of BackgroundTasks, we send a message to the worker container
    task = analyze_game_task.delay(game_id)
    logger.info(f"Analysis task queued for game {game_id} with task_id={task.id}")
    
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


@router.post("/analyze/all", status_code=202)
def analyze_all_games(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start batch analysis of all unanalyzed games using Celery queue"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Check if user already has a processing job
    existing_job = db.query(AnalysisJob).filter(
        AnalysisJob.user_id == current_user.id,
        AnalysisJob.status.in_(["pending", "processing"])
    ).first()
    
    if existing_job:
        logger.warning(f"User {current_user.id} already has an active analysis job {existing_job.id}")
        raise HTTPException(
            status_code=429,
            detail=f"You already have an analysis job in progress. Job #{existing_job.id} is currently {existing_job.status}."
        )
    
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
    
    logger.info(f"Created analysis job {job.id} for user {current_user.id}")
    
    # Dispatch to Celery queue instead of BackgroundTasks
    from ..worker.tasks import batch_analyze_games_task
    task = batch_analyze_games_task.delay(current_user.id, job.id)
    logger.info(f"Batch analysis task queued for job {job.id} with task_id={task.id}")
    
    return {
        "message": "Batch analysis queued",
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


@router.post("/analyze/cancel")
def cancel_active_analysis_job(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel any active analysis job for the current user (when job ID is unknown)."""
    existing_job = db.query(AnalysisJob).filter(
        AnalysisJob.user_id == current_user.id,
        AnalysisJob.status.in_(["pending", "processing"])
    ).first()
    
    if not existing_job:
        raise HTTPException(
            status_code=404,
            detail="No active analysis job found"
        )
    
    return _do_cancel_job(db, current_user, existing_job.id)


@router.post("/analyze/cancel/{job_id}")
def cancel_analysis_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a stuck or in-progress analysis job by ID (e.g. after server restart)."""
    return _do_cancel_job(db, current_user, job_id)


def _do_cancel_job(db: Session, current_user: User, job_id: int):
    """Shared logic to cancel an analysis job and reset stuck games."""
    
    job = db.query(AnalysisJob).filter(
        AnalysisJob.id == job_id,
        AnalysisJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    
    if job.status not in ("pending", "processing"):
        raise HTTPException(
            status_code=400,
            detail=f"Job is already {job.status}, cannot cancel"
        )
    
    # Mark job as cancelled
    job.status = "cancelled"
    job.completed_at = datetime.utcnow()
    job.error_message = "Cancelled by user"
    
    # Reset games stuck in in_progress so they can be re-analyzed
    stuck_count = db.query(Game).filter(
        Game.user_id == current_user.id,
        Game.analysis_state == "in_progress"
    ).update({"analysis_state": "unanalyzed"}, synchronize_session=False)
    
    db.commit()
    
    logger.info(
        f"Cancelled analysis job {job_id} for user {current_user.id}, "
        f"reset {stuck_count} stuck games to unanalyzed"
    )
    
    return {
        "message": "Job cancelled",
        "job_id": job_id,
        "reset_games": stuck_count
    }


async def get_current_user_from_token_or_query(
    token: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current user from either Authorization header or query parameter.
    This allows EventSource (which doesn't support headers) to authenticate via query param.
    """
    # Try query parameter first (for EventSource)
    auth_token = token_query or token
    
    if not auth_token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        token_data = decode_token(auth_token)
        user = db.query(User).filter(User.username == token_data.username).first()
        
        if user is None:
            raise HTTPException(
                status_code=401,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=400,
                detail="Inactive user"
            )
        
        return user
    except Exception as e:
        logger.warning(f"Authentication failed for SSE endpoint: {e}")
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/events/analysis")
async def stream_analysis_events(
    current_user: User = Depends(get_current_user_from_token_or_query)
):
    """
    Server-Sent Events endpoint for real-time game analysis updates.
    
    Frontend can subscribe to this endpoint to receive notifications when games
    finish analyzing. Events are streamed via SSE as they occur.
    
    Authentication can be provided via:
    - Authorization header: `Bearer <token>` (standard)
    - Query parameter: `?token=<token>` (for EventSource compatibility)
    
    Returns:
        EventSourceResponse: SSE stream of game analysis completion events
    """
    logger.info(f"SSE connection established for user {current_user.id} (username: {current_user.username})")
    
    async def event_generator():
        """Generator function that yields SSE events from Redis"""
        pubsub = None
        try:
            # Get Redis subscriber for this user
            pubsub = redis_pubsub.get_subscriber(current_user.id)
            
            # Send initial connection message
            yield {
                "event": "connected",
                "data": json.dumps({
                    "message": "Connected to analysis events stream",
                    "user_id": current_user.id,
                    "timestamp": datetime.utcnow().isoformat()
                })
            }
            logger.debug(f"Sent connection event to user {current_user.id}")
            
            # Listen for messages from Redis
            while True:
                try:
                    # Check for new messages (non-blocking with timeout)
                    message = pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True)
                    
                    if message and message['type'] == 'message':
                        # Parse the message data
                        try:
                            data = json.loads(message['data'])
                            logger.debug(
                                f"Received Redis message for user {current_user.id}: "
                                f"game_id={data.get('game_id')}, type={data.get('type')}"
                            )
                            
                            # Send SSE event to frontend
                            yield {
                                "event": "game_analysis_completed",
                                "data": json.dumps(data)
                            }
                            logger.info(
                                f"Sent SSE event to user {current_user.id}: "
                                f"game {data.get('game_id')} analysis completed"
                            )
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to parse Redis message as JSON: {e}, message={message}")
                        except Exception as e:
                            logger.error(f"Error processing Redis message: {e}", exc_info=True)
                    
                    # Yield empty comment to keep connection alive
                    await asyncio.sleep(0.1)
                    
                except asyncio.CancelledError:
                    logger.info(f"SSE connection cancelled for user {current_user.id}")
                    break
                except Exception as e:
                    logger.error(f"Error in SSE stream for user {current_user.id}: {e}", exc_info=True)
                    # Send error event to client
                    yield {
                        "event": "error",
                        "data": json.dumps({
                            "error": "Stream error occurred",
                            "message": str(e)
                        })
                    }
                    await asyncio.sleep(1)  # Wait before retrying
                    
        except Exception as e:
            logger.error(f"Fatal error in SSE stream for user {current_user.id}: {e}", exc_info=True)
            yield {
                "event": "error",
                "data": json.dumps({
                    "error": "Fatal stream error",
                    "message": str(e)
                })
            }
        finally:
            # Clean up Redis subscription
            if pubsub:
                try:
                    pubsub.close()
                    logger.info(f"Closed Redis subscription for user {current_user.id}")
                except Exception as e:
                    logger.warning(f"Error closing Redis subscription for user {current_user.id}: {e}")
    
    return EventSourceResponse(event_generator())


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

