"""
Script to clear all game analyses from the database.
This will:
- Delete all Move records (analysis data)
- Reset all Game analysis fields to unanalyzed state
- Optionally reset UserStats analysis fields
- Optionally clear AnalysisJob records

Usage:
    cd backend
    python -m scripts.clear_analyses
    or
    python scripts/clear_analyses.py
    or from Docker:
    docker compose exec api python scripts/clear_analyses.py
"""

import sys
import os
from pathlib import Path

# Add the backend directory to the path so we can import app modules
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

# Load environment variables from .env file if it exists
from dotenv import load_dotenv
env_path = Path(backend_dir) / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    # Try loading from parent directory (for Docker)
    parent_env = Path(backend_dir).parent / ".env"
    if parent_env.exists():
        load_dotenv(parent_env)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Game, Move, UserStats, AnalysisJob

# Get DATABASE_URL from environment (required)
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ Error: DATABASE_URL environment variable is required")
    print("   Make sure you have a .env file or environment variables set")
    sys.exit(1)

# Create database connection directly (bypassing app.config)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def clear_all_analyses(reset_stats: bool = True, clear_jobs: bool = True):
    """
    Clear all analyses from the database.
    
    Args:
        reset_stats: If True, reset analysis-related fields in UserStats
        clear_jobs: If True, delete all AnalysisJob records
    """
    from sqlalchemy.orm import Session
    db: Session = SessionLocal()
    
    try:
        print("Starting analysis cleanup...")
        
        # 1. Delete all Move records (contains analysis data)
        moves_count = db.query(Move).count()
        print(f"Deleting {moves_count} move records...")
        db.query(Move).delete()
        
        # 2. Reset all Game analysis fields
        games_to_reset = db.query(Game).filter(
            Game.analysis_state.in_(["in_progress", "analyzed"])
        ).all()
        
        print(f"Resetting {len(games_to_reset)} games...")
        for game in games_to_reset:
            game.analysis_state = "unanalyzed"
            game.is_analyzed = False
            game.average_centipawn_loss = None
            game.accuracy = None
            game.num_moves = None
            game.num_blunders = 0
            game.num_mistakes = 0
            game.num_inaccuracies = 0
            game.analyzed_at = None
        
        # 3. Reset UserStats analysis fields (optional)
        if reset_stats:
            stats_count = db.query(UserStats).count()
            print(f"Resetting analysis stats for {stats_count} users...")
            db.query(UserStats).update({
                "avg_accuracy": None,
                "avg_centipawn_loss": None,
                "total_blunders": 0,
                "total_mistakes": 0,
                "total_inaccuracies": 0,
            })
        
        # 4. Clear AnalysisJob records (optional)
        if clear_jobs:
            jobs_count = db.query(AnalysisJob).count()
            print(f"Deleting {jobs_count} analysis job records...")
            db.query(AnalysisJob).delete()
        
        # Commit all changes
        db.commit()
        
        print("\n✅ Analysis cleanup completed successfully!")
        print(f"   - Deleted {moves_count} move records")
        print(f"   - Reset {len(games_to_reset)} games to 'unanalyzed'")
        if reset_stats:
            print(f"   - Reset analysis stats for all users")
        if clear_jobs:
            print(f"   - Deleted all analysis job records")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Clear all game analyses from the database")
    parser.add_argument(
        "--keep-stats",
        action="store_true",
        help="Keep UserStats analysis fields (don't reset them)"
    )
    parser.add_argument(
        "--keep-jobs",
        action="store_true",
        help="Keep AnalysisJob records (don't delete them)"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("⚠️  WARNING: This will clear ALL game analyses!")
    print("=" * 60)
    response = input("Are you sure you want to continue? (yes/no): ")
    
    if response.lower() not in ["yes", "y"]:
        print("Aborted.")
        sys.exit(0)
    
    clear_all_analyses(
        reset_stats=not args.keep_stats,
        clear_jobs=not args.keep_jobs
    )

