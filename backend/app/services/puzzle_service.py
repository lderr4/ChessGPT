"""
Puzzle service: derives puzzle positions from analyzed game moves.
Each puzzle is a position where the user made a mistake; the solution is the engine's best move.
"""
import chess
import chess.pgn
import logging
from io import StringIO
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from ..models import Game, Move

logger = logging.getLogger(__name__)


def fen_from_pgn_at_half_move(pgn_string: str, half_move: int) -> Optional[str]:
    """
    Derive FEN from a game PGN at a given half-move (ply).
    Returns the position BEFORE the move at that half_move was played.

    Args:
        pgn_string: Full PGN of the game
        half_move: Ply count (0 = initial position, 1 = after first move, etc.)

    Returns:
        FEN string, or None if PGN is invalid or half_move is out of range
    """
    try:
        pgn_io = StringIO(pgn_string)
        game = chess.pgn.read_game(pgn_io)
        if not game:
            return None

        board = game.board()
        ply = 0

        for node in game.mainline():
            if ply >= half_move:
                break
            board.push(node.move)
            ply += 1

        if ply != half_move:
            # half_move was beyond the game length
            return None

        return board.fen()
    except Exception as e:
        logger.warning(f"Failed to derive FEN from PGN at half_move {half_move}: {e}")
        return None


def get_puzzle_candidates(db: Session, user_id: int) -> List[Dict[str, Any]]:
    """
    Get moves that qualify as puzzle positions: user mistakes/blunders with a clear best move.
    Only includes positions where it is the user's turn (the highlighted previous move is the opponent's).
    """
    candidates = (
        db.query(Move, Game)
        .join(Game, Move.game_id == Game.id)
        .filter(
            Game.user_id == user_id,
            Game.analysis_state == "analyzed",
            Move.best_move_uci.isnot(None),
            Move.classification.in_(["mistake", "blunder"]),
            # Only user's turn: user played white and white to move, or user played black and black to move
            or_(
                and_(Game.user_color == "white", Move.is_white == True),
                and_(Game.user_color == "black", Move.is_white == False),
            ),
        )
        .all()
    )

    result = []
    for move, game in candidates:
        result.append(
            {
                "move_id": move.id,
                "game_id": game.id,
                "half_move": move.half_move,
                "pgn": game.pgn,
                "best_move_uci": move.best_move_uci,
                "classification": move.classification,
                "user_color": game.user_color,
                "date_played": game.date_played,
                "white_player": game.white_player,
                "black_player": game.black_player,
                "white_elo": game.white_elo,
                "black_elo": game.black_elo,
            }
        )
    return result


def get_next_puzzle(db: Session, user_id: int) -> Optional[Dict[str, Any]]:
    """
    Pick a random puzzle candidate, compute its FEN, and return puzzle data.
    """
    import random

    candidates = get_puzzle_candidates(db, user_id)
    if not candidates:
        return None

    # Shuffle and try until we get a valid FEN
    random.shuffle(candidates)
    for candidate in candidates:
        fen = fen_from_pgn_at_half_move(candidate["pgn"], candidate["half_move"])
        if fen:
            # Get the previous move (the move that led to this position) for highlighting
            last_move = None
            if candidate["half_move"] > 0:
                prev_move = (
                    db.query(Move)
                    .filter(
                        Move.game_id == candidate["game_id"],
                        Move.half_move == candidate["half_move"] - 1,
                    )
                    .first()
                )
                if prev_move and prev_move.move_uci and len(prev_move.move_uci) >= 4:
                    last_move = {
                        "from_square": prev_move.move_uci[:2],
                        "to_square": prev_move.move_uci[2:4],
                    }

            return {
                "puzzle_id": f"{candidate['game_id']}_{candidate['move_id']}",
                "fen": fen,
                "solution_uci": candidate["best_move_uci"],
                "game_id": candidate["game_id"],
                "move_id": candidate["move_id"],
                "user_color": candidate["user_color"],
                "last_move": last_move,
                "date_played": candidate["date_played"].isoformat() if candidate["date_played"] else None,
                "white_player": candidate["white_player"],
                "black_player": candidate["black_player"],
                "white_elo": candidate["white_elo"],
                "black_elo": candidate["black_elo"],
            }
        logger.debug(
            f"Skipping candidate game {candidate['game_id']} move {candidate['move_id']}: "
            "FEN derivation failed"
        )

    return None
