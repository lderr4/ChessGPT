"""
Verifies that Stockfish returns evaluations from the side-to-move's perspective.

Specifically confirms:
  - score.relative.cp is positive when the side to move is better off
  - After White's move (Black to move), a White-favourable position returns a NEGATIVE relative score
  - After Black's move (White to move), a White-favourable position returns a POSITIVE relative score
  - The sign alternates every half-move, matching the alternating-perspective assumption in analyze_game

Run inside the Docker container:
  docker exec -it chess_analytics_api python -m scripts.verify_stockfish_perspective

Or locally (set STOCKFISH_PATH):
  STOCKFISH_PATH=/usr/games/stockfish python backend/scripts/verify_stockfish_perspective.py
"""

import asyncio
import os
import chess
import chess.engine
import chess.pgn
from io import StringIO

STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH", "/usr/games/stockfish")

# A short opening where White has a consistent slight edge
TEST_PGN = """
[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 *
"""

DEPTH = 15


async def main():
    print(f"Stockfish path: {STOCKFISH_PATH}\n")

    transport, engine = await chess.engine.popen_uci(STOCKFISH_PATH)

    pgn_io = StringIO(TEST_PGN)
    game = chess.pgn.read_game(pgn_io)
    board = game.board()

    moves = list(game.mainline_moves())
    all_positions = [board.copy()]  # positions[i] = board state before move i
    for move in moves:
        board.push(move)
        all_positions.append(board.copy())

    print(f"{'Half-move':<12} {'Side to move':<14} {'score.relative.cp':<22} {'score.white().cp':<20} {'Interpretation'}")
    print("-" * 95)

    prev_white_cp = None
    for i, pos in enumerate(all_positions):
        side_to_move = "White" if pos.turn == chess.WHITE else "Black"

        info = await engine.analyse(pos, chess.engine.Limit(depth=DEPTH))
        score = info["score"]

        relative_cp = score.relative.cp  # from side-to-move's perspective
        white_cp = score.white().cp      # always from White's perspective

        # Confirm: relative_cp == white_cp when White to move, == -white_cp when Black to move
        expected_relative = white_cp if pos.turn == chess.WHITE else (-white_cp if white_cp is not None else None)
        perspective_matches = (relative_cp == expected_relative)

        # Confirm alternating sign: relative_cp from move to move should flip sign
        # (assuming roughly equal or slowly drifting position)
        sign_flipped = None
        if prev_white_cp is not None and white_cp is not None:
            # relative_cp should be roughly -(previous relative_cp) for a stable position
            sign_flipped = (relative_cp is not None and prev_white_cp is not None and
                            ((relative_cp > 0) != (prev_white_cp > 0) or relative_cp == 0))

        interp = f"{'perspective_ok' if perspective_matches else 'MISMATCH'}"
        if sign_flipped is not None:
            interp += f", sign_flipped={'yes' if sign_flipped else 'no'}"

        print(f"{i:<12} {side_to_move:<14} {str(relative_cp):<22} {str(white_cp):<20} {interp}")

        prev_white_cp = relative_cp

    await engine.quit()

    print()
    print("KEY TAKEAWAY")
    print("------------")
    print("score.relative.cp alternates sign each half-move because the side to move alternates.")
    print("When White is better (+ve white_cp):")
    print("  - On White's turn:  relative_cp is POSITIVE  (good for White = good for side to move)")
    print("  - On Black's turn:  relative_cp is NEGATIVE  (good for White = bad for side to move)")
    print()
    print("This is why analyze_game stores eval_after_raw (the unmodified Stockfish output)")
    print("and passes it directly as eval_before for the next move — the perspective is already")
    print("correct for the next side to move.")


if __name__ == "__main__":
    asyncio.run(main())
