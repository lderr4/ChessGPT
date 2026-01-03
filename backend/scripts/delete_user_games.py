"""
Script to delete all games for a specific user.
This will:
- Delete all Game records for the user (cascade deletes Move records)
- Optionally reset UserStats
- Optionally delete ImportJob and AnalysisJob records

Usage:
    cd backend
    python -m scripts.delete_user_games <user_id_or_username>
    or
    python scripts/delete_user_games.py <user_id_or_username>
    or from Docker:
    docker compose exec api python scripts/delete_user_games.py <user_id_or_username>
    
Examples:
    python scripts/delete_user_games.py 1          # Delete games for user ID 1
    python scripts/delete_user_games.py myuser     # Delete games for username "myuser"
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
from app.models import Game, Move, User, UserStats, ImportJob, AnalysisJob

# Get DATABASE_URL from environment (required)
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ Error: DATABASE_URL environment variable is required")
    print("   Make sure you have a .env file or environment variables set")
    sys.exit(1)

# Create database connection directly (bypassing app.config)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def delete_user_games(user_identifier: str, confirm: bool = False):
    """
    Delete all games for a user by ID or username.
    
    Args:
        user_identifier: User ID (as string) or username
        confirm: If False, will ask for confirmation before deleting
    """
    db = SessionLocal()
    
    try:
        # Find user by ID or username
        try:
            # Try as ID first
            user_id = int(user_identifier)
            user = db.query(User).filter(User.id == user_id).first()
        except ValueError:
            # Not a number, try as username
            user = db.query(User).filter(User.username == user_identifier).first()
            user_id = user.id if user else None
        
        if not user:
            print(f"❌ Error: User not found: {user_identifier}")
            return False
        
        print(f"📋 User found: ID={user.id}, Username={user.username}, Email={user.email}")
        
        # Count games to delete
        game_count = db.query(Game).filter(Game.user_id == user.id).count()
        move_count = db.query(Move).join(Game).filter(Game.user_id == user.id).count()
        
        print(f"\n📊 Games to delete:")
        print(f"   - Games: {game_count}")
        print(f"   - Moves (analysis data): {move_count}")
        
        if game_count == 0:
            print("✅ No games to delete!")
            return True
        
        # Confirmation
        if not confirm:
            print(f"\n⚠️  WARNING: This will permanently delete all {game_count} games for user '{user.username}'!")
            response = input("   Type 'DELETE' to confirm: ")
            if response != "DELETE":
                print("❌ Deletion cancelled.")
                return False
        
        # Delete moves first (to satisfy foreign key constraints)
        print(f"\n🗑️  Deleting moves (analysis data)...")
        # Delete moves for all games owned by this user using a subquery
        deleted_moves = db.query(Move).filter(
            Move.game_id.in_(db.query(Game.id).filter(Game.user_id == user.id))
        ).delete(synchronize_session=False)
        print(f"   ✅ Deleted {deleted_moves} move records")
        
        # Now delete games
        print(f"🗑️  Deleting games...")
        deleted_games = db.query(Game).filter(Game.user_id == user.id).delete()
        print(f"   ✅ Deleted {deleted_games} games")
        
        # Delete import and analysis jobs
        deleted_import_jobs = db.query(ImportJob).filter(ImportJob.user_id == user.id).delete()
        deleted_analysis_jobs = db.query(AnalysisJob).filter(AnalysisJob.user_id == user.id).delete()
        print(f"   ✅ Deleted {deleted_import_jobs} import jobs")
        print(f"   ✅ Deleted {deleted_analysis_jobs} analysis jobs")
        
        # Reset user stats
        user_stats = db.query(UserStats).filter(UserStats.user_id == user.id).first()
        if user_stats:
            # Reset all stats fields
            user_stats.total_games = 0
            user_stats.total_wins = 0
            user_stats.total_losses = 0
            user_stats.total_draws = 0
            user_stats.white_games = 0
            user_stats.white_wins = 0
            user_stats.black_games = 0
            user_stats.black_wins = 0
            user_stats.avg_accuracy = None
            user_stats.total_analyzed_games = 0
            print(f"   ✅ Reset user stats")
        
        # Reset user import tracking
        user.last_import_at = None
        user.current_rating = None
        
        db.commit()
        print(f"\n✅ Successfully deleted all games for user '{user.username}' (ID: {user.id})")
        return True
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error deleting games: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ Error: User ID or username required")
        print("\nUsage:")
        print("  python scripts/delete_user_games.py <user_id_or_username>")
        print("\nExamples:")
        print("  python scripts/delete_user_games.py 1")
        print("  python scripts/delete_user_games.py myusername")
        sys.exit(1)
    
    user_identifier = sys.argv[1]
    
    # Check for --yes flag for non-interactive mode
    confirm = "--yes" in sys.argv or "-y" in sys.argv
    
    success = delete_user_games(user_identifier, confirm=confirm)
    sys.exit(0 if success else 1)

