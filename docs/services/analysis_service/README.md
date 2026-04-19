# Analysis Service

Stockfish-backed game and position analysis. Produces per-move evaluations, classifications, and optional coach commentary for a complete game.

---

## Configuration

Reads from `backend/app/config.py` (populated via `.env`):

| Setting | Default | Description |
|---|---|---|
| `STOCKFISH_PATH` | `/usr/games/stockfish` | Path to Stockfish binary |
| `STOCKFISH_DEPTH` | `20` | Search depth per position |
| `STOCKFISH_TIME_LIMIT` | `1.0` | Max seconds per position |

Stockfish path differs between Docker (`/usr/games/stockfish`) and local dev — set `STOCKFISH_PATH` accordingly.

---

## Public API

### `analyze_game(pgn_string, user_color) → Dict`

Main entry point. Analyzes every move in a game and returns per-move data plus aggregate stats.

**Performance:** Uses a single Stockfish analysis per position. `eval_after` from move N is reused as `eval_before` for move N+1, halving the number of engine calls vs. a naive before/after approach. A 40-move game requires ~41 analyses rather than ~80.

**Returns:**
```python
{
    "moves": [
        {
            "move_number": int,
            "is_white": bool,
            "half_move": int,           # ply index (0-based)
            "move_san": str,
            "move_uci": str,
            "evaluation_before": float, # CP from white's perspective
            "evaluation_after": float,  # CP from white's perspective
            "best_move_uci": str,
            "classification": str,      # see Move Classification below
            "centipawn_loss": float,
            "coach_commentary": str | None,
        },
        ...
    ],
    "stats": {
        "num_moves": int,
        "accuracy": float,          # 0–100
        "num_blunders": int,
        "num_mistakes": int,
        "num_inaccuracies": int,
        "average_centipawn_loss": None,  # not stored in DB
    }
}
```

**Accuracy formula:** `max(0, min(100, 100 - avg_cp_loss / 10))` — only the user's moves count toward the average.

---

### `analyze_position(fen) → Dict`

Analyzes a single FEN position. Used by the puzzles and ad-hoc position endpoints.

**Returns:**
```python
{
    "evaluation": float,    # CP, side-to-move perspective
    "best_move": str,       # UCI
    "best_move_san": str,   # SAN
    "mate_in": int | None,
}
```

---

### `detect_opening(pgn_string) → (eco_code, opening_name, ply)`

Reads ECO/Opening headers from the PGN. Caps at 20 ply regardless of game length.

---

## Move Classification

`classify_move(cp_loss, eval_before, eval_after)` — all evaluations are from the **moving player's perspective** before this method is called.

### Thresholds

| Classification | Condition |
|---|---|
| `best` | CP loss ≤ 10 |
| `excellent` | CP loss ≤ 25 |
| `good` | CP loss ≤ 50 |
| `inaccuracy` | CP loss 50–150, position after still ≥ -1.0 pawns |
| `mistake` | CP loss 150–300, or inaccuracy range but position after < -1.0 |
| `blunder` | CP loss ≥ 300, or position swings (see below) |

### Blunder position swings

A move is always a blunder if any of these are true regardless of raw CP loss:
- Winning (> +1.5) → Losing (< -1.5)
- Equal (±0.5) → Clearly losing (< -2.0)
- Slightly better (+0.5 to +1.5) → Clearly losing (< -2.0)

### Mistake position swings

A move is always a mistake if:
- Large advantage (> +2.0) → Equal (±0.5)
- Winning (> +2.5) → Only slightly better (+0.5 to +1.5)

### Perspective handling

Stockfish returns evaluations from the **side-to-move's perspective**. For black moves, `eval_before` is negated before computing `cp_loss` so that loss is always a positive number when a move is bad. Both `eval_before` and `eval_after` are also negated before being passed to `classify_move`, keeping the "winning = positive" convention consistent.

Stored `evaluation_after` is negated relative to the raw engine output so both stored fields represent **white's perspective**.

---

## Mate Score Encoding

Mate scores are mapped to large centipawn values to keep the numeric pipeline uniform:

| Situation | Value |
|---|---|
| Mate in N (winning) | `10000 - N * 100` |
| Mate in N (losing) | `-10000 - N * 100` |

---

## Coach Commentary

Generated for the user's blunders and mistakes only, capped at **5 per game** to limit analysis time. Each call has a **25-second timeout**; if it expires the move is stored without commentary and analysis continues.

Coach is disabled by default (`ENABLE_COACH=false`). Set `ENABLE_COACH=true` and configure `COACH_PROVIDER` (`ollama` or `openai`) to enable it.

---

## Potential Improvements

### WDL-based classification

Stockfish 12+ supports native Win/Draw/Loss probability output via the `UCI_ShowWDL` option. This returns raw probability counts (out of 1000) rather than centipawns, avoiding the arbitrary scale problem with CP and handling draws correctly.

Enable with:
```python
engine.configure({"UCI_ShowWDL": "true"})
```

Access via `info["wdl"]` — a `PovWdl` with `.wins`, `.draws`, `.losses` attributes.

Win probability: `(wdl.wins + wdl.draws / 2) / 1000`

Classification thresholds would shift from CP loss to **win% loss**, matching Chess.com's model:

| Classification | Win% lost |
|---|---|
| Best | 0.00 |
| Excellent | 0.00–0.02 |
| Good | 0.02–0.05 |
| Inaccuracy | 0.05–0.10 |
| Mistake | 0.10–0.20 |
| Blunder | 0.20+ |

This would eliminate the hand-tuned position-context special cases in `classify_move`, as the win% swing captures those scenarios naturally.
