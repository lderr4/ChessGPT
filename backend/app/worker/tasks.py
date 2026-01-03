import asyncio
import logging
from datetime import datetime
from app.worker.celery_app import celery_app
from app.services.analysis_service import AnalysisService
from app.services.stats_service import StatsService
from app.services.redis_pubsub import redis_pubsub
from app.database import SessionLocal
from app.models import Game, Move, AnalysisJob
from app.logging_config import setup_logging

# Set up logging with datetime for Celery tasks
setup_logging()
logger = logging.getLogger(__name__)

@celery_app.task(name="analyze_game_task")
def analyze_game_task(game_id: int):
    """
    Celery task to analyze a single chess game.
    """
    logger.info(f"Starting analysis task for game {game_id}")
    db = SessionLocal()
    start_time = datetime.utcnow()
    
    try:
        # 1. Fetch game from DB
        logger.debug(f"Fetching game {game_id} from database")
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            logger.warning(f"Game {game_id} not found in database")
            return f"Game {game_id} not found"

        logger.info(f"Game {game_id} found: {game.white_player} vs {game.black_player}, user_color={game.user_color}")

        # 2. Check if already analyzed
        if game.analysis_state == "analyzed":
            logger.info(f"Game {game_id} already analyzed, skipping")
            return f"Game {game_id} already analyzed, skipping"

        # 3. Ensure state is in_progress
        if game.analysis_state != "in_progress":
            logger.info(f"Setting game {game_id} analysis_state to 'in_progress' (was: {game.analysis_state})")
            game.analysis_state = "in_progress"
            db.commit()
        else:
            logger.debug(f"Game {game_id} already in 'in_progress' state")

        # 4. Run Stockfish Analysis (async function)
        logger.info(f"Starting Stockfish analysis for game {game_id} (depth={AnalysisService().depth}, time_limit={AnalysisService().time_limit}s)")
        analyzer = AnalysisService()
        result = asyncio.run(analyzer.analyze_game(game.pgn, game.user_color))
        
        analysis_duration = (datetime.utcnow() - start_time).total_seconds()
        logger.info(f"Stockfish analysis completed for game {game_id} in {analysis_duration:.2f}s")

        # 5. Handle errors
        if "error" in result:
            error_msg = result['error']
            logger.error(f"Error analyzing game {game_id}: {error_msg}")
            # Mark as analyzed with 0 stats so we don't retry
            game.is_analyzed = True
            game.analysis_state = "analyzed"
            game.num_moves = 0
            game.analyzed_at = datetime.utcnow()
            db.commit()
            return f"Error analyzing game {game_id}: {error_msg}"

        # 6. Update game with analysis results
        stats = result.get("stats", {})
        num_moves = stats.get("num_moves", 0)
        accuracy = stats.get("accuracy")
        avg_cp_loss = stats.get("average_centipawn_loss")
        blunders = stats.get("num_blunders", 0)
        mistakes = stats.get("num_mistakes", 0)
        inaccuracies = stats.get("num_inaccuracies", 0)
        
        # Format values safely for logging (handle None values)
        accuracy_str = f"{accuracy:.1f}%" if accuracy is not None else "N/A"
        avg_cp_loss_str = f"{avg_cp_loss:.1f}" if avg_cp_loss is not None else "N/A"
        
        logger.info(f"Analysis results for game {game_id}: {num_moves} moves, accuracy={accuracy_str}, "
                   f"avg_cp_loss={avg_cp_loss_str}, blunders={blunders}, mistakes={mistakes}, inaccuracies={inaccuracies}")
        
        game.is_analyzed = True
        game.analysis_state = "analyzed"
        game.num_moves = num_moves
        game.average_centipawn_loss = avg_cp_loss
        game.accuracy = accuracy
        game.num_blunders = blunders
        game.num_mistakes = mistakes
        game.num_inaccuracies = inaccuracies
        game.analyzed_at = datetime.utcnow()

        # 7. Store move analysis
        moves_data = result.get("moves", [])
        logger.debug(f"Saving {len(moves_data)} move analysis records for game {game_id}")
        for move_data in moves_data:
            move = Move(
                game_id=game_id,
                **move_data
            )
            db.add(move)

        db.commit()
        logger.info(f"Game {game_id} analysis completed successfully, state set to 'analyzed'")

        # 8. Update user stats after analysis
        logger.debug(f"Updating user stats for user {game.user_id}")
        StatsService.calculate_user_stats(db, game.user_id)
        logger.debug(f"User stats updated for user {game.user_id}")
        
        # 9. Update any active analysis jobs for this user
        # Only update jobs that started before this game was analyzed
        active_jobs = db.query(AnalysisJob).filter(
            AnalysisJob.user_id == game.user_id,
            AnalysisJob.status == "processing",
            AnalysisJob.started_at.isnot(None)
        ).all()
        
        for job in active_jobs:
            # Count games that were analyzed after the job started
            # This ensures we only count games that are part of this batch
            analyzed_count = db.query(Game).filter(
                Game.user_id == game.user_id,
                Game.analysis_state == "analyzed",
                Game.analyzed_at >= job.started_at
            ).count()
            
            # Update job progress
            if job.total_games > 0:
                job.analyzed_games = min(analyzed_count, job.total_games)  # Cap at total_games
                job.progress = int((job.analyzed_games / job.total_games) * 100)
                
                # Check if all games are done
                if job.analyzed_games >= job.total_games:
                    job.status = "completed"
                    job.completed_at = datetime.utcnow()
                    job.progress = 100
                    logger.info(f"Analysis job {job.id} completed: {job.analyzed_games}/{job.total_games} games analyzed")
                
                db.commit()
                logger.debug(f"Updated job {job.id} progress: {job.progress}% ({job.analyzed_games}/{job.total_games})")
        
        total_duration = (datetime.utcnow() - start_time).total_seconds()
        logger.info(f"Analysis task completed for game {game_id} in {total_duration:.2f}s total")
        
        # Publish completion event to Redis for SSE
        try:
            success = redis_pubsub.publish_game_completed(game.user_id, game_id)
            if success:
                logger.debug(f"SSE event published successfully for game {game_id} (user {game.user_id})")
            else:
                logger.warning(f"Failed to publish SSE event for game {game_id}, but analysis completed successfully")
        except Exception as e:
            logger.warning(f"Exception while publishing SSE event for game {game_id}: {e}", exc_info=True)
            # Don't fail the task if SSE publishing fails
        
        return f"Game {game_id} analysis complete"
    
    except Exception as e:
        db.rollback()
        logger.exception(f"Exception occurred while analyzing game {game_id}: {e}")
        # Mark as analyzed to prevent infinite retries
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game and game.analysis_state != "analyzed":
                logger.warning(f"Marking game {game_id} as analyzed due to error to prevent retries")
                game.is_analyzed = True
                game.analysis_state = "analyzed"
                game.num_moves = 0
                game.analyzed_at = datetime.utcnow()
                db.commit()
        except Exception as e2:
            logger.error(f"Error marking game {game_id} as analyzed: {e2}")
        return f"Error analyzing game {game_id}: {str(e)}"
    finally:
        db.close()
        logger.debug(f"Database session closed for game {game_id}")


@celery_app.task(name="batch_analyze_games_task")
def batch_analyze_games_task(user_id: int, job_id: int):
    """
    Celery task to batch analyze all unanalyzed games for a user.
    Dispatches individual game analysis tasks to the queue.
    """
    logger.info(f"Starting batch analysis task for user {user_id}, job {job_id}")
    db = SessionLocal()
    
    try:
        # 1. Fetch the analysis job
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            logger.error(f"Analysis job {job_id} not found")
            return f"Analysis job {job_id} not found"
        
        # 2. Update job status
        job.status = "processing"
        job.started_at = datetime.utcnow()
        db.commit()
        logger.info(f"Analysis job {job_id} marked as processing")
        
        # 3. Get all unanalyzed games for this user
        games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.analysis_state != "analyzed"
        ).all()
        
        job.total_games = len(games)
        db.commit()
        logger.info(f"Found {len(games)} unanalyzed games for user {user_id}")
        
        if len(games) == 0:
            logger.info(f"No games to analyze for user {user_id}")
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.progress = 100
            db.commit()
            return {"job_id": job_id, "analyzed": 0}
        
        # 4. Dispatch each game to the analysis queue
        logger.info(f"Dispatching {len(games)} games to analysis queue")
        for i, game in enumerate(games):
            # Set state to in_progress
            game.analysis_state = "in_progress"
            db.commit()
            
            # Dispatch to Celery queue
            analyze_game_task.delay(game.id)
            logger.debug(f"Dispatched game {game.id} to analysis queue ({i+1}/{len(games)})")
        
        logger.info(f"All {len(games)} games dispatched to analysis queue for job {job_id}")
        
        # Note: Individual analyze_game_task will update job progress via a callback
        # For now, we'll mark the job as processing and let it be updated by individual tasks
        # or by a monitoring mechanism
        
        return {
            "job_id": job_id,
            "total_games": len(games),
            "status": "dispatched"
        }
        
    except Exception as e:
        db.rollback()
        logger.exception(f"Exception occurred in batch analysis task for job {job_id}: {e}")
        try:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.utcnow()
                db.commit()
        except Exception as e2:
            logger.error(f"Error updating job status: {e2}")
        return f"Error in batch analysis job {job_id}: {str(e)}"
    finally:
        db.close()

