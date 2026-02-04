"""
Puzzle service: derives puzzle positions from analyzed game moves.
Each puzzle is a position where the user made a mistake; the solution comes from deep engine analysis.
Uses on-demand deep analysis with multipv to find one or more valid solutions.
"""
import asyncio
import chess
import chess.pgn
import chess.engine
import json
import logging
from io import StringIO
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from ..models import Game, Move, PuzzleAnalysisCache
from ..config import settings

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


def _get_evaluation_cp(score) -> Optional[float]:
    """Extract centipawn evaluation from engine score (side to move perspective)."""
    if not score:
        return None
    if score.is_mate():
        mate_in = score.relative.mate()
        if mate_in > 0:
            return 10000 - mate_in * 100
        return -10000 - mate_in * 100
    cp = score.relative.cp
    return float(cp) if cp is not None else None


async def _deep_analyze_position(fen: str) -> Optional[List[str]]:
    """
    Run deep multipv analysis on a position. Returns list of valid solution UCI moves.
    Moves within MULTIPV_THRESHOLD_CP of the best are considered correct.
    """
    try:
        board = chess.Board(fen)
    except Exception as e:
        logger.warning(f"Invalid FEN for puzzle analysis: {e}")
        return None

    try:
        transport, engine = await chess.engine.popen_uci(settings.STOCKFISH_PATH)
        limit = chess.engine.Limit(
            depth=settings.PUZZLE_ANALYSIS_DEPTH,
            time=settings.PUZZLE_ANALYSIS_TIME,
        )

        # multipv=5: engine returns list of InfoDict (one per line) in python-chess
        result = await engine.analyse(board, limit, multipv=5)
        await engine.quit()

        # Handle both list (multipv>1) and single dict (fallback)
        if isinstance(result, list):
            infos = result
        elif result:
            infos = [result]
        else:
            infos = []

        if not infos:
            return None

        lines = []
        for info in infos:
            pv = info.get("pv", [])
            score = info.get("score")
            if not pv:
                continue
            move_uci = pv[0].uci()
            eval_cp = _get_evaluation_cp(score)
            lines.append({"move": move_uci, "eval": eval_cp})

        if not lines:
            return None

        # Dedupe by move (keep first occurrence = best)
        seen = set()
        unique_lines = []
        for line in lines:
            if line["move"] not in seen:
                seen.add(line["move"])
                unique_lines.append(line)

        best_eval = unique_lines[0]["eval"]
        solutions = []
        for line in unique_lines:
            line_eval = line["eval"]
            if best_eval is None or line_eval is None:
                solutions.append(line["move"])
            elif abs(best_eval - line_eval) <= settings.PUZZLE_MULTIPV_SOLUTION_THRESHOLD_CP:
                solutions.append(line["move"])
            else:
                break

        return solutions if solutions else [unique_lines[0]["move"]]
    except Exception as e:
        logger.exception(f"Deep puzzle analysis failed: {e}")
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
    Pick a random puzzle candidate, run deep analysis (or use cache), return puzzle data.
    """
    import random

    candidates = get_puzzle_candidates(db, user_id)
    if not candidates:
        return None

    random.shuffle(candidates)
    for candidate in candidates:
        fen = fen_from_pgn_at_half_move(candidate["pgn"], candidate["half_move"])
        if not fen:
            logger.debug(
                f"Skipping candidate game {candidate['game_id']} move {candidate['move_id']}: "
                "FEN derivation failed"
            )
            continue

        game_id = candidate["game_id"]
        move_id = candidate["move_id"]

        # Check cache first
        cached = (
            db.query(PuzzleAnalysisCache)
            .filter(
                PuzzleAnalysisCache.game_id == game_id,
                PuzzleAnalysisCache.move_id == move_id,
            )
            .first()
        )

        if cached:
            solution_list = json.loads(cached.solution_uci_list)
        else:
            # Run deep analysis (blocking call from sync context)
            solution_list = asyncio.run(_deep_analyze_position(fen))
            if not solution_list:
                logger.debug(
                    f"Deep analysis returned no solutions for game {game_id} move {move_id}"
                )
                continue

            # Cache the result
            try:
                cache_entry = PuzzleAnalysisCache(
                    game_id=game_id,
                    move_id=move_id,
                    solution_uci_list=json.dumps(solution_list),
                )
                db.add(cache_entry)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning(f"Failed to cache puzzle analysis: {e}")

        # Get the previous move for highlighting
        last_move = None
        if candidate["half_move"] > 0:
            prev_move = (
                db.query(Move)
                .filter(
                    Move.game_id == game_id,
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
            "puzzle_id": f"{game_id}_{move_id}",
            "fen": fen,
            "solution_uci": solution_list[0],
            "solution_uci_list": solution_list,
            "game_id": game_id,
            "move_id": move_id,
            "user_color": candidate["user_color"],
            "last_move": last_move,
            "date_played": candidate["date_played"].isoformat() if candidate["date_played"] else None,
            "white_player": candidate["white_player"],
            "black_player": candidate["black_player"],
            "white_elo": candidate["white_elo"],
            "black_elo": candidate["black_elo"],
        }

    return None
