-- Migration: Add puzzle analysis cache table
-- Stores deep analysis results for puzzle positions (game_id, move_id -> solution moves)

CREATE TABLE IF NOT EXISTS puzzle_analysis_cache (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id),
    move_id INTEGER NOT NULL REFERENCES moves(id),
    solution_uci_list TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, move_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_puzzle_cache_game_move ON puzzle_analysis_cache(game_id, move_id);
