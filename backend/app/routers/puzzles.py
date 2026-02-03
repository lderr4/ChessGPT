from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import PuzzleResponse
from ..auth import get_current_user
from ..services.puzzle_service import get_next_puzzle

router = APIRouter(prefix="/puzzles", tags=["Puzzles"])


@router.get("/next", response_model=PuzzleResponse)
def get_next(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the next puzzle for the current user from their analyzed games."""
    puzzle = get_next_puzzle(db, current_user.id)
    if not puzzle:
        raise HTTPException(
            status_code=404,
            detail="No puzzles available. Analyze more games to unlock puzzles from your mistakes.",
        )
    return puzzle
