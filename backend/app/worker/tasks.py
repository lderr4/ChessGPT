from app.celery_app import celery_app
from app.services.analysis_service import AnalysisService
from app.database import SessionLocal
from app.models import Game # Adjust based on your model name

@celery_app.task(name="analyze_game_task")
def analyze_game_task(game_id: int):
    """
    Background task to analyze a single chess game.
    """
    db = SessionLocal()
    try:
        # 1. Fetch game from DB
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            return f"Game {game_id} not found"

        # 2. Update status to 'processing'
        game.status = "analyzing"
        db.commit()

        # 3. Run Stockfish Analysis
        # Note: We initialize inside the task so each worker has its own instance
        analyzer = AnalysisService()
        analysis_results = analyzer.analyze_game(game.pgn)

        # 4. Save results and update status
        game.analysis_data = analysis_results
        game.status = "completed"
        db.commit()
        
        return f"Game {game_id} analysis complete"
    
    except Exception as e:
        db.rollback()
        return f"Error analyzing game {game_id}: {str(e)}"
    finally:
        db.close()